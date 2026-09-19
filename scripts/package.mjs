import { zipSync } from 'fflate';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';

// The folder name must stay equal to manifest.id for manual vault installations.
const folder = 'dist/super-productivity';
await mkdir(folder, { recursive: true });

// Build every distribution form from the same files checked by npm run check.
// ZIP entries include the plugin folder so extraction produces the required layout.
const obsidian = {};
for (const name of ['main.js', 'manifest.json', 'styles.css', 'LICENSE']) {
  await copyFile(name, `${folder}/${name}`);
  // Community installations download individual release assets, not the ZIP.
  await copyFile(name, `dist/${name}`);
  obsidian[`super-productivity/${name}`] = new Uint8Array(await readFile(name));
}
await writeFile('dist/obsidian-super-productivity.zip', zipSync(obsidian));

// Do not publish a stale companion ZIP when packaging an upgraded checkout.
await rm('dist/super-productivity-companion.zip', { force: true });
console.log('Created individual release assets and dist/obsidian-super-productivity.zip.');
