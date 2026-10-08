import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
  EventConfig,
  JsonValue,
  NotifyConfig,
  TargetConfig,
} from "./types.ts";

export const CONFIG_FILENAME = "opencode-notify-webhook.json";

/** Events tracked when the config does not declare an `events` map. */
export const DEFAULT_EVENTS = [
  "session.idle",
  "session.error",
  "permission.asked",
  "question.asked",
] as const;

/** A target with every default resolved. */
export interface ResolvedTarget {
  name: string;
  type: string;
  url?: string;
  events: string[];
  method: string;
  headers: Record<string, string>;
  timeoutMs: number;
  retries: number;
  format: "text" | "json";
  payload?: JsonValue;
  bearer?: string;
  basicAuth?: { username: string; password: string };
  token?: string;
  chatId?: string;
  priority?: number;
  tags?: string[];
  username?: string;
  avatarUrl?: string;
}

export interface ResolvedConfig {
  enabled: boolean;
  includeSubagents: boolean;
  scope: "location" | "global";
  timeoutMs: number;
  retries: number;
  method: string;
  events: Record<string, EventConfig>;
  targets: ResolvedTarget[];
}

export interface LoadConfigInput {
  directory: string;
  options?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  /** Injectable file reader (used by tests). */
  readFile?: (path: string) => string | undefined;
}

/** Replace `${VAR}` and `$VAR` in every string of a JSON value. */
export function substituteEnv<T>(
  value: T,
  env: NodeJS.ProcessEnv = process.env,
): T {
  if (typeof value === "string") {
    return substituteString(value, env) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => substituteEnv(entry, env)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = substituteEnv(entry, env);
    }
    return out as unknown as T;
  }
  return value;
}

function substituteString(input: string, env: NodeJS.ProcessEnv): string {
  return input.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_match, braced: string | undefined, plain: string | undefined) => {
      const name = braced ?? plain ?? "";
      return env[name] ?? "";
    },
  );
}

/** Config file search order, lowest priority first. */
export function configPaths(
  directory: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const paths: string[] = [];
  const xdg = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  paths.push(join(xdg, "opencode", CONFIG_FILENAME));
  paths.push(join(directory, CONFIG_FILENAME));
  paths.push(join(directory, ".opencode", CONFIG_FILENAME));
  if (env.OPENCODE_NOTIFY_WEBHOOK_CONFIG) {
    paths.push(resolve(env.OPENCODE_NOTIFY_WEBHOOK_CONFIG));
  }
  return paths;
}

function defaultReadFile(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** Merge a higher-priority config over a lower-priority one. */
export function mergeConfig(
  base: NotifyConfig,
  override: NotifyConfig,
): NotifyConfig {
  return {
    enabled: override.enabled ?? base.enabled,
    includeSubagents: override.includeSubagents ?? base.includeSubagents,
    defaults: { ...base.defaults, ...override.defaults },
    events: { ...base.events, ...override.events },
    targets: override.targets ?? base.targets,
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

/** Fill in defaults so downstream code can rely on every field. */
export function resolveConfig(config: NotifyConfig): ResolvedConfig {
  const defaults = config.defaults ?? {};
  const method = (defaults.method ?? "POST").toUpperCase();
  const timeoutMs = positive(defaults.timeoutMs, 10_000);
  const retries = nonNegative(defaults.retries, 2);

  const events: Record<string, EventConfig> =
    config.events && Object.keys(config.events).length > 0
      ? config.events
      : Object.fromEntries(DEFAULT_EVENTS.map((event) => [event, {}]));

  const targets: ResolvedTarget[] = [];
  (config.targets ?? []).forEach((target, index) => {
    if (target.enabled === false) return;
    const type = (target.type ?? "generic").toLowerCase();
    targets.push({
      name: target.name ?? `${type}${index + 1}`,
      type,
      url: target.url,
      events:
        target.events && target.events.length > 0 ? target.events : ["*"],
      method: (target.method ?? method).toUpperCase(),
      headers: { ...(target.headers ?? {}) },
      timeoutMs: positive(target.timeoutMs, timeoutMs),
      retries: nonNegative(target.retries, retries),
      format: target.format ?? "json",
      payload: target.payload,
      bearer: target.bearer,
      basicAuth: target.basicAuth,
      token: target.token,
      chatId: target.chatId,
      priority: target.priority,
      tags: target.tags,
      username: target.username,
      avatarUrl: target.avatarUrl,
    });
  });

  return {
    enabled: config.enabled ?? true,
    includeSubagents: config.includeSubagents ?? false,
    scope: config.scope === "global" ? "global" : "location",
    timeoutMs,
    retries,
    method,
    events,
    targets,
  };
}

/**
 * Load configuration from the config files plus the plugin `options`,
 * then resolve defaults. Later sources win.
 */
export function loadConfig(input: LoadConfigInput): ResolvedConfig {
  const env = input.env ?? process.env;
  const readFile = input.readFile ?? defaultReadFile;

  const sources: NotifyConfig[] = [];
  for (const path of configPaths(input.directory, env)) {
    const text = readFile(path);
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") {
        sources.push(substituteEnv(parsed as NotifyConfig, env));
      }
    } catch (error) {
      console.error(
        `[opencode-notify-webhook] invalid config at ${path}: ${
          (error as Error).message
        }`,
      );
    }
  }

  if (input.options && Object.keys(input.options).length > 0) {
    sources.push(substituteEnv(input.options as NotifyConfig, env));
  }

  const merged = sources.reduce<NotifyConfig>(
    (acc, source) => mergeConfig(acc, source),
    {},
  );
  return resolveConfig(merged);
}
