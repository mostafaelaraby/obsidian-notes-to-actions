/** Keep checked tasks too: their positions among identical tasks affect import identity. */
export interface NoteTask {
  title: string;
  tags: string[];
  line: number;
  completed: boolean;
}

/** Protect code and links so URL fragments and literal examples aren't tags. */
function protectedText(text: string): string {
  // Equal-length spaces preserve offsets into the original text when extracting tags.
  return text.replace(
    /(`+)[\s\S]*?\1|\[\[[^\]]*\]\]|!?\[[^\]]*\]\([^)]*\)|<(?!\!--)[^>]*>/g,
    (match) => ' '.repeat(match.length),
  );
}

/** Remove standalone hashtags from the title, retaining the last spelling of each tag. */
export function extractTags(text: string): { title: string; tags: string[] } {
  const visible = protectedText(text);
  const tags = new Map<string, string>();
  const ranges: Array<[number, number]> = [];
  // Obsidian permits Unicode and nested tags, but not tags made only of digits.
  const pattern = /(^|[\s(])#([\p{L}\p{M}\p{N}_-]+(?:\/[\p{L}\p{M}\p{N}_-]+)*)/gu;
  for (const match of visible.matchAll(pattern)) {
    const tag = match[2]!;
    if (!/[\p{L}\p{M}_-]/u.test(tag)) {
      continue;
    }
    const start = match.index + match[1]!.length;
    // A masked link/code span is not a real whitespace boundary in the source text.
    if (start > 0 && !/[\s(]/.test(text[start - 1]!)) {
      continue;
    }
    ranges.push([start, start + tag.length + 1]);
    tags.set(tag.toLowerCase(), tag);
  }

  // Delete from right to left so earlier character offsets stay valid.
  let title = text;
  for (const [start, end] of ranges.reverse()) {
    title = title.slice(0, start) + title.slice(end);
  }
  return { title: title.replace(/[ \t]{2,}/g, ' ').trim(), tags: [...tags.values()] };
}

/** Parse checkbox lines, not rendered HTML. Never change the source note. */
export function parseNote(markdown: string): NoteTask[] {
  const tasks: NoteTask[] = [];
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
  // These states span lines; inline code protection is handled separately below.
  let frontmatter = lines[0]?.trim() === '---';
  let fence: { char: string; length: number } | undefined;
  let commentEnd: string | undefined;

  for (const [index, original] of lines.entries()) {
    if (frontmatter) {
      if (index > 0 && /^(---|\.\.\.)\s*$/.test(original)) {
        frontmatter = false;
      }
      continue;
    }

    // Quote prefixes are removed to support checkbox tasks inside callouts.
    const unquoted = original.replace(/^(?:\s*>\s?)+/, '');
    const fenceMatch = unquoted.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      // Shorter delimiters and a different fence character cannot close this block.
      if (
        fenceMatch &&
        fenceMatch[1]![0] === fence.char &&
        fenceMatch[1]!.length >= fence.length &&
        !fenceMatch[2]!.trim()
      ) {
        fence = undefined;
      }
      continue;
    }
    if (!commentEnd && fenceMatch) {
      fence = { char: fenceMatch[1]![0]!, length: fenceMatch[1]!.length };
      continue;
    }

    // Omit HTML/Obsidian comment text, preserving the original line number.
    // Inline code and links cannot open a comment because protectedText masks them.
    let line = '';
    let cursor = 0;
    while (cursor < unquoted.length) {
      if (commentEnd) {
        const end = unquoted.indexOf(commentEnd, cursor);
        if (end < 0) {
          break;
        }
        cursor = end + commentEnd.length;
        commentEnd = undefined;
      } else {
        const rest = unquoted.slice(cursor);
        const open = /<!--|%%/.exec(protectedText(rest));
        const offset = open?.index;
        if (offset === undefined) {
          line += rest;
          break;
        }
        line += rest.slice(0, offset);
        commentEnd = rest.startsWith('<!--', offset) ? '-->' : '%%';
        cursor += offset + (commentEnd === '-->' ? 4 : 2);
      }
    }

    // Only hyphen checkboxes qualify; empty titles and tag-only items are skipped.
    const match = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    if (!match) {
      continue;
    }
    const parsed = extractTags(match[2]!);
    if (!parsed.title) {
      continue;
    }
    tasks.push({ ...parsed, line: index + 1, completed: match[1] !== ' ' });
  }
  return tasks;
}
