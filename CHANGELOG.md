# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
