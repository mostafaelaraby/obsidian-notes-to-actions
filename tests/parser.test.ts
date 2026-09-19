import { describe, expect, it } from 'vitest';
import { extractTags, parseNote } from '../src/parser';
import { dailyNotePath, makeBatch } from '../src/daily-note';

// Source Markdown, rather than rendered HTML, determines task and hashtag recognition.
describe('daily note parsing', () => {
  it('extracts open checkboxes, nested tasks, callouts and multiple tags', () => {
    const note =
      '# Today\n- [ ] Write report #Work #urgent\n  - [ ] Outline #work/research\n> - [ ] Reply #personal\n- [x] Done\n- ordinary item\n- [ ] #empty';
    expect(parseNote(note)).toEqual([
      { title: 'Write report', tags: ['Work', 'urgent'], line: 2, completed: false },
      { title: 'Outline', tags: ['work/research'], line: 3, completed: false },
      { title: 'Reply', tags: ['personal'], line: 4, completed: false },
      { title: 'Done', tags: [], line: 5, completed: true },
    ]);
  });
  it('ignores frontmatter, fenced code and multiline comments', () => {
    const note =
      '---\n- [ ] YAML\n---\n```md\n- [ ] Code\n```\n~~~\n- [ ] More code\n~~~\n<!--\n- [ ] Hidden\n-->\n%%\n- [ ] Hidden too\n%%\n- [ ] Real <!-- hidden --> #work';
    expect(parseNote(note)).toEqual([
      { title: 'Real', tags: ['work'], line: 16, completed: false },
    ]);
  });
  it('supports Windows line endings, BOM, uppercase checked boxes and unclosed fences', () => {
    expect(
      parseNote(
        '\uFEFF- [ ] First\r\n- [X] Finished\r\n````\r\n- [ ] Hidden\r\n```\r\n- [ ] Still hidden',
      ),
    ).toHaveLength(2);
  });
  it('keeps comment syntax inside inline code literal', () => {
    expect(parseNote('- [ ] Explain `<!--` and `%%` #docs\n- [ ] Next')).toHaveLength(2);
    expect(parseNote('- [ ] Explain `<!--` and `%%` #docs')[0]).toMatchObject({
      title: 'Explain `<!--` and `%%`',
      tags: ['docs'],
    });
  });
  it('does not treat links, inline code, escaped hashtags or number references as tags', () => {
    const text =
      'Read `#example` [[Note#Section]] [link](https://site/#anchor) C# \\#literal #123 #real';
    expect(extractTags(text)).toEqual({ title: text.replace(' #real', ''), tags: ['real'] });
  });
  it('handles Unicode, punctuation and case-insensitive duplicate tags', () => {
    expect(extractTags('Task #仕事 #work, #WORK #a_b #one/two')).toEqual({
      title: 'Task ,',
      tags: ['仕事', 'WORK', 'a_b', 'one/two'],
    });
  });
});

// Stable identity is independent of line positions but scoped to the vault and note path.
describe('daily note paths and import identity', () => {
  it('supports the vault root and nested naming templates', () => {
    expect(dailyNotePath('', '2026-09-18')).toBe('2026-09-18.md');
    expect(dailyNotePath('Journal\\Daily', '2026/09/2026-09-18')).toBe(
      'Journal/Daily/2026/09/2026-09-18.md',
    );
    expect(dailyNotePath('Daily', 'Today.md')).toBe('Daily/Today.md');
    expect(dailyNotePath('Cafe\u0301\u00a0notes', 'Today')).toBe('Café notes/Today.md');
  });
  it.each(['../outside', '/absolute', 'C:/outside', 'a/../../b', 'a?b', 'a\u0000b'])(
    'rejects invalid paths: %s',
    (folder) => {
      expect(() => dailyNotePath(folder, 'today')).toThrow('vault-relative');
    },
  );
  const batch = (note: string, path = 'Daily/2026-09-18.md', vault = 'vault-id') =>
    makeBatch(note, vault, 'My vault & notes', path, '2026-09-18');
  it('ignores checked tasks and encodes the backlink', () => {
    const result = batch('- [x] Done\n- [ ] Buy milk #home');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.title).toBe('Buy milk');
    expect(result.noteUrl).toBe(
      'obsidian://open?vault=My%20vault%20%26%20notes&file=Daily%2F2026-09-18.md',
    );
  });
  it('retains identity after line movement, checkbox completion and tag reordering', () => {
    const initial = batch('- [ ] Repeat #a #b\n- [ ] Repeat #a #b');
    const changed = batch('# Heading\n- [x] Repeat #b #a\n\n- [ ] Repeat #b #a');
    expect(initial.tasks[1]?.sourceId).toBe(changed.tasks[0]?.sourceId);
    expect(initial.tasks[0]?.sourceId).not.toBe(initial.tasks[1]?.sourceId);
  });
  it('distinguishes dates, vault identities and edited text', () => {
    const id = batch('- [ ] Task').tasks[0]?.sourceId;
    expect(batch('- [ ] Task', 'Daily/2026-09-19.md').tasks[0]?.sourceId).not.toBe(id);
    expect(batch('- [ ] Task', undefined, 'other').tasks[0]?.sourceId).not.toBe(id);
    expect(batch('- [ ] Edited').tasks[0]?.sourceId).not.toBe(id);
  });
});
