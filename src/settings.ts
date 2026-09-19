import { randomUUID } from 'node:crypto';
import { PluginSettingTab, Setting, TFolder, type App } from 'obsidian';
import { localNow } from './date';
import { isRecord } from './import-types';
import { dailyNotePath } from './daily-note';
import type SuperProductivityPlugin from './main';

/** Vault-local data saved by Obsidian; vaultId keeps import identities stable. */
export interface PluginSettings {
  dailyNoteFolder: string;
  dailyNoteFormat: string;
  apiToken: string;
  vaultId: string;
}

/** Recover usable settings from old or incomplete data without reusing pairing tokens. */
export function loadSettings(value: unknown): PluginSettings {
  const data = isRecord(value) ? value : {};
  return {
    dailyNoteFolder: typeof data.dailyNoteFolder === 'string' ? data.dailyNoteFolder : '',
    dailyNoteFormat:
      typeof data.dailyNoteFormat === 'string' && data.dailyNoteFormat.trim()
        ? data.dailyNoteFormat
        : 'YYYY-MM-DD',
    // Old bridge pairing keys are unrelated to the desktop REST access token.
    apiToken: typeof data.apiToken === 'string' ? data.apiToken.trim() : '',
    // Generate a new identity only when the saved value cannot be reused.
    vaultId:
      typeof data.vaultId === 'string' && /^[a-f0-9-]{36}$/.test(data.vaultId)
        ? data.vaultId
        : randomUUID(),
  };
}

/** Render note selection and explicit connection/import actions using Obsidian controls. */
export class SuperProductivitySettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: SuperProductivityPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    // Obsidian can call display repeatedly; rebuild instead of retaining stale controls.
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('super-productivity-settings');
    containerEl.createEl('p', {
      text: 'Send today’s unchecked tasks to Super Productivity with one command.',
    });
    // Note-location controls save immediately and refresh the shared path preview.
    new Setting(containerEl).setName('Daily note').setHeading();
    new Setting(containerEl)
      .setName('Daily note folder')
      .setDesc('Choose the folder containing your daily notes.')
      .addDropdown((dropdown) => {
        dropdown.addOption('', 'Vault root');
        const folders = this.app.vault
          .getAllLoadedFiles()
          .filter((file): file is TFolder => file instanceof TFolder && file.path !== '/');
        for (const folder of folders.sort((a, b) => a.path.localeCompare(b.path))) {
          dropdown.addOption(folder.path, folder.path);
        }
        // Keep a moved/deleted selection visible instead of silently choosing another folder.
        if (
          this.plugin.settings.dailyNoteFolder &&
          !folders.some((folder) => folder.path === this.plugin.settings.dailyNoteFolder)
        ) {
          dropdown.addOption(
            this.plugin.settings.dailyNoteFolder,
            `${this.plugin.settings.dailyNoteFolder} (missing)`,
          );
        }
        dropdown.setValue(this.plugin.settings.dailyNoteFolder).onChange(async (value) => {
          this.plugin.settings.dailyNoteFolder = value;
          await this.plugin.saveSettings();
          preview();
        });
      });
    new Setting(containerEl)
      .setName('Daily note filename format')
      .setDesc(
        'Use the same Moment format as Daily notes, for example YYYY-MM-DD or YYYY/MM/YYYY-MM-DD. Use [brackets] for literal text.',
      )
      .addText((input) =>
        input
          .setPlaceholder('YYYY-MM-DD')
          .setValue(this.plugin.settings.dailyNoteFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFormat = value;
            await this.plugin.saveSettings();
            preview();
          }),
      );
    const pathEl = containerEl.createEl('p', { cls: 'super-productivity-preview' });
    // Invalid formats should explain the problem in place, without breaking the settings tab.
    const preview = (): void => {
      try {
        pathEl.setText(`Today: ${this.plugin.todayPath()}`);
      } catch (error) {
        pathEl.setText(this.plugin.errorMessage(error));
      }
    };
    preview();

    // Connection status reflects the last explicit operation, not background polling.
    new Setting(containerEl).setName('Connection').setHeading();
    const status = new Setting(containerEl)
      .setName('Connection status')
      .setDesc(this.plugin.connectionStatus);
    this.plugin.settingsStatus = (value) => status.setDesc(value);
    new Setting(containerEl)
      .setName('Access token')
      .setDesc(
        'In Super Productivity desktop, open Settings → General → Misc Settings, enable the local REST API, and copy its Access Token. Saved locally in this vault’s plugin settings.',
      )
      .addText((input) => {
        // Mask the display only; persistence still uses the vault's ordinary plugin data.
        input.inputEl.type = 'password';
        input.inputEl.autocomplete = 'off';
        input.inputEl.spellcheck = false;
        input
          .setPlaceholder('Paste the access token')
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value.trim();
            await this.plugin.saveSettings();
            this.plugin.connectionSettingsChanged();
          });
      });

    // Both buttons use the plugin's operation lock to avoid overlapping API requests.
    new Setting(containerEl)
      .setName('Test connection')
      .setDesc(
        'Check the token and local API while Super Productivity is running. No tasks are imported.',
      )
      .addButton((button) =>
        button.setButtonText('Test connection').onClick(() => this.plugin.testConnection()),
      );
    new Setting(containerEl)
      .setName('Import today')
      .setDesc(
        'Hashtags match existing tags. Unmatched hashtags stay in task titles. Existing imports are skipped; the daily note stays unchanged.',
      )
      .addButton((button) =>
        button
          .setButtonText('Sync to Super Productivity')
          .setCta()
          .onClick(() => this.plugin.syncToday()),
      );
  }

  hide(): void {
    // Release the callback to this tab's DOM when Obsidian hides the settings page.
    this.plugin.settingsStatus = undefined;
  }
}

/** Format with the host's locale, then validate and normalize the vault-relative path. */
export function pathForToday(settings: PluginSettings, date = localNow()): string {
  if (!settings.dailyNoteFormat.trim()) {
    throw new Error('Enter a daily note filename format in settings.');
  }
  return dailyNotePath(settings.dailyNoteFolder, date.format(settings.dailyNoteFormat));
}
