import { moment } from 'obsidian';

/** Use the host's Moment instance so local dates and note-filename locales agree. */
// Obsidian exports a callable Moment factory; its declarations use a namespace
// import, which needs this cast when TypeScript's esModuleInterop is enabled.
export const localNow = (): import('moment').Moment =>
  (moment as unknown as () => import('moment').Moment)();
