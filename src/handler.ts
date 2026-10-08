import { basename } from "node:path";
import type { ResolvedConfig, ResolvedTarget } from "./config.ts";
import {
  defaultMessage,
  emojiFor,
  eventPayload,
  extractError,
  extractParentID,
  extractPermission,
  extractSessionID,
  lastAssistantText,
  matchesEvent,
  wantsAssistantText,
  type RawEvent,
} from "./events.ts";
import { replaceTokens } from "./payload.ts";
import { prepareRequest } from "./targets.ts";
import { sendWebhook, type SendResult } from "./transport.ts";
import type { NotificationContext } from "./types.ts";

export interface SessionLike {
  title?: string;
  parentID?: string | null;
  parentId?: string | null;
}

/** The subset of the plugin context the notifier needs. */
export interface PluginHost {
  location?: {
    directory?: string;
    project?: { id?: string; canonical?: string; directory?: string };
  };
  session: {
    get(input: { sessionID: string }): Promise<SessionLike | undefined>;
    context(input: { sessionID: string }): Promise<readonly unknown[]>;
  };
}

export interface Notifier {
  readonly config: ResolvedConfig;
  enabled: boolean;
  handle(event: RawEvent): Promise<void>;
  sendTest(targetName?: string): Promise<{ target: string; result: SendResult }[]>;
  setEnabled(value: boolean): void;
  status(): string;
}

function slugify(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

function buildContext(
  host: PluginHost,
  event: RawEvent,
  session: SessionLike | undefined,
  sessionID: string | undefined,
  eventConfig: { message?: string; title?: string } | undefined,
  assistantText: string,
): NotificationContext {
  const directory =
    event.location?.directory ?? host.location?.directory ?? process.cwd();
  const projectID = host.location?.project?.id ?? "";
  const canonical = host.location?.project?.canonical ?? directory;
  const worktree = host.location?.project?.directory ?? canonical;

  const payload = eventPayload(event);
  const payloadTitle =
    typeof payload.title === "string" ? payload.title : "";

  const context: NotificationContext = {
    event: event.type,
    message: eventConfig?.message ?? defaultMessage(event.type),
    title: eventConfig?.title ?? session?.title ?? payloadTitle,
    emoji: emojiFor(event.type),
    timestamp: new Date().toISOString(),
    sessionID: sessionID ?? "",
    sessionTitle: session?.title ?? payloadTitle,
    directory,
    project: projectID,
    projectName: canonical ? basename(canonical) : slugify(directory),
    worktree,
    assistantText,
    error: extractError(event),
    permission: extractPermission(event),
  };

  context.message = replaceTokens(context.message, context);
  context.title = replaceTokens(context.title, context);
  return context;
}

function makeContext(
  host: PluginHost,
  overrides: Partial<NotificationContext>,
): NotificationContext {
  const directory = host.location?.directory ?? process.cwd();
  const canonical = host.location?.project?.canonical ?? directory;
  return {
    event: "test",
    message: "Test notification from opencode-notify-webhook",
    title: "opencode-notify-webhook",
    emoji: "🔔",
    timestamp: new Date().toISOString(),
    sessionID: "",
    sessionTitle: "",
    directory,
    project: host.location?.project?.id ?? "",
    projectName: canonical ? basename(canonical) : slugify(directory),
    worktree: host.location?.project?.directory ?? canonical,
    assistantText: "",
    error: "",
    permission: "",
    ...overrides,
  };
}

async function dispatch(
  target: ResolvedTarget,
  context: NotificationContext,
): Promise<SendResult> {
  const request = prepareRequest(target, context);
  if (!request.url) {
    return { ok: false, error: "missing url", attempts: 0 };
  }
  return sendWebhook(request, {
    timeoutMs: target.timeoutMs,
    retries: target.retries,
  });
}

/** Create the runtime notifier bound to a plugin host and resolved config. */
export function createNotifier(
  host: PluginHost,
  config: ResolvedConfig,
  initialEnabled: boolean,
): Notifier {
  let enabled = initialEnabled;

  async function handle(event: RawEvent): Promise<void> {
    if (!enabled) return;

    const eventConfig = config.events[event.type];
    if (!eventConfig || eventConfig.notify === false) return;

    const targets = config.targets.filter((target) =>
      matchesEvent(event.type, target.events),
    );
    if (targets.length === 0) return;

    const sessionID = extractSessionID(event);
    let session: SessionLike | undefined;
    if (sessionID) {
      try {
        session = await host.session.get({ sessionID });
      } catch (error) {
        console.error(
          `[opencode-notify-webhook] session lookup failed: ${
            (error as Error).message
          }`,
        );
      }
    }

    const parentID = extractParentID(event, session);
    if (parentID && !config.includeSubagents) return;

    let assistantText = "";
    if (sessionID && wantsAssistantText(event.type)) {
      try {
        const messages = await host.session.context({ sessionID });
        assistantText = lastAssistantText(messages);
      } catch {
        assistantText = "";
      }
    }

    const context = buildContext(
      host,
      event,
      session,
      sessionID,
      eventConfig,
      assistantText,
    );

    await Promise.allSettled(
      targets.map(async (target) => {
        const result = await dispatch(target, context);
        if (result.ok) {
          console.log(
            `[opencode-notify-webhook] ${target.name} -> ${result.status} (${result.attempts} attempt(s))`,
          );
        } else {
          console.error(
            `[opencode-notify-webhook] ${target.name} failed: ${result.error}`,
          );
        }
      }),
    );
  }

  async function sendTest(
    targetName?: string,
  ): Promise<{ target: string; result: SendResult }[]> {
    const targets = targetName
      ? config.targets.filter((target) => target.name === targetName)
      : config.targets;
    const context = makeContext(host, {});
    const results: { target: string; result: SendResult }[] = [];
    for (const target of targets) {
      const result = await dispatch(target, context);
      results.push({ target: target.name, result });
    }
    return results;
  }

  function setEnabled(value: boolean): void {
    enabled = value;
  }

  function status(): string {
    const tracked = Object.keys(config.events);
    return [
      `Webhook notifications: ${enabled ? "enabled" : "disabled"}`,
      `Targets: ${config.targets.length}${
        config.targets.length
          ? ` (${config.targets.map((target) => target.name).join(", ")})`
          : ""
      }`,
      `Tracked events: ${tracked.length ? tracked.join(", ") : "(none)"}`,
      `Include subagents: ${config.includeSubagents}`,
    ].join("\n");
  }

  return {
    config,
    get enabled() {
      return enabled;
    },
    set enabled(value: boolean) {
      enabled = value;
    },
    handle,
    sendTest,
    setEnabled,
    status,
  };
}
