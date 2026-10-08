# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- **Local development loads again when the package is installed globally.**
  OpenCode dedups plugins by their declared id and merges the global config
  before the project config, so a local entry reusing `opencode-notify-webhook`
  was shadowed by the installed package and never loaded. `npm run dev:setup`
  now generates a gitignored wrapper (`.opencode/dev/notify-dev/`, id
  `opencode-notify-webhook-dev`) that re-registers the same setup, and the local
  entry is a directory (plugin entries must be directories, not `.ts` files).

### Added

- `src/index.ts` exports `setup` and `PLUGIN_ID` so the development wrapper can
  re-register the plugin under a different id.

## [0.2.0] - 2026-10-09

### Changed

- **Fixed automatic notifications.** The default event set now uses the event
  names OpenCode V2 actually emits: `session.execution.succeeded`,
  `session.execution.failed`, `permission.asked`, and `form.created`. Previously
  the defaults (`session.idle`, `session.error`, `permission.asked`,
  `question.asked`) never fired for a completed run because V2 does not emit
  `session.error` or `question.asked`, and `session.idle` is not emitted in the
  run flow.
- **Removed the agent tools** (`notify_toggle`, `notify_status`,
  `notify_test`) and the persisted runtime toggle. Notifications are driven
  purely by the server event stream; use the config to enable/disable.
- Per-event messages, emoji, and error extraction now cover the V2 execution
  events; `form.created` session ids are read from the nested `form` object.

### Fixed

- **Development no longer mutates the global config.** `npm run dev:setup` used
  to delete the globally installed copy of this package from
  `~/.config/opencode/opencode.json` (with no restore), so developing here
  disabled real notifications everywhere. It now writes a gitignored
  `.opencode/opencode.jsonc` that prepends the `-opencode-notify-webhook`
  directive (V2 Control syntax) to disable the global copy for this location
  only, then loads the local source directory (`package: "../src"`). The global
  config is left untouched.
- Removed the deprecated `dev:link`/`dev:unlink` auto-discovery flow, which
  could load the plugin a second time without `options`.

### Added

- `npm run dev:isolate` — runs `opencode run --standalone` against a throwaway
  `OPENCODE_CONFIG_DIR` and temp work dir, captures the webhooks it sends, and
  exits non-zero when none arrived. No global or project config is read or
  written.

## [0.1.4] - 2026-10-09

### Fixed

- Scope events to the plugin instance's location by default (`scope:
  "location"`). OpenCode loads a globally configured plugin once per active
  location and each instance receives the server-wide event stream, so without
  this filter a single event sent one webhook per open location. Set
  `scope: "global"` to restore the previous behavior.

## [0.1.3] - 2026-10-09

### Fixed

- Declare `@opencode/plugin` as a runtime `dependency` (was a peer/dev-only
  dependency), matching the OpenCode plugin manifest so the host can resolve
  the plugin API when installing from npm.

## [0.1.2] - 2026-10-09

### Added

- Release pipeline now publishes via npm trusted publishing (OIDC) from GitHub
  Actions; this version verifies that flow end to end.

## [0.1.1] - 2026-10-09

### Fixed

- Republished with a clean `package.json`. The 0.1.0 tarball mistakenly
  declared 157 unrelated runtime dependencies and a bogus `main` field.

## [0.1.0] - 2026-10-09

### Added

- Initial release: a V2-native OpenCode plugin that sends webhook
  notifications.
- Multiple targets with per-target event filters, method, headers, auth,
  timeout, and payload format.
- Presets for Slack, Discord, ntfy, Gotify, Telegram, Microsoft Teams,
  Mattermost, and generic JSON/text endpoints.
- Configuration from JSON files and/or plugin `options`, with `${ENV_VAR}`
  substitution.
- Fire-and-forget transport with timeout and bounded retry/backoff.
- Runtime tools: `notify_toggle`, `notify_status`, `notify_test`.
- Subagent filtering and per-event message/title templating.
