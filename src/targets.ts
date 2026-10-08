import type { ResolvedTarget } from "./config.ts";
import { renderTemplate, replaceTokens } from "./payload.ts";
import type { NotificationContext } from "./types.ts";

/** A fully prepared HTTP request ready to be sent. */
export interface PreparedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function jsonRequest(
  url: string | undefined,
  method: string,
  headers: Record<string, string>,
  body: unknown,
): PreparedRequest {
  return {
    url: url ?? "",
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

function applyAuth(
  target: ResolvedTarget,
  headers: Record<string, string>,
  context: NotificationContext,
): void {
  if (target.bearer) {
    headers.Authorization = `Bearer ${replaceTokens(target.bearer, context)}`;
  } else if (target.basicAuth) {
    const raw = `${target.basicAuth.username}:${target.basicAuth.password}`;
    headers.Authorization = `Basic ${Buffer.from(raw).toString("base64")}`;
  }
}

/** Build the outgoing request for a target and notification context. */
export function prepareRequest(
  target: ResolvedTarget,
  context: NotificationContext,
): PreparedRequest {
  const type = (target.type || "generic").toLowerCase();
  const method = target.method || "POST";
  const headers: Record<string, string> = { ...target.headers };
  applyAuth(target, headers, context);

  switch (type) {
    case "slack":
    case "mattermost":
      return jsonRequest(target.url, method, headers, { text: context.message });

    case "teams":
      return jsonRequest(target.url, method, headers, { text: context.message });

    case "discord": {
      const body: Record<string, unknown> = { content: context.message };
      if (target.username) body.username = target.username;
      if (target.avatarUrl) body.avatar_url = target.avatarUrl;
      return jsonRequest(target.url, method, headers, body);
    }

    case "ntfy": {
      const ntfyHeaders: Record<string, string> = {
        "Content-Type": "text/plain",
        ...headers,
        Title: context.title || context.event,
      };
      if (target.priority !== undefined) {
        ntfyHeaders.Priority = String(target.priority);
      }
      if (target.tags && target.tags.length > 0) {
        ntfyHeaders.Tags = target.tags.join(",");
      }
      return { url: target.url ?? "", method, headers: ntfyHeaders, body: context.message };
    }

    case "gotify": {
      let url = target.url ?? "";
      if (target.token && !/[?&]token=/.test(url)) {
        url += `${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(
          target.token,
        )}`;
      }
      return jsonRequest(url, method, headers, {
        title: context.title || context.event,
        message: context.message,
        priority: target.priority ?? 5,
      });
    }

    case "telegram": {
      const token = target.token ?? "";
      const url =
        target.url || `https://api.telegram.org/bot${token}/sendMessage`;
      const text = context.title
        ? `${context.title}\n${context.message}`
        : context.message;
      return jsonRequest(url, method, headers, {
        chat_id: target.chatId ?? "",
        text,
        disable_web_page_preview: true,
      });
    }

    case "generic":
    default: {
      if (target.payload !== undefined) {
        const rendered = renderTemplate(target.payload, context);
        if (typeof rendered === "string") {
          return {
            url: target.url ?? "",
            method,
            headers: { "Content-Type": "text/plain", ...headers },
            body: rendered,
          };
        }
        return jsonRequest(target.url, method, headers, rendered);
      }
      if (target.format === "text") {
        const lines = [
          context.emoji ? `${context.emoji} ${context.message}` : context.message,
          context.projectName
            ? `${context.projectName}${context.worktree ? ` | ${context.worktree}` : ""}`
            : context.directory,
          context.event,
        ].filter((line) => line.length > 0);
        return {
          url: target.url ?? "",
          method,
          headers: { "Content-Type": "text/plain", ...headers },
          body: lines.join("\n"),
        };
      }
      return jsonRequest(target.url, method, headers, {
        event: context.event,
        message: context.message,
        title: context.title,
        emoji: context.emoji,
        timestamp: context.timestamp,
        sessionID: context.sessionID,
        sessionTitle: context.sessionTitle,
        directory: context.directory,
        project: context.project,
        projectName: context.projectName,
        worktree: context.worktree,
        ...(context.error ? { error: context.error } : {}),
        ...(context.permission ? { permission: context.permission } : {}),
        ...(context.assistantText ? { assistantText: context.assistantText } : {}),
      });
    }
  }
}
