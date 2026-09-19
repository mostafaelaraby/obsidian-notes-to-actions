# Contributing to Notes to Actions

Contributions can be code, documentation, screenshots, bug reports, or examples of daily notes that do not import as expected. Small, focused changes are easiest to review. You can run the automated tests without installing Obsidian or Super Productivity.

## Pick a starting point

| If you want to…                           | Start here                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Improve setup instructions or screenshots | [README](README.md) and [screenshot guide](docs/screenshots/README.md)                                             |
| Fix checkbox or hashtag recognition       | [Parser](src/parser.ts) and [parser tests](tests/parser.test.ts)                                                   |
| Fix note paths or duplicate detection     | [Daily-note helpers](src/daily-note.ts), [importer](src/importer.ts), and [importer tests](tests/importer.test.ts) |
| Change settings or commands               | [Settings](src/settings.ts), [plugin entry point](src/main.ts), and [host tests](tests/host.test.ts)               |
| Fix connection or API behavior            | [REST client](src/rest-api.ts), [HTTP tests](tests/rest-api.test.ts), and [API notes](docs/api.md)                 |
| Improve build or release tooling          | [Scripts](scripts/), [bundle tests](tests/packages.test.ts), and [release tests](tests/release.test.ts)            |

For a first contribution, try clarifying a README step or adding a small test case that reproduces a bug. For larger features, open an issue to discuss the problem and proposed behavior before spending time on implementation. Small fixes do not need a separate issue.

## Set up your checkout

You need **Node.js 22 or newer**, npm, and Git. CI uses Node.js 22 on Windows and Linux.

1. Fork the repository on GitHub and copy your fork's clone URL. Replace `YOUR_FORK_URL` below with that URL. If you already have a local checkout, start in its root folder and skip the clone commands.

   ```sh
   git clone YOUR_FORK_URL notes-to-actions
   cd notes-to-actions
   ```

2. Create a branch for your change. Choose a short, descriptive branch name.

   ```sh
   git switch -c fix/describe-your-change
   ```

3. Install the locked dependencies and run the baseline checks.

   ```sh
   npm ci
   npm run check
   ```

   A successful run checks formatting and release metadata, compiles TypeScript, builds `main.js`, and passes the test suite. Run commands from the repository root, where `package.json` is located.

Use `npm ci` for an existing checkout. Use `npm install` when intentionally changing dependencies, and include the resulting `package-lock.json` changes in your pull request.

## Understand the code

The import flow is:

```text
Command or settings button
  → main.ts reads today's note
  → daily-note.ts + parser.ts build a validated batch
  → importer.ts matches tags and detects earlier imports
  → rest-api.ts sends requests to Super Productivity
  → main.ts reports the result
```

[api.ts](src/api.ts) defines the transport interface; [import-types.ts](src/import-types.ts) validates batches and defines persisted source markers. [date.ts](src/date.ts) uses Obsidian's Moment instance. Tests use an [in-memory API](tests/fixtures.ts) and an [Obsidian runtime stub](tests/obsidian-stub.ts) where a desktop host is unnecessary.

Keep these behaviors in mind when making changes:

- Imports run only when requested. The plugin reads daily notes without changing them.
- Hashtags match existing tags without regard to case. Unknown hashtags stay in task titles; the plugin does not create tags.
- Source markers and the saved vault identity prevent duplicates and allow interrupted imports to resume. Preserve compatibility with previously imported tasks.
- Requests use Super Productivity's local desktop REST API. Installation requires only the Obsidian plugin.
- Disabling the plugin cancels pending requests. A failed import must allow a later retry.

Use small functions and clear types. Explain surprising behavior and compatibility constraints in comments. Use Obsidian's public APIs, keep UI styles scoped in `styles.css`, and avoid unrelated refactors or dependency changes in a focused fix.

## Edit and test

| Command                | When to use it                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run format`       | Apply the project's formatting rules.                                                                             |
| `npm run format:check` | Check formatting without changing files; sufficient for documentation-only edits.                                 |
| `npm run build`        | Type-check and rebuild the production `main.js`.                                                                  |
| `npm run dev`          | Rebuild `main.js` whenever source changes. This does not type-check, copy files into a vault, or reload Obsidian. |
| `npm test`             | Build and run the entire test suite once.                                                                         |
| `npm run check`        | Run formatting, metadata, build, and test checks before submitting code changes.                                  |
| `npm run package`      | Run all checks, then create and verify release files and the manual-install ZIP in `dist/`.                       |

For a quicker feedback loop while changing the parser:

```sh
npx vitest run tests/parser.test.ts
npx vitest --watch tests/parser.test.ts
```

The first command runs once; the second reruns tests as you edit. Press **Ctrl + C** to stop watch mode. Replace the filename to target another test file. The bundle test reads generated `main.js`, so run `npm run build` before targeting `tests/packages.test.ts`; `npm test` handles this automatically for the full suite.

For a bug fix, add a regression test when it can capture the failing behavior. Test observable results such as parsed titles, preserved tags, skipped duplicates, or cancellation. Documentation and comment-only changes generally do not need new tests. The [verification guide](docs/verification.md) explains existing coverage and the broader desktop checklist.

HTTP tests bind temporary loopback ports and use synthetic data. They do not require your access token or connect to a running Super Productivity instance.

## Try the change in Obsidian

Use **Obsidian desktop 1.7.7 or newer** and **Super Productivity desktop 19.0.1 or newer** for an actual import. Use a disposable Obsidian vault and a separate Super Productivity test profile with synthetic tasks. For settings-only work, the Super Productivity app is unnecessary unless you are testing the connection or import buttons.

1. Run `npm run package`.
2. Copy `dist/super-productivity/` into the test vault's `.obsidian/plugins/` directory. Use the vault's custom configuration directory if it has one. The resulting file path should be `.obsidian/plugins/super-productivity/main.js`.
3. Restart Obsidian, enable community plugins, and enable **Notes to Actions**.
4. Follow the [installation guide](README.md#step-by-step-installation) to enable the local REST API, enter the test token, and configure the daily-note folder and format.
5. Add an unchecked task to today's note, run **Sync today's tasks to Super Productivity**, and verify it appears in Today. Run the command again and confirm it creates no duplicate. For behavior changes, also follow the relevant [desktop checks](docs/verification.md#desktop-smoke-check).

For subsequent edits, run `npm run build` or keep `npm run dev` running. Copy the updated root `main.js`, `manifest.json`, and `styles.css` into the installed test plugin folder, then disable and re-enable **Notes to Actions**. Keep the test plugin's `data.json` so its configuration and import identity survive. Watch mode alone does not update the installed copy.

For UI changes, include a screenshot when helpful. Follow the [screenshot guide](docs/screenshots/README.md) and conceal access tokens before capturing images.

## Report a bug or suggest a feature

For a bug report, include:

- Your OS, Obsidian version, Super Productivity version, and plugin version.
- Steps to reproduce, what you expected, and what actually happened.
- The daily-note folder/filename format and a minimal Markdown example, if relevant.
- The exact error text, with private content removed.

For a feature request, describe the workflow or problem and give an example of the desired result. This helps distinguish an installation problem from a new capability.

Never attach access tokens, plugin `data.json`, personal notes, or exported task databases. Use a small synthetic example instead.

## Open a pull request

1. Keep the change focused and update the README if setup or behavior changes.
2. Run the checks appropriate to your change from the table above. Include a regression test for a behavior fix when practical.
3. Review your diff. Commit source, tests, documentation, and intentional lockfile changes. Generated `main.js`, `dist/`, `node_modules/`, credentials, and test profiles belong outside the commit.
4. Commit and push your branch to your fork, then open a pull request against this repository's default branch. Draft pull requests are welcome while work is incomplete.
5. Describe the problem, the resulting behavior, and how you verified the change. List the commands you ran and any manual checks you did not perform. Include screenshots for visible changes when useful.

The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) provides a short starting point. CI runs `npm run package` on Windows and Linux; check its results and address failures before asking for a final review.

Routine contributions do not need a version bump or a release tag. Maintainers handle releases using the [submission and release checklist](docs/submission.md), including the individual assets Obsidian needs for installation.

The project uses the [MIT License](LICENSE). Keep existing copyright and license notices intact.

## Common development problems

| Problem                                 | What to check                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` fails                          | Run `node --version` and confirm Node.js 22 or newer. Confirm you are in the repository root and the lockfile matches your branch.        |
| Formatting check fails                  | Run `npm run format`, inspect the changes, and rerun the check.                                                                           |
| A bundle test uses old behavior         | Run `npm run build` first, or use `npm test` to rebuild and run the full suite.                                                           |
| Obsidian still shows the old behavior   | Copy the rebuilt files into the test vault, then disable and re-enable the plugin. Check for an extra nested `super-productivity` folder. |
| A local HTTP test cannot bind a port    | Use a test environment that permits temporary loopback listeners. A personal Super Productivity instance is not needed.                   |
| A task is skipped during manual testing | Repeat imports intentionally skip known source markers. Add a new synthetic checkbox when testing a new import.                           |
