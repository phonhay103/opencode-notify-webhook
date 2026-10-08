import { basename, resolve } from "node:path";
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
    workspaceID?: string;
    project?: { id?: string; canonical?: string; directory?: string };
  };
  session: {
    get(input: { sessionID: string }): Promise<SessionLike | undefined>;
    context(input: { sessionID: string }): Promise<readonly unknown[]>;
  };
}

export interface Notifier {
  readonly config: ResolvedConfig;
  readonly enabled: boolean;
  handle(event: RawEvent): Promise<void>;
}

function slugify(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

function normalizeDirectory(directory: string): string {
  try {
    return resolve(directory);
  } catch {
    return directory;
  }
}

/**
 * Whether an event belongs to this plugin instance's location.
 *
 * A globally configured plugin is loaded once per active location and every
 * instance receives the server-wide event stream, so matching the event's
 * location to the instance is what prevents duplicate notifications.
 */
function belongsToInstanceLocation(
  host: PluginHost,
  event: RawEvent,
): boolean {
  const hostDirectory = host.location?.directory;
  const eventDirectory = event.location?.directory;
  if (
    hostDirectory &&
    eventDirectory &&
    normalizeDirectory(hostDirectory) !== normalizeDirectory(eventDirectory)
  ) {
    return false;
  }

  const hostWorkspace = host.location?.workspaceID;
  const eventWorkspace = event.location?.workspaceID;
  if (hostWorkspace && eventWorkspace && hostWorkspace !== eventWorkspace) {
    return false;
  }

  return true;
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
): Notifier {
  const enabled = config.enabled;

  async function handle(event: RawEvent): Promise<void> {
    if (!enabled) return;

    if (config.scope === "location" && !belongsToInstanceLocation(host, event)) {
      return;
    }

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

  return {
    config,
    get enabled() {
      return enabled;
    },
    handle,
  };
}
