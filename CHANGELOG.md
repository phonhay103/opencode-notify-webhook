# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
