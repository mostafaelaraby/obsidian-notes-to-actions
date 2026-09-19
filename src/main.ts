import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { localNow } from './date';
import { RestTaskApi } from './rest-api';
import { TaskImporter } from './importer';
import { makeBatch } from './daily-note';
import {
  loadSettings,
  pathForToday,
  SuperProductivitySettingsTab,
  type PluginSettings,
} from './settings';

/** Obsidian lifecycle, command entry points, and user-visible import progress. */
export default class SuperProductivityPlugin extends Plugin {
  declare settings: PluginSettings;
  syncing = false;
  connectionStatus = 'Not checked';
  settingsStatus?: (status: string) => void;
  // Connection checks and imports share one cancellable client per operation.
  private activeApi?: RestTaskApi;
  private unloaded = false;
  private statusEl?: HTMLElement;

  /** Register UI affordances; no network access occurs until the user requests it. */
  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    // Persist identity before importing so restarts retain the same duplicate keys.
    await this.saveSettings();
    this.statusEl = this.addStatusBarItem();
    this.addSettingTab(new SuperProductivitySettingsTab(this.app, this));
    this.addCommand({
      id: 'sync-today',
      name: 'Sync today’s tasks to Super Productivity',
      callback: () => {
        void this.syncToday();
      },
    });
    this.addRibbonIcon('list-checks', 'Sync today’s tasks to Super Productivity', () => {
      void this.syncToday();
    });
    this.connectionSettingsChanged();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  todayPath(): string {
    return pathForToday(this.settings);
  }

  notify(message: string): void {
    new Notice(`Super Productivity: ${message}`, 8000);
  }

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'An unexpected error occurred.';
  }

  /** A changed token invalidates the last result; status is not a live health check. */
  connectionSettingsChanged(): void {
    this.setStatus(this.settings.apiToken ? 'Not checked' : 'Access token needed');
  }

  /** Verify authentication without creating tasks or overlapping an active import. */
  async testConnection(): Promise<void> {
    if (this.unloaded) {
      return;
    }
    if (this.activeApi || this.syncing) {
      this.notify('Wait for the current request to finish.');
      return;
    }
    const api = new RestTaskApi(this.settings.apiToken);
    this.activeApi = api;
    this.setStatus('Checking…');
    try {
      await api.checkConnection();
      this.setStatus('Connection verified');
      if (!this.unloaded) {
        this.notify('Connection verified. You can import today’s tasks.');
      }
    } catch (error) {
      this.setStatus('Connection check failed');
      if (!this.unloaded) {
        this.notify(this.errorMessage(error));
      }
    } finally {
      api.close();
      this.activeApi = undefined;
    }
  }

  /** Update the status bar and the currently open settings tab together. */
  private setStatus(status: string): void {
    if (this.unloaded) {
      return;
    }
    this.connectionStatus = status;
    this.statusEl?.setText(`SP: ${status}`);
    this.settingsStatus?.(status);
  }

  /** Read today's note, build its import batch, and report completed or partial work. */
  async syncToday(): Promise<void> {
    if (this.unloaded) {
      return;
    }
    if (this.syncing || this.activeApi) {
      this.notify('A request is already running.');
      return;
    }
    // Take the lock before any asynchronous vault read can let another command run.
    this.syncing = true;
    try {
      // Capture the date once so the note path and scheduled day cannot cross midnight.
      const today = localNow();
      const path = pathForToday(this.settings, today);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        throw new Error(
          `Daily note not found: ${path}. Check the folder and filename format in settings.`,
        );
      }
      // Prefer the open editor, which can be newer than the file on disk.
      const view = this.app.workspace
        .getLeavesOfType('markdown')
        .map((leaf) => leaf.view)
        .find(
          (candidate): candidate is MarkdownView =>
            candidate instanceof MarkdownView && candidate.file?.path === path,
        );
      const markdown = view ? view.editor.getValue() : await this.app.vault.read(file);
      // The plugin may have been disabled while the vault read was pending.
      if (this.unloaded) {
        return;
      }
      const batch = makeBatch(
        markdown,
        this.settings.vaultId,
        this.app.vault.getName(),
        path,
        // API dates require ASCII digits, even when note names use a localized calendar format.
        today.clone().locale('en').format('YYYY-MM-DD'),
      );
      if (!batch.tasks.length) {
        this.notify('No unchecked tasks with a title in today’s note.');
        return;
      }

      // Validation and empty-note handling happen before opening a network request.
      const api = new RestTaskApi(this.settings.apiToken);
      this.activeApi = api;
      this.setStatus('Importing…');
      this.notify(`Importing ${batch.tasks.length} task${batch.tasks.length === 1 ? '' : 's'}…`);
      const result = await new TaskImporter(api).import(batch, api.signal);
      if (this.unloaded) {
        return;
      }

      // Keep successful counts visible even when a later task failed or was cancelled.
      this.setStatus(result.error ? 'Import stopped' : 'Last import succeeded');
      const unmatched = result.unmatchedTags.length
        ? ` ${result.unmatchedTags.length} unmatched hashtag(s) kept as title text.`
        : '';
      this.notify(
        `Imported ${result.created}; already imported ${result.skipped}.${unmatched}${result.error ? ` ${result.error} Sync again to resume.` : ''}`,
      );
    } catch (error) {
      if (!this.unloaded) {
        this.notify(this.errorMessage(error));
      }
    } finally {
      // Also release the lock after missing notes, empty batches, and failed requests.
      this.activeApi?.close();
      this.activeApi = undefined;
      this.syncing = false;
    }
  }

  /** Cancel pending I/O and prevent late callbacks from updating a disabled plugin. */
  onunload(): void {
    this.unloaded = true;
    this.activeApi?.close();
    this.settingsStatus = undefined;
  }
}
