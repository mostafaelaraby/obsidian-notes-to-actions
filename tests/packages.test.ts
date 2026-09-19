import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const readJson = (name: string): Record<string, unknown> => JSON.parse(readFileSync(name, 'utf8'));

describe('production bundles and manifests', () => {
  it('keeps release versions and the desktop requirement consistent', () => {
    const manifest = readJson('manifest.json');
    const pkg = readJson('package.json');
    expect(manifest.version).toBe(pkg.version);
    expect(readJson('versions.json')[String(pkg.version)]).toBe(manifest.minAppVersion);
    expect(manifest.isDesktopOnly).toBe(true);
  });
  it('loads the bundled Obsidian entry with only its host dependency externalized', () => {
    // Execute the shipping artifact, not the TypeScript entry, in an isolated host stub.
    const nodeRequire = createRequire(import.meta.url);
    const module = { exports: {} as { default?: unknown } };
    runInNewContext(readFileSync('main.js', 'utf8'), {
      module,
      exports: module.exports,
      Buffer,
      process,
      require: (id: string) =>
        id === 'obsidian' ? { Plugin: class {}, PluginSettingTab: class {} } : nodeRequire(id),
    });
    expect(typeof module.exports.default).toBe('function');
  });
});
