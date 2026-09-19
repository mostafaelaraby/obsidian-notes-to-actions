/** Bound a single user-triggered import before it can mutate remote tasks. */
export const MAX_TASKS = 1000;

/** A parsed task with a stable identity and its original one-based note line. */
export interface ImportTask {
  sourceId: string;
  title: string;
  tags: string[];
  line: number;
}

/** One daily note's tasks, sharing a scheduled date and an Obsidian backlink. */
export interface ImportBatch {
  day: string;
  noteUrl: string;
  tasks: ImportTask[];
}

/** Progress survives a partial failure so the UI can explain what a retry will do. */
export interface ImportResult {
  created: number;
  skipped: number;
  unmatchedTags: string[];
  error?: string;
}

/** Narrow untrusted settings and API values before reading their properties. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate the whole batch before making any changes in Super Productivity. */
export function parseBatch(value: unknown): ImportBatch {
  // Date.parse accepts rolled-over dates; the ISO round trip rejects February 30, etc.
  if (
    !isRecord(value) ||
    typeof value.day !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.day) ||
    !Number.isFinite(Date.parse(value.day)) ||
    new Date(value.day).toISOString().slice(0, 10) !== value.day ||
    typeof value.noteUrl !== 'string' ||
    !value.noteUrl.startsWith('obsidian://open?') ||
    value.noteUrl.length > 10000 ||
    !Array.isArray(value.tasks) ||
    value.tasks.length > MAX_TASKS
  ) {
    throw new Error('Invalid import request. Check the daily-note date and task limit.');
  }
  // Validate every task up front, including duplicate identities within this batch.
  const ids = new Set<string>();
  for (const task of value.tasks) {
    if (
      !isRecord(task) ||
      typeof task.sourceId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(task.sourceId) ||
      ids.has(task.sourceId) ||
      typeof task.title !== 'string' ||
      !task.title.trim() ||
      task.title.length > 10000 ||
      !Number.isInteger(task.line) ||
      Number(task.line) < 1 ||
      !Array.isArray(task.tags) ||
      task.tags.length > 100 ||
      task.tags.some((tag: unknown) => typeof tag !== 'string' || !tag.trim() || tag.length > 200)
    ) {
      throw new Error('Invalid task in import request. No tasks were imported.');
    }
    ids.add(task.sourceId);
  }
  return value as unknown as ImportBatch;
}

/** Persisted marker format: retain it so imports remain recognizable across upgrades. */
export function sourceMarker(sourceId: string): string {
  return `<!-- obsidian-super-productivity:${sourceId} -->`;
}
