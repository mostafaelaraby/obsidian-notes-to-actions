import { parseBatch, sourceMarker, type ImportResult } from './import-types';
import type { TaskApi, TaskFields } from './api';

/** Import policy is independent of the HTTP transport and Obsidian UI. */
export class TaskImporter {
  private running = false;

  constructor(private readonly api: TaskApi) {}

  /** Import in note order, stopping at the first failure while retaining completed work. */
  async import(value: unknown, signal: AbortSignal): Promise<ImportResult> {
    const result: ImportResult = { created: 0, skipped: 0, unmatchedTags: [] };
    if (this.running) {
      return { ...result, error: 'The previous import is still finishing. Try again shortly.' };
    }
    this.running = true;
    let line: number | undefined;

    try {
      // Reject a bad batch before querying or mutating the remote task store.
      const batch = parseBatch(value);
      signal.throwIfAborted();
      const [tasks, tags] = await Promise.all([this.api.getTasks(), this.api.getAllTags()]);

      // Finished markers are skipped. Pending markers identify a task to repair,
      // even if the previous creation succeeded but its response never arrived.
      const existing = new Set<string>();
      const unfinished = new Map<string, string>();
      for (const task of tasks) {
        for (const match of (task.notes ?? '').matchAll(
          /<!-- obsidian-super-productivity:([a-f0-9]{64}) -->/g,
        )) {
          existing.add(match[1]!);
        }
        for (const match of (task.notes ?? '').matchAll(
          /<!-- obsidian-super-productivity-pending:([a-f0-9]{64}) -->/g,
        )) {
          unfinished.set(match[1]!, task.id);
        }
      }

      // TODAY is a special view, not a user tag. Scheduling is set through dueDay.
      const tagIds = new Map(
        tags.filter((tag) => tag.id !== 'TODAY').map((tag) => [tag.title.toLowerCase(), tag.id]),
      );

      for (const task of batch.tasks) {
        signal.throwIfAborted();
        line = task.line;
        if (existing.has(task.sourceId)) {
          result.skipped++;
          continue;
        }

        // Match existing tags only; preserve unmatched names in the final task title.
        const ids: string[] = [];
        const unmatched: string[] = [];
        for (const title of task.tags) {
          const id = tagIds.get(title.toLowerCase());
          if (id) {
            ids.push(id);
          } else {
            unmatched.push(title);
          }
        }
        const fields: TaskFields = {
          // Retain unmatched hashtags as text instead of dropping note content.
          title: [task.title, ...unmatched.map((tag) => `#${tag}`)].join(' '),
          tagIds: [...new Set(ids)],
          projectId: 'INBOX_PROJECT',
          dueDay: batch.day,
          notes: `[Open daily note](${batch.noteUrl})\n\n${sourceMarker(task.sourceId)}`,
        };

        // Check cancellation before each mutation, including when resuming a task.
        signal.throwIfAborted();
        // A neutral title prevents Super Productivity's short-syntax parser from
        // interpreting literal @dates, +projects or time estimates from the note.
        const id =
          unfinished.get(task.sourceId) ??
          (await this.api.addTask({
            ...fields,
            title: 'Obsidian task',
            notes: `[Open daily note](${batch.noteUrl})\n\n<!-- obsidian-super-productivity-pending:${task.sourceId} -->`,
          }));
        if (!id) {
          throw new Error('Task creation did not return an ID.');
        }
        signal.throwIfAborted();

        // PATCH applies the literal title and replaces the pending marker together.
        await this.api.updateTask(id, fields);
        existing.add(task.sourceId);
        result.created++;
        // Report each unmatched tag once, and only for tasks finalized successfully.
        for (const tag of unmatched) {
          if (!result.unmatchedTags.some((value) => value.toLowerCase() === tag.toLowerCase())) {
            result.unmatchedTags.push(tag);
          }
        }
      }
    } catch (error) {
      // Return partial counts instead of losing successful work behind an exception.
      const detail =
        error instanceof Error ? error.message : 'The Super Productivity API returned an error.';
      result.error = `${line ? `Stopped at note line ${line}. ` : ''}${detail}`;
    } finally {
      // A rejected or cancelled import must not block the user's next attempt.
      this.running = false;
    }
    return result;
  }
}
