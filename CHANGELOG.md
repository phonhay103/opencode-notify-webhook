# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

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
