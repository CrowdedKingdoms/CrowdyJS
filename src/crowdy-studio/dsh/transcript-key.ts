/**
 * Transcript remount key. Busy/Writing must not be part of this — a poll that
 * only flips the badge was wiping in-progress question dropdowns.
 */

export function dshTranscriptRenderKey(state: {
  activeSessionId: string | null;
  messages: Array<{
    seq: number;
    kind: string;
    title: string | null;
    text: string;
    answeredText?: string;
  }>;
}): string {
  return JSON.stringify({
    sessionId: state.activeSessionId,
    empty: state.messages.length === 0,
    messages: state.messages.map((message) => [
      message.seq,
      message.kind,
      message.title,
      message.text.length,
      message.text.slice(0, 80),
      message.answeredText ?? '',
    ]),
  });
}
