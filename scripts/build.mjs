import { context } from 'esbuild';

// Desktop Obsidian loads CommonJS and supplies its own API module at runtime.
// Keep source maps in development only; production releases remain standalone.
const build = await context({
  bundle: true,
  target: 'es2022',
  logLevel: 'info',
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  entryPoints: ['src/main.ts'],
  outfile: 'main.js',
  platform: 'node',
  format: 'cjs',
  external: ['obsidian'],
});

// Watch mode owns a persistent build context; one-shot builds must release it.
if (process.argv.includes('--watch')) {
  await build.watch();
} else {
  await build.rebuild();
  await build.dispose();
}
