# API integration notes

The Obsidian plugin calls Super Productivity's **local REST API** directly. There is no Super Productivity companion plugin, WebSocket server, or pairing protocol.

The contract was checked against Super Productivity **v19.0.1** on September 18, 2026:

- [Local REST API documentation](https://github.com/super-productivity/super-productivity/blob/v19.0.1/docs/wiki/3.01-API.md#3-local-rest-api)
- [Renderer request handler and response shapes](https://github.com/super-productivity/super-productivity/blob/v19.0.1/src/app/core/electron/local-rest-api-handler.service.ts)
- [Obsidian public API](https://github.com/obsidianmd/obsidian-api)

## Requests

The base address is fixed at `http://127.0.0.1:3876`. All requests carry `Authorization: Bearer <access token>`. Users enable the API and copy the token in Super Productivity's Settings → General → Misc Settings.

| Endpoint                                 | Purpose                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `GET /status`                            | Test reachability and authentication without importing                |
| `GET /tasks?source=all&includeDone=true` | Read source markers from active, completed, and archived tasks        |
| `GET /tags`                              | Match existing tags by name                                           |
| `POST /tasks`                            | Create a task with a pending source marker                            |
| `PATCH /tasks/:id`                       | Set the final title, tags, day, backlink, and completed source marker |

Responses use `{ ok: true, data: ... }` or `{ ok: false, error: ... }`. Creation and updates return task objects; creation reads the ID from `data.id`. Unexpected task/tag lists abort the import before any creation.

The local REST API only lists tags. Accordingly, this plugin never creates tags. Hashtags are matched without case sensitivity, excluding the special Today tag. Unmatched hashtags are appended to the title as literal text. A later import does not modify an already imported task when a matching tag becomes available.

## Scheduling, titles, and recovery

Tasks specify `projectId: INBOX_PROJECT` and `dueDay: YYYY-MM-DD`. They are scheduled for the local calendar date; Today is not assigned through a special tag.

Task creation can interpret Super Productivity short syntax. The importer first creates a neutral **Obsidian task** title and a pending source marker, then patches the final literal title. A failed update or lost creation response can be recovered by finding that pending marker on the next import. No automatic mutation retry runs within a failed import.

The source ID hashes the persistent vault ID, note path, normalized title/tag set, and identical-line occurrence number. Checked siblings are counted to keep duplicate identities stable. Source markers and vault IDs are compatible with the earlier companion-based version; old pairing tokens are discarded when settings are migrated.

Imports are sequential and stop on failure. Completed work is preserved. Concurrent imports within the plugin are blocked. Disabling the plugin aborts active HTTP requests; already accepted server-side writes may finish and are reconciled on retry. This is not a distributed exactly-once guarantee across app instances.

## Transport and credentials

The client uses Node's built-in HTTP transport, connecting only to loopback without proxy environment variables or redirect following. Each request has a 15-second total deadline and a 32 MiB response cap. All active requests share an abort signal for plugin cleanup.

The REST access token is stored in Obsidian's plugin settings file and masked in the settings input. It is unrelated to any old pairing key. Notices do not include credentials or raw server response bodies. The client performs no startup polling and opens no listening socket.
