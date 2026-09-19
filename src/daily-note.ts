import { createHash } from 'node:crypto';
import { normalizePath } from 'obsidian';
import type { ImportBatch } from './import-types';
import { parseBatch } from './import-types';
import { parseNote } from './parser';

/** Paths stay vault-relative, including templates that create year/month folders. */
export function dailyNotePath(folder: string, formattedName: string): string {
  const path = [folder.trim().replace(/\\/g, '/'), formattedName.replace(/\\/g, '/')]
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/');

  // Reject absolute paths and traversal before normalizePath can remove separators.
  if (
    !path ||
    path.startsWith('/') ||
    /[\u0000-\u001f:*?"<>|]/.test(path) ||
    path.split('/').some((part) => part === '.' || part === '..' || !part)
  ) {
    throw new Error(
      'Use a vault-relative daily note folder and a filename format without invalid path characters.',
    );
  }
  return normalizePath(path.endsWith('.md') ? path : `${path}.md`);
}

/** Turn a note into a validated batch without writing to the vault. */
export function makeBatch(
  markdown: string,
  vaultId: string,
  vaultName: string,
  notePath: string,
  day: string,
): ImportBatch {
  const occurrences = new Map<string, number>();
  const tasks = parseNote(markdown).flatMap((task) => {
    // Tag order/case and source line positions must not change a task's identity.
    const key = JSON.stringify([task.title, task.tags.map((tag) => tag.toLowerCase()).sort()]);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    // Count checked siblings too, so checking one identical task doesn't renumber the others.
    if (task.completed) {
      return [];
    }

    // The occurrence number distinguishes identical checkboxes within the same note.
    const sourceId = createHash('sha256')
      .update(JSON.stringify([vaultId, notePath, key, occurrence]))
      .digest('hex');
    return [{ title: task.title, tags: task.tags, line: task.line, sourceId }];
  });

  // Encode vault names and paths independently, including spaces and URL punctuation.
  return parseBatch({
    day,
    tasks,
    noteUrl: `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(notePath)}`,
  });
}
