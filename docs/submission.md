# Obsidian community submission

Local review completed on September 18, 2026. This prepares the project for submission; it does not mean Obsidian has approved or listed it.

## Current submission route

The [Hub guide](https://publish.obsidian.md/hub/04%20-%20Guides%2C%20Workflows%2C%20%26%20Courses/Guides/How%20to%20add%20your%20plugin%20to%20the%20community%20plugin%20list) describes the earlier `obsidian-releases` pull-request process. Follow the [current official submission instructions](https://docs.obsidian.md/plugins/releasing/submit-plugin): publish the source and release on GitHub, then submit through [Obsidian Community](https://community.obsidian.md) using an Obsidian account linked to the repository owner's GitHub account.

## Local audit

| Area              | Result                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required files    | Root `README.md`, `LICENSE`, and `manifest.json` are present. The README explains installation and use with real desktop screenshots.                                                                                                 |
| Display name      | **Notes to Actions** follows the current naming rules; the earlier display name contained the prohibited word “Obsidian.”                                                                                                             |
| Identity          | `super-productivity` remains the plugin ID and installation folder. Author: **Mostafa ELAraby**. Neither this ID nor the new display name matched a published registry entry when checked. Recheck availability at submission.        |
| Release metadata  | `package.json`, `manifest.json`, and `versions.json` agree. Release tag must be `1.0.0`, without `v`.                                                                                                                                 |
| Desktop support   | `isDesktopOnly: true` reflects use of Node.js HTTP and crypto APIs. The declared minimum is 1.7.7, matching the version used for native desktop testing.                                                                              |
| Distribution      | Packaging produces `main.js`, `manifest.json`, and `styles.css` as separate assets, plus the optional manual-install ZIP. Automated checks compare all copies with the build.                                                         |
| Network and data  | README documents loopback HTTP, token storage, transmitted task fields, and Super Productivity's independent sync behavior. No telemetry, advertising, self-updates, or runtime dependency downloads were found in the plugin source. |
| Vault and UI APIs | Uses instance `app`, Vault reads, Editor reads, `loadData`/`saveData`, normalized paths, text-based DOM helpers, and scoped CSS. Commands have no default hotkey; the command ID is `sync-today`.                                     |
| Cleanup           | Pending HTTP requests abort when the plugin unloads. Obsidian owns command, ribbon, and status-bar registration.                                                                                                                      |

Naming and metadata were reviewed against the [manifest specification](https://docs.obsidian.md/Reference/Manifest). Desktop and description requirements come from the [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins). Network disclosure and distribution behavior were checked against the [developer policies](https://docs.obsidian.md/community-directory/developer-policies). Source review also covered the [plugin guidelines](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md).

The HTTP transport deliberately uses desktop Node.js `http` to connect directly to loopback, prohibit redirects, bypass proxies, and abort requests on unload. It loads no remote code. The production bundle contains the project's source and Node.js built-ins, with Obsidian as the host dependency; Moment is obtained from Obsidian.

## Publish the first release

1. Publish this project as a public GitHub repository. Keep the manifest and README at its root on the default branch. Commit the source, lockfile, screenshots, and workflows; exclude credentials and generated output using `.gitignore`.
2. Run `npm ci` and `npm run package`. See [verification](verification.md) for desktop checks and the limits of the existing evidence.
3. For future versions, update `package.json`, the lockfile, `manifest.json`, and `versions.json` together. Run `npm run release:check -- --tag=1.0.0 --assets` with the intended version.
4. Tag the reviewed commit `1.0.0` and push that tag. The release workflow checks it against the manifest, rebuilds and tests, then creates a **draft** GitHub release.
5. Review the draft and publish it as a normal release, not a prerelease. Ensure it has separate attachments named exactly `main.js`, `manifest.json`, and `styles.css`. The ZIP is optional for manual installation and cannot replace these attachments. If Actions is unavailable, create the release manually and upload those three files from `dist/`, plus the ZIP and license if desired.
6. Confirm the public release tag matches the version in the default-branch manifest and the attachments download successfully.
7. Sign in to Obsidian Community, link the owning GitHub account, and add this repository as a plugin. Resolve review errors and publish corrected versions as required by the directory.

## Enable the Sponsor button

The repository's [funding file](../.github/FUNDING.yml) uses GitHub's native Buy Me a Coffee integration:

```yaml
buy_me_a_coffee: mostafaelaraby
```

Push this file to the repository's default branch. In **Settings → General → Features**, enable **Sponsorships**, then check the repository's **Sponsor** button links to `https://buymeacoffee.com/mostafaelaraby`. See [GitHub's setup instructions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).

The README support link and the Obsidian manifest's `fundingUrl` use the same profile. Donations are optional and do not unlock additional functionality.

## Remaining external checks

The author confirmed that the project has not been published publicly yet. Repository visibility, ownership, default-branch contents, a public release, and GitHub Actions results remain to be verified after publication. Submission and approval remain external steps. Registry availability is not reserved by this local check.

If upgrading a local development copy, the plugin ID and saved settings stay the same. Reassign any custom sync hotkey because the command ID is now `super-productivity:sync-today`.
