/**
 * User/agent-facing runtime invoke failure formatting (mirrors Problems handoff).
 */

import { sha256Digest } from '../crowdy-agent/schema.js';
import { matchApiDocCards, formatApiDocCards } from './api-doc-cards.js';
import {
  extractEnclosingRustBlock,
  type ExtractedRustBlock,
} from './rust-block-extract.js';

export interface RuntimeFailureCause {
  hostCall?: string;
  kind?: string;
  message?: string;
  detail?: Record<string, string | number>;
}

export interface RuntimeFailureEnvelope {
  code: string;
  summary: string;
  cause?: RuntimeFailureCause;
  remediation?: string;
  hintClass?: string;
  runId?: string;
}

export const RUNTIME_FAILURE_INTRO =
  'Fix ONLY this Crowdy Studio runtime/invoke failure. Do not invent unrelated refactors — one patch, then Test draft and re-Invoke.';

export const RUNTIME_FAILURE_WORKFLOW = [
  'Prefer workspace.file.span_replace when BEGIN_BLOCK hashes are present; otherwise workspace.file.patch.',
  'After the write, call runtime.test_draft with expectedRevision from the project manifest.',
  'Then ask the human to re-Invoke (or use runtime.invoke) to verify the fix.',
  'Do not add crates; rewrite to crowdy::api::* only.',
].join(' ');

export function parseRuntimeFailureFromExtensions(
  extensions: Record<string, unknown> | undefined,
): RuntimeFailureEnvelope | undefined {
  if (!extensions || typeof extensions !== 'object') return undefined;
  const raw = extensions.runtimeFailure;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.code !== 'string' || typeof obj.summary !== 'string') {
    return undefined;
  }
  const causeRaw = obj.cause;
  let cause: RuntimeFailureCause | undefined;
  if (causeRaw && typeof causeRaw === 'object' && !Array.isArray(causeRaw)) {
    const c = causeRaw as Record<string, unknown>;
    cause = {
      ...(typeof c.hostCall === 'string' ? { hostCall: c.hostCall } : {}),
      ...(typeof c.kind === 'string' ? { kind: c.kind } : {}),
      ...(typeof c.message === 'string' ? { message: c.message } : {}),
      ...(c.detail && typeof c.detail === 'object' && !Array.isArray(c.detail)
        ? { detail: c.detail as Record<string, string | number> }
        : {}),
    };
  }
  return {
    code: obj.code,
    summary: obj.summary,
    cause,
    ...(typeof obj.remediation === 'string'
      ? { remediation: obj.remediation }
      : {}),
    ...(typeof obj.hintClass === 'string' ? { hintClass: obj.hintClass } : {}),
    ...(typeof obj.runId === 'string' ? { runId: obj.runId } : {}),
  };
}

export function formatRuntimeFailureDisplay(
  failure: RuntimeFailureEnvelope,
  fallbackRemediation?: string,
): string {
  const lines = [failure.summary];
  if (failure.cause) {
    const chunk =
      failure.cause.detail?.chunkX != null
        ? ` (chunk ${failure.cause.detail.chunkX},${failure.cause.detail.chunkY},${failure.cause.detail.chunkZ})`
        : '';
    lines.push(
      `Cause: ${failure.cause.hostCall ?? 'host'} → ${failure.cause.kind ?? 'error'}${chunk}`,
    );
  }
  const hint = failure.remediation ?? fallbackRemediation;
  if (hint) {
    // First paragraph only for display compactness
    const first = hint.split(/\n\n/)[0]?.trim();
    if (first) lines.push(`Hint: ${first}`);
  }
  return lines.join('\n');
}

export interface FormatRuntimeFailureForAgentChatOptions {
  exportName?: string;
  serverSource?: string | null;
  projectRevision?: string | number | null;
}

export function formatRuntimeFailureForAgentChat(
  failure: RuntimeFailureEnvelope,
  options: FormatRuntimeFailureForAgentChatOptions = {},
): string {
  const parts: string[] = [RUNTIME_FAILURE_INTRO, ''];
  parts.push(`Code: ${failure.code}`);
  parts.push(`Summary: ${failure.summary}`);
  if (options.exportName) {
    parts.push(`Export: ${options.exportName}`);
  }
  if (failure.cause) {
    parts.push(
      `Cause: hostCall=${failure.cause.hostCall ?? '?'} kind=${failure.cause.kind ?? '?'}`,
    );
    if (failure.cause.message) {
      parts.push(`Cause message: ${failure.cause.message}`);
    }
    if (failure.cause.detail) {
      parts.push(`Cause detail: ${JSON.stringify(failure.cause.detail)}`);
    }
  }
  if (failure.hintClass) {
    parts.push(`Hint class: ${failure.hintClass}`);
  }
  if (failure.remediation) {
    parts.push('', failure.remediation);
  } else {
    const cards = matchApiDocCards({
      message: failure.summary,
      path: 'server/src/lib.rs',
      target: 'SERVER',
      blockText:
        failure.cause?.hostCall === 'voxel_set' ||
        failure.hintClass === 'API_SHAPE' ||
        failure.hintClass === 'GRID_BOUNDS'
          ? 'voxel_set'
          : failure.summary,
    });
    if (cards.length > 0) {
      parts.push('', formatApiDocCards(cards));
    }
  }
  parts.push('', RUNTIME_FAILURE_WORKFLOW);

  const source = options.serverSource;
  if (source && typeof source === 'string' && source.length > 0) {
    const block = findInvokeRelatedBlock(source);
    if (block) {
      const expectedBlockHash = sha256Digest(block.text);
      const expectedContentHash = sha256Digest(source);
      parts.push(
        '',
        `BEGIN_BLOCK path=SERVER/src/lib.rs startLine=${block.startLine} endLine=${block.endLine} spanStart=${block.spanStart} spanEnd=${block.spanEnd} kind=${block.kind} expectedBlockHash=${expectedBlockHash} expectedContentHash=${expectedContentHash}`,
        block.text,
        'END_BLOCK',
        '',
        'Return a fixed version of ONLY the BEGIN_BLOCK...END_BLOCK region via workspace.file.span_replace (or rewrite that region when using workspace.file.patch).',
      );
    }
  }
  if (options.projectRevision != null) {
    parts.push(`Project revision (for test_draft): ${options.projectRevision}`);
  }
  return parts.join('\n');
}

function findInvokeRelatedBlock(source: string): ExtractedRustBlock | null {
  const markers = ['fn on_invoke', 'generate_house', 'voxel_set'];
  for (const marker of markers) {
    const idx = source.indexOf(marker);
    if (idx < 0) continue;
    const before = source.slice(0, idx);
    const line = before.split('\n').length;
    const column = idx - before.lastIndexOf('\n');
    const extracted = extractEnclosingRustBlock(
      source,
      line,
      Math.max(1, column),
    );
    if (extracted) return extracted;
  }
  return null;
}
