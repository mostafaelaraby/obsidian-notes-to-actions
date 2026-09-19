# Installation screenshots

Captured on **September 18, 2026** from actual Windows desktop apps:

- **Obsidian 1.7.7**, with the plugin installed from `dist/obsidian-super-productivity.zip` in a disposable vault named **Notes to actions demo**.
- **Super Productivity 19.0.1**, using the official portable desktop build and a separate disposable profile.
- Plugin **Notes to Actions 1.0.0**, by **Mostafa ELAraby**. The Obsidian screenshots were refreshed after the submission audit renamed the display name.

These screenshots show the direct local REST API workflow. No Super Productivity companion was installed. They are not mockups or captures of the web build.

| Image                                                          | Installation step                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| [01-enable-obsidian-plugin.png](01-enable-obsidian-plugin.png) | Enable the installed Obsidian plugin                        |
| [02-enable-local-rest-api.png](02-enable-local-rest-api.png)   | Enable the desktop REST API and locate its access token     |
| [03-configure-obsidian.png](03-configure-obsidian.png)         | Set the daily-note path and token, then test the connection |
| [04-daily-note.png](04-daily-note.png)                         | Prepare today's note with unchecked tasks                   |
| [05-sync-command.png](05-sync-command.png)                     | Run the sync command from Obsidian's command palette        |
| [06-imported-tasks.png](06-imported-tasks.png)                 | Verify imported tasks and existing-tag matching in Today    |

## Sample data

The demo note is `Daily/2026-09-18.md`:

```markdown
# Today

- [ ] Draft the proposal #work
- [ ] Read the next chapter #reading
- [ ] Review experiment notes #research
- [x] This one is already done
```

Tags named `work` and `reading` were created manually before importing. The `research` tag was intentionally absent. The first import created three tasks, and the second created none and skipped all three. The checked item was not imported.

## Capture and privacy

Images are cropped captures of the real application UI. The Super Productivity access-token field was masked during screenshot capture; Obsidian's password input masks the token itself. No personal notes, task data, or usable access token are published. The demo API is disabled after capture.

To refresh these images, use fresh desktop profiles and the sample above, follow the root README, conceal the access token before capturing, and verify both the first and repeated import. Keep the screenshots and instructions on the same workflow and record the actual app versions. The date in screenshots is illustrative; users should follow their current Today path preview.
