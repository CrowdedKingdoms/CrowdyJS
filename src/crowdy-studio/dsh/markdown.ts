/**
 * Render a subset of GFM into DOM nodes for the Harness dock.
 * Assistant replies are Markdown; user bubbles stay plain text.
 */

export function fillMarkdown(target: HTMLElement, source: string): void {
  target.replaceChildren();
  target.dataset.md = 'true';
  const blocks = parseBlocks(source.replace(/\r\n/g, '\n'));
  if (blocks.length === 0) return;
  for (const block of blocks) {
    target.append(renderBlock(block));
  }
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'hr' };

function parseBlocks(source: string): Block[] {
  const lines = source.split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (isTableRow(line) && isTableSeparator(lines[index + 1] ?? '')) {
      const headers = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index] ?? '')) {
        rows.push(splitRow(lines[index] ?? ''));
        index += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const listMatch = /^(\d+\.|[-*+])\s+(.+)$/.exec(line);
    if (listMatch) {
      const ordered = /^\d+\./.test(listMatch[1]);
      const items = [listMatch[2]];
      index += 1;
      while (index < lines.length) {
        const next = /^(\d+\.|[-*+])\s+(.+)$/.exec(lines[index] ?? '');
        if (!next) break;
        if (ordered !== /^\d+\./.test(next[1])) break;
        items.push(next[2]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (line.startsWith('> ')) {
      const quoted: string[] = [line.slice(2)];
      index += 1;
      while (index < lines.length && (lines[index] ?? '').startsWith('> ')) {
        quoted.push((lines[index] ?? '').slice(2));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quoted.join('\n') });
      continue;
    }

    const para: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? '';
      if (!next.trim()) break;
      if (next.startsWith('```')) break;
      if (/^#{1,4}\s+/.test(next)) break;
      if (/^(\d+\.|[-*+])\s+/.test(next)) break;
      if (isTableRow(next) && isTableSeparator(lines[index + 1] ?? '')) break;
      para.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && !/^[-*|:\s]+$/.test(trimmed);
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
  return /^[:\-| ]+$/.test(trimmed) && trimmed.includes('-');
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function renderBlock(block: Block): HTMLElement {
  if (block.type === 'heading') {
    const tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4';
    const heading = document.createElement(tag);
    appendInline(heading, block.text);
    return heading;
  }
  if (block.type === 'code') {
    const pre = document.createElement('pre');
    if (block.lang) pre.dataset.lang = block.lang;
    pre.textContent = block.text;
    return pre;
  }
  if (block.type === 'list') {
    const list = document.createElement(block.ordered ? 'ol' : 'ul');
    for (const item of block.items) {
      const li = document.createElement('li');
      appendInline(li, item);
      list.append(li);
    }
    return list;
  }
  if (block.type === 'table') {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.append(renderRow(block.headers, 'th'));
    table.append(thead);
    if (block.rows.length > 0) {
      const tbody = document.createElement('tbody');
      for (const row of block.rows) tbody.append(renderRow(row, 'td'));
      table.append(tbody);
    }
    return table;
  }
  if (block.type === 'quote') {
    const quote = document.createElement('blockquote');
    appendInline(quote, block.text);
    return quote;
  }
  if (block.type === 'hr') {
    return document.createElement('hr');
  }
  const paragraph = document.createElement('p');
  appendInline(paragraph, block.text);
  return paragraph;
}

function renderRow(cells: string[], tag: 'th' | 'td'): HTMLTableRowElement {
  const row = document.createElement('tr');
  for (const cell of cells) {
    const el = document.createElement(tag);
    appendInline(el, cell);
    row.append(el);
  }
  return row;
}

const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function appendInline(parent: HTMLElement, text: string): void {
  let last = 0;
  const matches = text.matchAll(INLINE);
  for (const match of matches) {
    if (match.index === undefined) continue;
    if (match.index > last) {
      parent.append(text.slice(last, match.index));
    }
    if (match[1] !== undefined) {
      const code = document.createElement('code');
      code.textContent = match[1];
      parent.append(code);
    } else if (match[2] !== undefined || match[3] !== undefined) {
      const strong = document.createElement('strong');
      appendInline(strong, match[2] ?? match[3] ?? '');
      parent.append(strong);
    } else if (match[4] !== undefined || match[5] !== undefined) {
      const em = document.createElement('em');
      appendInline(em, match[4] ?? match[5] ?? '');
      parent.append(em);
    } else if (match[6] !== undefined && match[7] !== undefined) {
      const link = document.createElement('a');
      link.href = match[7];
      link.rel = 'noreferrer noopener';
      link.target = '_blank';
      link.textContent = match[6];
      parent.append(link);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}
