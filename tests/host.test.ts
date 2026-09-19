import { beforeEach, describe, expect, it, vi } from 'vitest';
import moment from 'moment';

// Hoisted spies let the host doubles record user-visible work without launching Obsidian.
const host = vi.hoisted(() => ({
  notices: [] as string[],
  commands: [] as Array<{ id: string; callback: () => void }>,
  importTasks: vi.fn(),
  check: vi.fn(),
  close: vi.fn(),
  createApi: vi.fn(),
  save: vi.fn(),
}));

// Expose only the host surface the plugin uses; transport/import behavior is tested separately.
vi.mock('obsidian', async (importOriginal) => ({
  ...(await importOriginal<typeof import('obsidian')>()),
  moment: (await import('moment')).default,
  Plugin: class {
    app: unknown;
    loadData = async () => null;
    saveData = host.save;
    addStatusBarItem = () => ({ setText: () => {} });
    addSettingTab = () => {};
    addRibbonIcon = () => {};
    addCommand = (command: { id: string; callback: () => void }) => host.commands.push(command);
  },
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {
    constructor(public path: string) {}
  },
  TFolder: class {},
  MarkdownView: class {
    file: unknown;
    editor: unknown;
  },
  Notice: class {
    constructor(message: string) {
      host.notices.push(message);
    }
  },
}));

vi.mock('../src/rest-api', () => ({
  RestTaskApi: class {
    controller = new AbortController();
    signal = this.controller.signal;
    constructor(token: string) {
      host.createApi(token);
    }
    checkConnection = host.check;
    close() {
      this.controller.abort();
      host.close();
    }
  },
}));

vi.mock('../src/importer', () => ({
  TaskImporter: class {
    import = host.importTasks;
  },
}));

import SuperProductivityPlugin from '../src/main';
import { loadSettings, pathForToday } from '../src/settings';
import { TFile, MarkdownView } from 'obsidian';

beforeEach(() => {
  moment.locale('en');
  vi.clearAllMocks();
  host.notices.length = 0;
  host.commands.length = 0;
  host.importTasks.mockResolvedValue({ created: 1, skipped: 0, unmatchedTags: [] });
  host.check.mockResolvedValue(undefined);
});

/** Create an enabled plugin with separate disk content and optional open editor views. */
async function setup(note = '- [ ] Task #work') {
  const plugin = new SuperProductivityPlugin({} as never, {} as never);
  const read = vi.fn(async () => note);
  const path = `${moment().format('YYYY-MM-DD')}.md`;
  const lookup = vi.fn(() => new TFile());
  const leaves: Array<{ view: unknown }> = [];
  plugin.app = {
    vault: { getAbstractFileByPath: lookup, read, getName: () => 'Test vault' },
    workspace: { getLeavesOfType: () => leaves },
  } as never;
  await plugin.onload();
  return { plugin, read, lookup, leaves, path };
}

describe('Obsidian host wiring', () => {
  it('keeps localized note names while sending an ASCII API date', async () => {
    moment.defineLocale('test-digits', {
      parentLocale: 'en',
      postformat: (value: string) => value.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]!),
    });
    try {
      const { plugin, lookup } = await setup();
      await plugin.syncToday();
      expect(lookup).toHaveBeenCalledWith(`${moment().format('YYYY-MM-DD')}.md`);
      expect(host.importTasks.mock.calls[0]?.[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      moment.locale('en');
    }
  });
  it('persists identity, registers the sync command and imports today on demand', async () => {
    const { plugin, lookup, path } = await setup();
    expect(host.save).toHaveBeenCalled();
    expect(host.commands[0]?.id).toBe('sync-today');
    expect(host.createApi).not.toHaveBeenCalled();
    host.commands[0]!.callback();
    await expect.poll(() => host.importTasks.mock.calls.length).toBe(1);
    expect(lookup).toHaveBeenCalledWith(path);
    expect(host.importTasks.mock.calls[0]?.[0]).toMatchObject({
      day: moment().format('YYYY-MM-DD'),
      tasks: [{ title: 'Task', tags: ['work'] }],
    });
    plugin.onunload();
    expect(host.close).toHaveBeenCalled();
  });
  it('reads the current editor text when today is open', async () => {
    const { plugin, read, leaves, path } = await setup('- [ ] Old disk text');
    const view = new MarkdownView({} as never);
    view.file = { path } as never;
    view.editor = { getValue: () => '- [ ] New editor text' } as never;
    leaves.push({ view });
    await plugin.syncToday();
    expect(read).not.toHaveBeenCalled();
    expect(host.importTasks.mock.calls[0]?.[0].tasks[0].title).toBe('New editor text');
  });
  it('reports a missing note without sending a request', async () => {
    const { plugin, lookup } = await setup();
    lookup.mockReturnValue(null as never);
    await plugin.syncToday();
    expect(host.notices.at(-1)).toContain('Daily note not found');
    expect(host.createApi).not.toHaveBeenCalled();
  });
  it('reports an empty task list without needing a connection', async () => {
    const { plugin } = await setup('- [x] Finished');
    await plugin.syncToday();
    expect(host.notices.at(-1)).toContain('No unchecked tasks');
    expect(host.createApi).not.toHaveBeenCalled();
  });
  it('prevents concurrent commands and clears its lock on errors', async () => {
    const { plugin } = await setup();
    host.importTasks.mockRejectedValue(new Error('Disconnected'));
    const pending = plugin.syncToday();
    await plugin.syncToday();
    await pending;
    expect(host.notices.some((value) => value.includes('already running'))).toBe(true);
    expect(host.notices.at(-1)).toContain('Disconnected');
    expect(plugin.syncing).toBe(false);
  });
  it('checks the saved REST token on demand without importing tasks', async () => {
    const { plugin } = await setup();
    plugin.settings.apiToken = 'saved-test-token';
    await plugin.testConnection();
    expect(host.createApi).toHaveBeenCalledWith('saved-test-token');
    expect(host.check).toHaveBeenCalledOnce();
    expect(host.importTasks).not.toHaveBeenCalled();
    expect(plugin.connectionStatus).toBe('Connection verified');
    expect(host.close).toHaveBeenCalledOnce();
    host.check.mockRejectedValue(new Error('Token rejected'));
    await plugin.testConnection();
    expect(plugin.connectionStatus).toBe('Connection check failed');
    expect(host.notices.at(-1)).toContain('Token rejected');
  });
  it('cancels an active import on unload and suppresses its late notice', async () => {
    const { plugin } = await setup();
    let finish!: (result: unknown) => void;
    host.importTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = plugin.syncToday();
    await expect.poll(() => host.importTasks.mock.calls.length).toBe(1);
    plugin.onunload();
    expect(host.importTasks.mock.calls[0]?.[1].aborted).toBe(true);
    const noticeCount = host.notices.length;
    finish({ created: 0, skipped: 0, unmatchedTags: [], error: 'Cancelled' });
    await pending;
    expect(host.notices).toHaveLength(noticeCount);
  });
  it('does not begin network activity after unload while a vault read is pending', async () => {
    const { plugin, read } = await setup();
    let finish!: (value: string) => void;
    read.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = plugin.syncToday();
    plugin.onunload();
    finish('- [ ] Task');
    await pending;
    expect(host.createApi).not.toHaveBeenCalled();
  });
});

describe('saved settings', () => {
  it('preserves vault identity and note settings without migrating old pairing credentials', () => {
    const first = loadSettings(null);
    expect(first.apiToken).toBe('');
    expect(first.vaultId).toMatch(/^[a-f0-9-]{36}$/);
    expect(loadSettings(first)).toEqual(first);
    const migrated = loadSettings({
      ...first,
      dailyNoteFolder: 'Daily',
      port: 27183,
      token: 'a'.repeat(64),
    });
    expect(migrated).toEqual({ ...first, dailyNoteFolder: 'Daily' });
    expect(loadSettings({ apiToken: '  saved-token  ' }).apiToken).toBe('saved-token');
  });
  it('formats nested paths with the local calendar date and literal text', () => {
    const settings = loadSettings({
      dailyNoteFolder: 'Daily',
      dailyNoteFormat: 'YYYY/MM/[Day] YYYY-MM-DD',
    });
    expect(pathForToday(settings)).toBe(`Daily/${moment().format('YYYY/MM/[Day] YYYY-MM-DD')}.md`);
    settings.dailyNoteFormat = '';
    expect(() => pathForToday(settings)).toThrow('filename format');
  });
});
