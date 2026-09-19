import { describe, expect, it, vi } from 'vitest';
import { TaskImporter } from '../src/importer';
import { makeBatch } from '../src/daily-note';
import { parseBatch } from '../src/import-types';
import { FakeTaskApi } from './fixtures';

// Fixed vault/date inputs isolate import policy from the computer's clock and locale.
const batch = (note = '- [ ] Write report\n- [ ] Buy milk') =>
  makeBatch(note, 'vault', 'Notes', 'Daily/2026-09-18.md', '2026-09-18');
const signal = () => new AbortController().signal;

describe('Super Productivity imports', () => {
  it('creates tasks scheduled for Today using existing tags without creating tags', async () => {
    const api = new FakeTaskApi();
    api.tags = [
      { id: 'tag-0', title: 'work' },
      { id: 'tag-1', title: 'home' },
    ];
    const result = await new TaskImporter(api).import(
      batch('- [ ] Write report #work\n- [ ] Buy milk #home'),
      signal(),
    );
    expect(result).toEqual({ created: 2, skipped: 0, unmatchedTags: [] });
    expect(api.tags.map((tag) => tag.title)).toEqual(['work', 'home']);
    expect(api.tasks[0]).toMatchObject({
      title: 'Write report',
      projectId: 'INBOX_PROJECT',
      dueDay: '2026-09-18',
      tagIds: ['tag-0'],
    });
    expect(api.tasks[0]?.notes).toContain('obsidian://open?');
  });
  it('keeps unmatched hashtags in task titles and reports them without creating tags', async () => {
    const api = new FakeTaskApi();
    api.tags = [
      { id: 'work', title: 'Work' },
      { id: 'TODAY', title: 'Today' },
    ];
    const result = await new TaskImporter(api).import(
      batch('- [ ] Draft #work #new\n- [ ] Read #New #Today'),
      signal(),
    );
    expect(api.tasks.map(({ title, tagIds }) => ({ title, tagIds }))).toEqual([
      { title: 'Draft #new', tagIds: ['work'] },
      { title: 'Read #New #Today', tagIds: [] },
    ]);
    expect(result.unmatchedTags).toEqual(['new', 'Today']);
    expect(api.tags).toHaveLength(2);
  });
  it('reuses matching tags without depending on case', async () => {
    const api = new FakeTaskApi();
    api.tags = [{ id: 'existing', title: 'WORK' }];
    await new TaskImporter(api).import(batch('- [ ] Task #work\n- [ ] Other #Work'), signal());
    expect(api.tags).toHaveLength(1);
    expect(api.tasks.every((task) => task.tagIds[0] === 'existing')).toBe(true);
  });
  it('skips imports across restarts, including archived or completed tasks', async () => {
    const api = new FakeTaskApi();
    await new TaskImporter(api).import(batch(), signal());
    api.archived.push(api.tasks.pop()!);
    expect(await new TaskImporter(api).import(batch(), signal())).toEqual({
      created: 0,
      skipped: 2,
      unmatchedTags: [],
    });
  });
  it.each(['failed update', 'lost create response'])(
    'recovers after a %s without duplication',
    async (failure) => {
      const api = new FakeTaskApi();
      api.failUpdate = failure === 'failed update';
      api.lostCreateReply = failure === 'lost create response';
      const first = await new TaskImporter(api).import(batch(), signal());
      expect(first.error).toContain('line 1');
      expect(api.tasks).toHaveLength(1);
      api.failUpdate = false;
      expect(await new TaskImporter(api).import(batch(), signal())).toEqual({
        created: 2,
        skipped: 0,
        unmatchedTags: [],
      });
      expect(api.tasks).toHaveLength(2);
      expect(api.tasks[0]?.title).toBe('Write report');
    },
  );
  it('preserves literal Super Productivity short syntax in titles', async () => {
    const api = new FakeTaskApi();
    const create = vi.spyOn(api, 'addTask');
    await new TaskImporter(api).import(batch('- [ ] Read +Project @tomorrow 30m'), signal());
    expect(create.mock.calls[0]?.[0].title).toBe('Obsidian task');
    expect(api.tasks[0]?.title).toBe('Read +Project @tomorrow 30m');
    expect(api.tasks[0]?.dueDay).toBe('2026-09-18');
  });
  it('validates the whole request before any mutation', async () => {
    const api = new FakeTaskApi();
    const invalid = batch();
    invalid.tasks[1]!.title = '';
    expect((await new TaskImporter(api).import(invalid, signal())).error).toContain('Invalid task');
    expect(api.tasks).toEqual([]);
    expect(api.tags).toEqual([]);
  });
  it('stops new changes after cancellation', async () => {
    const api = new FakeTaskApi();
    const controller = new AbortController();
    controller.abort();
    expect((await new TaskImporter(api).import(batch(), controller.signal)).error).toBeTruthy();
    expect(api.tasks).toEqual([]);
    expect(api.tags).toEqual([]);
  });
  it('rejects overlapping imports', async () => {
    const api = new FakeTaskApi();
    const importer = new TaskImporter(api);
    const pending = importer.import(batch(), signal());
    expect((await importer.import(batch(), signal())).error).toContain('still finishing');
    await pending;
    expect(api.tasks).toHaveLength(2);
  });
});

// Boundary validation must fail before any partial remote mutation is possible.
describe('protocol validation', () => {
  it.each(['2026-02-30', '2026-99-12', 'yesterday'])('rejects invalid dates: %s', (day) => {
    expect(() => parseBatch({ ...batch(), day })).toThrow();
  });
  it('rejects arbitrary backlink protocols and duplicate source IDs', () => {
    expect(() => parseBatch({ ...batch(), noteUrl: 'javascript:alert(1)' })).toThrow();
    const value = batch();
    value.tasks.push(value.tasks[0]!);
    expect(() => parseBatch(value)).toThrow();
  });
});
