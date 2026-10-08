# opencode-notify-webhook

A **V2-native** [OpenCode](https://opencode.ai) plugin that forwards notable
events to one or more webhooks. Send notifications to Slack, Discord, ntfy,
Gotify, Telegram, Microsoft Teams, Mattermost, or any generic endpoint when a
session finishes, errors, needs permission, or asks a question.

Unlike most existing OpenCode webhook plugins (which target the V1 plugin API),
this plugin is built on the V2 API: `Plugin.define` + `ctx.event.subscribe()`.

## Features

- **Multiple targets**, each with its own event filter, HTTP method, headers,
  auth, timeout, and payload format.
- **Service presets**: `slack`, `discord`, `ntfy`, `gotify`, `telegram`,
  `teams`, `mattermost`, and `generic` (text / JSON / custom template).
- **Config from a JSON file and/or plugin options** in `opencode.json`.
- **`${ENV_VAR}` substitution** in URLs, headers, and tokens.
- **Fire-and-forget transport** with timeout + bounded retry and backoff, so a
  broken webhook can never block the agent.
- **Runtime tools** so the agent can toggle notifications, report status, and
  send a test without a restart.
- **Subagent filtering** (child sessions are ignored by default).

## Requirements

- OpenCode **v2** (`@opencode/plugin` >= 2.0.0).
- At runtime the plugin uses the host's `fetch` (Bun in OpenCode). Node
  >= 22.6 is only needed for local development/testing.

## Install

### From npm

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-notify-webhook@latest"]
}
```

Restart OpenCode (or restart a long-running `opencode serve`/`opencode web`
process) so it reloads plugins.

### From a local checkout

OpenCode v2 discovers local plugins from any `.opencode/plugins/` directory.
Generate a dev entry that re-exports this package (it uses a relative path, so
nothing machine-specific is written):

```bash
cd /path/to/opencode-notify-webhook
npm install
npm run dev:link     # creates .opencode/plugins/notify.ts
```

Restart OpenCode (or reload the location). The plugin is picked up from
`.opencode/plugins/notify.ts`; remove it with `npm run dev:unlink`.

Local discovery does not pass plugin `options`, so for a dev checkout put your
configuration in `opencode-notify-webhook.json` (below) instead of `options`.


## Quick start

Create `~/.config/opencode/opencode-notify-webhook.json`:

```json
{
  "targets": [
    {
      "url": "https://ntfy.sh/my-topic",
      "events": ["session.idle", "session.error", "permission.asked"]
    }
  ]
}
```

Restart OpenCode. You now get a push for each of those events.

## Configuration

Configuration is merged from these sources, **later sources win**:

1. `$XDG_CONFIG_HOME/opencode/opencode-notify-webhook.json`
   (usually `~/.config/opencode/opencode-notify-webhook.json`) — global
2. `<project>/opencode-notify-webhook.json`
3. `<project>/.opencode/opencode-notify-webhook.json` — project
4. `$OPENCODE_NOTIFY_WEBHOOK_CONFIG` — explicit path
5. The plugin `options` object in `opencode.json`

You can put a short config directly in `opencode.json`:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-notify-webhook",
      "options": {
        "targets": [{ "url": "https://ntfy.sh/my-topic" }]
      }
    }
  ]
}
```

### Root options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Master switch. |
| `includeSubagents` | boolean | `false` | Also notify for subagent (child) sessions. |
| `defaults` | object | — | Shared defaults: `timeoutMs`, `retries`, `method`. |
| `events` | object | see below | Per-event config. Keys are the allow-list of handled events. |
| `targets` | array | `[]` | Webhook destinations. |

When `events` is omitted the default set is used:
`session.idle`, `session.error`, `permission.asked`, `question.asked`.

### Per-event config

```json
{
  "events": {
    "session.idle": { "message": "Done: {{session.title}}" },
    "session.error": { "message": "Error in {{project.name}}", "title": "Alert" },
    "permission.asked": { "notify": false }
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `notify` | boolean | Set to `false` to mute this event. |
| `message` | string | Message body. Supports `{{tokens}}`. |
| `title` | string | Notification title. Supports `{{tokens}}`. |

### Target options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | `<type><n>` | Friendly name for logs and `notify_test`. |
| `type` | string | `generic` | `generic` / `slack` / `discord` / `ntfy` / `gotify` / `telegram` / `teams` / `mattermost`. |
| `url` | string | — | Webhook URL (optional for `telegram`, built from `token`). |
| `events` | string[] | `["*"]` | Event filter. `"*"` matches everything. |
| `method` | string | `POST` | HTTP method. |
| `headers` | object | `{}` | Extra HTTP headers. |
| `timeoutMs` | number | `10000` | Request timeout. |
| `retries` | number | `2` | Retry attempts after a failure. |
| `format` | `"text"` \| `"json"` | `json` | Payload format for `generic`. |
| `payload` | object/array/string | — | Template payload for `generic`. |
| `bearer` | string | — | Sets `Authorization: Bearer <value>`. |
| `basicAuth` | `{username,password}` | — | Sets `Authorization: Basic ...`. |
| `token` | string | — | App token (`gotify`) or bot token (`telegram`). |
| `chatId` | string | — | Chat id for `telegram`. |
| `priority` | number | — | Priority for `ntfy` / `gotify`. |
| `tags` | string[] | — | Tags for `ntfy`. |
| `username` | string | — | Bot username override for `discord`. |
| `avatarUrl` | string | — | Avatar URL override for `discord`. |
| `enabled` | boolean | `true` | Set to `false` to keep but disable a target. |

### Service presets

| `type` | Behavior |
| --- | --- |
| `slack` | JSON `{ "text": "..." }`. |
| `mattermost` | JSON `{ "text": "..." }`. |
| `teams` | JSON `{ "text": "..." }` (MessageCard). |
| `discord` | JSON `{ "content", "username?", "avatar_url?" }`. |
| `ntfy` | Plain-text body; `Title`, `Priority`, and `Tags` headers. |
| `gotify` | JSON `{ title, message, priority }`; `token` appended as a query parameter. |
| `telegram` | JSON to `https://api.telegram.org/bot<token>/sendMessage`; needs `chatId`. |
| `generic` | `format: "json"` (default), `format: "text"`, or a custom `payload` template. |

### Environment variables

Any string can reference environment variables with `${VAR}` or `$VAR`. Unset
variables become an empty string.

```json
{
  "targets": [
    { "type": "slack", "url": "${SLACK_WEBHOOK_URL}" },
    { "type": "generic", "url": "https://x", "headers": { "Authorization": "Bearer ${TOKEN}" } }
  ]
}
```

### Template tokens

Available in `message`, `title`, and `generic` `payload` fields:

| Token | Value |
| --- | --- |
| `{{event}}` | Event type, e.g. `session.idle`. |
| `{{message}}` / `{{msg}}` | The resolved message. |
| `{{title}}` | Notification title. |
| `{{emoji}}` | Event emoji. |
| `{{timestamp}}` | ISO-8601 timestamp. |
| `{{session.id}}` | Session id. |
| `{{session.title}}` | Session title. |
| `{{directory}}` | Session directory. |
| `{{project}}` | Project id. |
| `{{project.name}}` | Project folder name. |
| `{{worktree}}` | Worktree path. |
| `{{assistant.text}}` | Last assistant text (idle / error events). |
| `{{error}}` | Error message (error events). |
| `{{permission}}` | Command or resource (permission events). |

## Agent tools

When loaded, the plugin registers three tools:

- `notify_toggle(enable)` — enable/disable notifications at runtime. The choice
  is persisted per plugin via `ctx.storage`.
- `notify_status()` — enabled flag, target list, tracked events.
- `notify_test(target?)` — send a test payload to one or all targets.

## Events

`events` acts as an allow-list. Add any OpenCode event type to notify on it;
this keeps the plugin robust as event names evolve. Common events include
`session.idle`, `session.error`, `session.created`, `session.deleted`,
`session.compacted`, `session.status`, `permission.asked`, `permission.replied`,
`question.asked`, `todo.updated`, `file.edited`, and `command.executed`.
Per-target `events` filters further narrow which of those fire.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run test:coverage

# Load the local checkout into OpenCode for manual testing:
npm run dev:link    # writes .opencode/plugins/notify.ts (relative, gitignored)
npm run dev:unlink
```

The test suite covers config merging, env substitution, payload builders for
every preset, transport retry/timeout behavior, and end-to-end handling against
a local HTTP server.

## Publishing

Publishing is automated with npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) — no
long-lived npm token is required. Provenance is generated automatically.

1. Configure a trusted publisher for the package (workflow `publish.yml`, allow
   `npm publish`). On npmjs.com: package → Settings → Trusted Publisher →
   GitHub Actions; or from the CLI:

   ```bash
   npm trust github opencode-notify-webhook \
     --file publish.yml \
     --repo phonhay103/opencode-notify-webhook \
     --allow-publish
   ```

2. Bump the version and push a tag:

   ```bash
   npm version patch        # or minor / major
   git push --follow-tags
   ```

The tag push runs `.github/workflows/publish.yml`, which installs, typechecks,
tests, and publishes via OIDC.

> The first release of a brand-new package name needs its trusted publisher
> configured before the first tag push; a new trusted publisher configuration
> must complete its first successful publish within 2 days.

## License

MIT
