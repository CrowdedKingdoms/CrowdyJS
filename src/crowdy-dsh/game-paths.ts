/**
 * Playbook pages the agent may read: markdown the game ships under its
 * `playbookBase`. Which repository paths the game editor may touch is
 * `crowdy-studio/draft/paths.ts`.
 */

/** A relative markdown page under the playbook root. Refuses anything that leaves that tree. */
export function assertPlaybookPage(page: string): string {
  const trimmed = page.trim().replace(/^\/+/, '');
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    /[?#\0]/.test(trimmed) ||
    trimmed.startsWith('.')
  ) {
    throw new Error('Playbook pages are markdown files shipped with the game.');
  }
  if (!/^[\w./-]+\.md$/.test(trimmed)) {
    throw new Error('Name a playbook page such as playbook/authoring-loop.md.');
  }
  return trimmed;
}
