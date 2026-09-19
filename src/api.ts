/** Remote identity and notes are enough to detect completed or interrupted imports. */
export interface RemoteTask {
  id: string;
  notes?: string;
}

/** Fields sent when creating a task and when finalizing its literal title. */
export interface TaskFields {
  title: string;
  notes: string;
  projectId: string;
  tagIds: string[];
  dueDay: string;
}

/** Keep import policy independent of the REST transport (see docs/api.md). */
export interface TaskApi {
  getTasks(): Promise<RemoteTask[]>;
  getAllTags(): Promise<Array<{ id: string; title: string }>>;
  addTask(task: TaskFields): Promise<string>;
  updateTask(id: string, fields: TaskFields): Promise<void>;
}
