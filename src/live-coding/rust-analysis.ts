import {
  Language,
  Parser,
  type Node as TreeSitterNode,
  type Point,
} from 'web-tree-sitter';
import type {
  CompletionItem,
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  Position,
  Range,
} from './lsp-protocol.js';
import type {
  PlatformCrate,
  PlatformIndex,
  PlatformSymbol,
  PlatformSymbolKind,
} from './platform-index.js';
import type { VirtualDocument } from './vfs.js';
import { offsetAt } from './vfs.js';

interface WorkspaceSymbol {
  name: string;
  detail: string;
  kind: number;
  uri: string;
  range: Range;
  selectionRange: Range;
}

interface AnalyzedDocument {
  version: number;
  diagnostics: Diagnostic[];
  symbols: WorkspaceSymbol[];
}

const DECLARATION_KINDS = new Map<string, number>([
  ['function_item', 12],
  ['function_signature_item', 12],
  ['struct_item', 23],
  ['enum_item', 10],
  ['trait_item', 11],
  ['type_item', 5],
  ['const_item', 14],
  ['static_item', 13],
  ['mod_item', 2],
  ['macro_definition', 12],
]);
const RUST_KEYWORDS = [
  'as',
  'async',
  'await',
  'break',
  'const',
  'continue',
  'crate',
  'dyn',
  'else',
  'enum',
  'extern',
  'false',
  'fn',
  'for',
  'if',
  'impl',
  'in',
  'let',
  'loop',
  'match',
  'mod',
  'move',
  'mut',
  'pub',
  'ref',
  'return',
  'self',
  'static',
  'struct',
  'super',
  'trait',
  'true',
  'type',
  'unsafe',
  'use',
  'where',
  'while',
];

let parserInitialization: Promise<void> | null = null;

export class RustAnalysis {
  private readonly cache = new Map<string, AnalyzedDocument>();

  private constructor(
    private readonly parser: Parser,
    private readonly platformIndex: PlatformIndex,
  ) {}

  static async create(options: {
    parserWasmUrl: string;
    grammarWasmUrl: string;
    platformIndex: PlatformIndex;
  }): Promise<RustAnalysis> {
    parserInitialization ??= Parser.init({
      locateFile: () => options.parserWasmUrl,
    });
    await parserInitialization;
    const language = await Language.load(options.grammarWasmUrl);
    const parser = new Parser();
    parser.setLanguage(language);
    return new RustAnalysis(parser, options.platformIndex);
  }

  diagnostics(document: VirtualDocument): Diagnostic[] {
    return this.analyze(document).diagnostics;
  }

  completions(
    document: VirtualDocument,
    position: Position,
    workspace: readonly VirtualDocument[],
  ): CompletionItem[] {
    const prefix = wordPrefixAt(document.text, position);
    const local = this.workspaceSymbols(workspace);
    const items: CompletionItem[] = [];
    const seen = new Set<string>();
    const add = (item: CompletionItem): void => {
      if (
        seen.has(item.label) ||
        (prefix && !item.label.toLowerCase().startsWith(prefix.toLowerCase()))
      ) {
        return;
      }
      seen.add(item.label);
      items.push(item);
    };
    for (const symbol of local) {
      add({
        label: symbol.name,
        kind: symbol.kind,
        detail: symbol.detail,
        sortText: `0-${symbol.name}`,
      });
    }
    for (const symbol of this.platformIndex.symbols) {
      add(platformCompletion(symbol, this.platformIndex));
    }
    for (const keyword of RUST_KEYWORDS) {
      add({ label: keyword, kind: 14, detail: 'Rust keyword', sortText: `2-${keyword}` });
    }
    return items.slice(0, 200);
  }

  hover(
    document: VirtualDocument,
    position: Position,
    workspace: readonly VirtualDocument[],
  ): Hover | null {
    const word = wordAt(document.text, position);
    if (!word) return null;
    const local = this.workspaceSymbols(workspace).find(
      (symbol) => symbol.name === word,
    );
    if (local) {
      return {
        contents: {
          kind: 'markdown',
          value: `\`\`\`rust\n${local.detail}\n\`\`\`\n\nDefined in \`${local.uri}\`.`,
        },
        range: wordRange(document.text, position),
      };
    }
    const platform = this.platformIndex.symbols.find(
      (symbol) =>
        symbol.name.replace(/!$/u, '').split('::').at(-1) === word,
    );
    if (!platform) return null;
    const crate = platformCrateForSymbol(this.platformIndex, platform);
    const provenance = crate
      ? `Crate ${crate.name} ${crate.version} · source ${crate.sourceHash.slice(0, 12)}…\n\n`
      : '';
    return {
      contents: {
        kind: 'markdown',
        value:
          `\`\`\`rust\n${platform.signature}\n\`\`\`\n\n` +
          `${platform.docs || `Defined in \`${platform.module}\`.`}\n\n` +
          provenance +
          `SDK ${this.platformIndex.sdkVersion} · ABI ${this.platformIndex.abiVersion}`,
      },
      range: wordRange(document.text, position),
    };
  }

  documentSymbols(document: VirtualDocument): DocumentSymbol[] {
    return this.analyze(document).symbols.map((symbol) => ({
      name: symbol.name,
      detail: symbol.detail,
      kind: symbol.kind,
      range: symbol.range,
      selectionRange: symbol.selectionRange,
    }));
  }

  definition(
    document: VirtualDocument,
    position: Position,
    workspace: readonly VirtualDocument[],
  ): Location | null {
    const word = wordAt(document.text, position);
    if (!word) return null;
    const symbol = this.workspaceSymbols(workspace).find(
      (candidate) => candidate.name === word,
    );
    return symbol
      ? { uri: symbol.uri, range: symbol.selectionRange }
      : null;
  }

  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

  dispose(): void {
    this.cache.clear();
    this.parser.delete();
  }

  private workspaceSymbols(
    documents: readonly VirtualDocument[],
  ): WorkspaceSymbol[] {
    return documents.flatMap((document) => this.analyze(document).symbols);
  }

  private analyze(document: VirtualDocument): AnalyzedDocument {
    const cached = this.cache.get(document.uri);
    if (cached?.version === document.version) return cached;
    const tree = this.parser.parse(document.text);
    if (!tree) throw new Error(`Rust parser did not produce a tree for ${document.path}`);
    try {
      const diagnostics: Diagnostic[] = [];
      const symbols: WorkspaceSymbol[] = [];
      visit(tree.rootNode, (node) => {
        if ((node.isError || node.isMissing) && diagnostics.length < 100) {
          diagnostics.push({
            range: nodeRange(document.text, node),
            severity: 1,
            source: 'crowdy-rust',
            code: node.isMissing ? 'missing-syntax' : 'syntax-error',
            message: node.isMissing
              ? `Expected ${node.type}`
              : `Unexpected Rust syntax: ${bounded(node.text, 80) || node.type}`,
          });
        }
        const kind = DECLARATION_KINDS.get(node.type);
        if (kind === undefined) return;
        const nameNode =
          node.childForFieldName('name') ??
          node.namedChildren.find((child) => child.type === 'identifier');
        if (!nameNode) return;
        const name = nameNode.text.replace(/!$/u, '');
        symbols.push({
          name,
          detail: declarationDetail(node),
          kind: node.type === 'function_item' && node.parent?.type === 'declaration_list'
            ? 6
            : kind,
          uri: document.uri,
          range: nodeRange(document.text, node),
          selectionRange: nodeRange(document.text, nameNode),
        });
      });
      const result = { version: document.version, diagnostics, symbols };
      this.cache.set(document.uri, result);
      return result;
    } finally {
      tree.delete();
    }
  }
}

function visit(node: TreeSitterNode, callback: (node: TreeSitterNode) => void): void {
  callback(node);
  for (const child of node.namedChildren) visit(child, callback);
}

function declarationDetail(node: TreeSitterNode): string {
  const firstBody = node.text.search(/[;{]/u);
  return bounded(
    (firstBody < 0 ? node.text : node.text.slice(0, firstBody)).trim(),
    500,
  );
}

function nodeRange(text: string, node: TreeSitterNode): Range {
  return {
    start: pointToPosition(text, node.startPosition),
    end: pointToPosition(text, node.endPosition),
  };
}

function pointToPosition(text: string, point: Point): Position {
  const lines = text.split('\n');
  const line = lines[point.row] ?? '';
  let bytes = 0;
  let character = 0;
  for (const value of line) {
    const width = new TextEncoder().encode(value).byteLength;
    if (bytes + width > point.column) break;
    bytes += width;
    character += value.length;
  }
  return { line: point.row, character };
}

function wordAt(text: string, position: Position): string | null {
  const offset = offsetAt(text, position);
  const left = text.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/u)?.[0] ?? '';
  const right = text.slice(offset).match(/^[A-Za-z0-9_]*/u)?.[0] ?? '';
  const word = left + right;
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(word) ? word : null;
}

function wordPrefixAt(text: string, position: Position): string {
  const offset = offsetAt(text, position);
  return text.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/u)?.[0] ?? '';
}

function wordRange(text: string, position: Position): Range {
  const offset = offsetAt(text, position);
  const left = text.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/u)?.[0] ?? '';
  const right = text.slice(offset).match(/^[A-Za-z0-9_]*/u)?.[0] ?? '';
  return {
    start: { line: position.line, character: position.character - left.length },
    end: { line: position.line, character: position.character + right.length },
  };
}

function platformCompletion(
  symbol: PlatformSymbol,
  index: PlatformIndex,
): CompletionItem {
  const crate = platformCrateForSymbol(index, symbol);
  const label =
    symbol.kind === 'field'
      ? symbol.name.split('::').at(-1)!
      : symbol.kind === 'macro' && !symbol.name.endsWith('!')
      ? `${symbol.name}!`
      : symbol.name;
  return {
    label,
    kind: platformCompletionKind(symbol.kind),
    detail:
      `${symbol.module} · ${symbol.signature}` +
      (crate ? ` · ${crate.name}@${crate.version}` : ''),
    documentation: symbol.docs,
    insertText: label,
    sortText: `1-${label}`,
  };
}

function platformCompletionKind(kind: PlatformSymbolKind): number {
  switch (kind) {
    case 'function':
    case 'method':
      return 3;
    case 'macro':
      return 15;
    case 'module':
      return 9;
    case 'const':
      return 21;
    case 'static':
      return 6;
    case 'field':
      return 5;
    case 'enum':
      return 13;
    case 'variant':
      return 20;
    case 'reexport':
      return 9;
    case 'struct':
    case 'trait':
    case 'type':
      return 7;
  }
}

function platformCrateForSymbol(
  index: PlatformIndex,
  symbol: PlatformSymbol,
): PlatformCrate | undefined {
  const moduleRoot = symbol.module.split('::', 1)[0];
  return index.crates.find(
    (crate) => crate.name.replace(/-/gu, '_') === moduleRoot,
  );
}

function bounded(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}
