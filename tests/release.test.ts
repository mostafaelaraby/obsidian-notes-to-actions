import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtures: string[] = [];
const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

afterEach(() => {
  // These paths come only from mkdtempSync below, never from metadata under test.
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

/** Run the real release CLI against disposable metadata without changing the checkout. */
function check(changes: Record<string, unknown> = {}, tag = version) {
  const fixture = mkdtempSync(join(tmpdir(), 'notes-to-actions-release-'));
  fixtures.push(fixture);
  for (const name of ['package.json', 'versions.json', 'README.md', 'LICENSE']) {
    copyFileSync(name, join(fixture, name));
  }
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  writeFileSync(join(fixture, 'manifest.json'), JSON.stringify({ ...manifest, ...changes }));
  return spawnSync(process.execPath, [resolve('scripts/check-release.mjs'), `--tag=${tag}`], {
    cwd: fixture,
    encoding: 'utf8',
  });
}

describe('community release checks', () => {
  it('accepts consistent metadata and the exact release tag', () => {
    const result = check();
    expect(result.status, result.stderr).toBe(0);
  });
  it('rejects a v-prefixed tag that Obsidian cannot resolve', () => {
    const result = check({}, `v${version}`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Release tag must exactly match');
  });
  it('rejects reserved display names', () => {
    const result = check({ name: 'Obsidian to Super Productivity' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('prohibited term');
  });
  it('rejects manifest versions that disagree with the package', () => {
    const differentVersion = version === '1.0.1' ? '1.0.2' : '1.0.1';
    const result = check({ version: differentVersion }, differentVersion);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Package and manifest versions differ');
  });
});
