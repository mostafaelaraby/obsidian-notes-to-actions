import type { RemoteTask, TaskApi, TaskFields } from '../src/api';

/** In-memory implementation of the documented public API contract. */
export class FakeTaskApi implements TaskApi {
  tasks: Array<RemoteTask & TaskFields> = [];
  archived: Array<RemoteTask & TaskFields> = [];
  tags: Array<{ id: string; title: string }> = [];
  failUpdate = false;
  lostCreateReply = false;

  async getTasks() {
    // Match the production query, which includes archived tasks for duplicate detection.
    return [...this.tasks, ...this.archived];
  }

  async getAllTags() {
    return this.tags;
  }

  async addTask(fields: TaskFields) {
    const id = `task-${this.tasks.length}`;
    this.tasks.push({ ...fields, id });
    // Persist before failing to model a server that commits but loses the HTTP response.
    if (this.lostCreateReply) {
      this.lostCreateReply = false;
      throw new Error('Connection interrupted');
    }
    return id;
  }

  async updateTask(id: string, fields: TaskFields) {
    if (this.failUpdate) {
      throw new Error('Update failed');
    }
    const task = [...this.tasks, ...this.archived].find((value) => value.id === id);
    if (!task) {
      throw new Error('Task not found');
    }
    Object.assign(task, fields);
  }
}
