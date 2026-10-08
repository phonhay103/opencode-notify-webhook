/**
 * Shared types for opencode-notify-webhook.
 *
 * The configuration shape mirrors the plugin's JSON config file and the
 * `options` object passed through `opencode.json(c)`.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface BasicAuth {
  username: string;
  password: string;
}

/** Per-event overrides. */
export interface EventConfig {
  /** Force notifications on/off for this event. Defaults to on. */
  notify?: boolean;
  /** Message sent to targets. Supports `{{token}}` templates. */
  message?: string;
  /** Notification title. Supports `{{token}}` templates. */
  title?: string;
}

/** A single webhook destination. */
export interface TargetConfig {
  /** Friendly name used in logs and by `notify_test`. */
  name?: string;
  /**
   * Destination preset: `generic` | `slack` | `discord` | `ntfy` | `gotify`
   * | `telegram` | `teams` | `mattermost`.
   */
  type?: string;
  /** Webhook URL. Supports `${ENV_VAR}` substitution. */
  url?: string;
  /** Event filters. `"*"` matches everything. Defaults to `["*"]`. */
  events?: string[];
  /** HTTP method. Defaults to `POST`. */
  method?: string;
  /** Extra HTTP headers. */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Retry attempts after a failure. Defaults to `2`. */
  retries?: number;
  /** Payload format for the `generic` preset. */
  format?: "text" | "json";
  /** Template payload for the `generic` preset. */
  payload?: JsonValue;
  /** Convenience: sets `Authorization: Bearer <value>`. */
  bearer?: string;
  /** Convenience: sets `Authorization: Basic <base64>`. */
  basicAuth?: BasicAuth;
  /** App token for `gotify` / bot token for `telegram`. */
  token?: string;
  /** Chat id for `telegram`. */
  chatId?: string;
  /** Priority for `ntfy` / `gotify`. */
  priority?: number;
  /** Tags for `ntfy`, e.g. `["warning"]`. */
  tags?: string[];
  /** Override bot username for `discord`. */
  username?: string;
  /** Override avatar url for `discord`. */
  avatarUrl?: string;
  /** Set to false to disable a target without deleting it. */
  enabled?: boolean;
}

export interface DefaultsConfig {
  timeoutMs?: number;
  retries?: number;
  method?: string;
}

/** Root configuration object. */
export interface NotifyConfig {
  /** Master switch. Defaults to `true`. */
  enabled?: boolean;
  /** Also notify for subagent (child) sessions. Defaults to `false`. */
  includeSubagents?: boolean;
  /** Shared defaults applied to every target. */
  defaults?: DefaultsConfig;
  /** Per-event configuration. When omitted a sensible default set is used. */
  events?: Record<string, EventConfig>;
  /** Webhook destinations. */
  targets?: TargetConfig[];
}

/** Context passed to payload templating. */
export interface NotificationContext {
  event: string;
  message: string;
  title: string;
  emoji: string;
  timestamp: string;
  sessionID: string;
  sessionTitle: string;
  directory: string;
  project: string;
  projectName: string;
  worktree: string;
  assistantText: string;
  error: string;
  permission: string;
}
