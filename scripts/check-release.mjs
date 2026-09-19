import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { unzipSync } from 'fflate';

// Metadata checks run before every build. Tag and asset checks are opt-in release gates.
const { values } = parseArgs({
  options: { assets: { type: 'boolean' }, tag: { type: 'string' } },
});
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json('manifest.json');
const pkg = await json('package.json');
const versions = await json('versions.json');
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Validate field types before applying the community directory's naming rules.
for (const field of ['id', 'name', 'version', 'minAppVersion', 'description', 'author']) {
  assert.equal(typeof manifest[field], 'string', `Manifest ${field} must be a string.`);
  assert(manifest[field].trim(), `Manifest ${field} cannot be empty.`);
}
assert(/^[a-z]+(?:-[a-z]+)*$/.test(manifest.id), 'Use a lowercase, hyphenated plugin ID.');
assert(
  !/obsidian|plugin$/.test(manifest.id),
  'Plugin ID cannot contain obsidian or end in plugin.',
);
assert(
  /^[A-Za-z0-9 ()+-]+$/.test(manifest.name),
  'Display name must use permitted Basic Latin characters.',
);
assert(
  !/obsidian|obsi-|sidian|\bplugin\b/i.test(manifest.name),
  'Display name contains a prohibited term.',
);

// Obsidian resolves the exact version tag and uses versions.json for compatibility.
assert(
  semver.test(manifest.version),
  'Version must be x.y.z, without a v prefix or prerelease suffix.',
);
assert(semver.test(manifest.minAppVersion), 'minAppVersion must be x.y.z.');
assert.equal(manifest.version, pkg.version, 'Package and manifest versions differ.');
assert.equal(manifest.author, pkg.author, 'Package and manifest authors differ.');
assert.equal(versions[manifest.version], manifest.minAppVersion, 'versions.json is out of date.');
assert.equal(manifest.isDesktopOnly, true, 'This plugin requires desktop Node.js APIs.');

// Listing descriptions and the root documentation are checked independently of a build.
assert(
  manifest.description.length <= 250 && manifest.description.endsWith('.'),
  'Description must end in a period and be at most 250 characters.',
);
assert(/^[\x20-\x7e]+$/.test(manifest.description), 'Use plain text in the description.');
assert(!/^this is a plugin/i.test(manifest.description), 'Describe the action directly.');
for (const file of ['README.md', 'LICENSE']) {
  assert((await readFile(file, 'utf8')).trim(), `${file} must be present in the repository root.`);
}

if (values.tag !== undefined) {
  assert.equal(
    values.tag,
    manifest.version,
    'Release tag must exactly match manifest.version (no v prefix).',
  );
}

// Compare bytes, not only filenames: stale files must never reach a public release.
if (values.assets) {
  const zip = unzipSync(await readFile('dist/obsidian-super-productivity.zip'));
  for (const name of ['main.js', 'manifest.json', 'styles.css', 'LICENSE']) {
    const source = await readFile(name);
    assert(source.length, `${name} cannot be empty.`);
    assert.deepEqual(
      await readFile(`dist/${name}`),
      source,
      `Individual release asset ${name} is stale.`,
    );
    assert.deepEqual(
      await readFile(`dist/${manifest.id}/${name}`),
      source,
      `Install folder ${name} is stale.`,
    );
    assert(zip[`${manifest.id}/${name}`], `ZIP is missing ${name}.`);
    assert.deepEqual(Buffer.from(zip[`${manifest.id}/${name}`]), source, `ZIP ${name} is stale.`);
  }
  assert.equal(Object.keys(zip).length, 4, 'ZIP contains unexpected files.');
}

console.log(
  `Release checks passed for ${manifest.name} ${manifest.version}${values.assets ? ', including individual assets and ZIP' : ''}.`,
);
