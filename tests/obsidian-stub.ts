// Obsidian's npm package contains types only. Host tests replace this module
// with a small runtime double using vi.mock; production builds externalize it.
// Pure parser tests use this normalization subset without starting the desktop host.
export const normalizePath = (path: string): string =>
  path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/|\/$/g, '')
    .replace(/\u00a0/g, ' ')
    .normalize();
