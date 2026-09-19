# Verification

Run `npm run package` for formatting, release metadata checks, strict TypeScript compilation, the production bundle, automated tests, individual release assets, and the installable Obsidian ZIP. The final check compares the release files and ZIP with the build; `npm run release:check -- --tag=1.0.0 --assets` additionally checks an intended tag.

## Automated checks

The suite covers:

- Daily-note paths, localized filenames, calendar dates, checked items, nested lists, callouts, comments, fences, literal hashes, and Unicode tags.
- Matching existing tags without creating tags; retaining unknown hashtags as text; explicit Inbox and Today scheduling.
- Source markers, completed/archived duplicates, partial failures, lost creation responses, literal short syntax, and cancellation.
- Obsidian command registration, editor content, concurrent requests, test-connection behavior, settings migration, and unload cleanup.
- Authenticated requests over real loopback HTTP sockets, response envelopes, malformed payloads, unauthorized access, redirects, proxy bypass, deadlines, and cancellation.
- Production bundle loading and release metadata.

HTTP tests run against an ephemeral local test server with synthetic tasks and tokens. They assert the documented REST contract, including `source=all&includeDone=true`, and exercise the importer through the real HTTP client. They never use a personal Super Productivity profile.

## Desktop smoke check

Use a test vault and a disposable Super Productivity desktop profile.

1. Install the single Obsidian plugin ZIP.
2. Open **Super Productivity → Settings → General → Misc Settings**, enable **Enable local REST API (desktop only)**, and copy its access token into the Obsidian plugin.
3. Click **Test connection** and confirm **Connection verified**. No task should be created.
4. Select a daily-note folder and date format; verify the path preview.
5. Create a `work` tag in Super Productivity. Add `- [ ] Draft #work #new`, a checked item, a nested checkbox, and a code-fence checkbox to today's note.
6. Run the import while another note is active. Verify intended items appear in Today and Inbox, `work` is attached, and `#new` stays in the title without a new tag being created.
7. Repeat the import; verify no duplicates. Complete/archive an imported task, restart the apps, and repeat.
8. Edit today's open editor and import; verify the current editor content is read.
9. Check missing-note, API-disabled, expired-token, and empty-task notifications.
10. Disable the Obsidian plugin during a request, re-enable it, and retry; verify cleanup and recovery.
11. When upgrading from the earlier version, retain `data.json`, remove the old companion, and verify existing source markers still prevent duplicates.

## Evidence and limits — September 18, 2026

The direct REST implementation passes the local HTTP integration and unit tests. Endpoint behavior and authentication were reviewed against Super Productivity v19.0.1 documentation and source; see [API notes](api.md).

The packaged Obsidian plugin was installed in a disposable vault using **Obsidian desktop 1.7.7**. A separate **Super Productivity desktop 19.0.1** profile ran the official Windows portable build. The native settings UI enabled the local REST API; its token was entered into the Obsidian plugin, and **Test connection** succeeded.

Running the command from Obsidian's command palette imported three unchecked tasks into Today. Two tasks received existing `work` and `reading` tags. An unmatched `#research` remained in its task title without creating a tag. The checked source item was absent. A repeated command reported **Imported 0; already imported 3**. A read-only check through the actual local REST API confirmed three source-marked tasks and no `research` tag.

The [installation screenshots](screenshots/README.md) show this native desktop workflow. No companion plugin was installed in the Super Productivity test profile. Personal vaults and task data were not used. These captures replace the earlier companion/web-app screenshots.

The broader desktop checklist above remains useful for release testing, particularly restart, archived-task, failure, and migration scenarios that are covered automatically but were not all repeated in this screenshot session.

After the submission audit, `npm run package` passed all 60 tests and verified the individual release assets against both the build and ZIP. Release tests reject reserved display names, mismatched versions, and `v`-prefixed tags. The renamed **Notes to Actions** package was reopened in the native test vault; connection testing succeeded and its current command again skipped all three existing tasks. The affected screenshots were refreshed.

CI is configured for Windows and Linux. Remote CI and the draft-release workflow have not been run because the project has not yet been published to GitHub.
