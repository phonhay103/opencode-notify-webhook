import type { JsonValue, NotificationContext } from "./types.ts";

type TokenValue = string | number | undefined;

/** Resolve a single `{{token}}` name against the context. */
export function getToken(
  context: NotificationContext,
  token: string,
): TokenValue {
  switch (token) {
    case "event":
      return context.event;
    case "message":
    case "msg":
      return context.message;
    case "title":
      return context.title;
    case "emoji":
      return context.emoji;
    case "timestamp":
      return context.timestamp;
    case "session.id":
    case "sessionID":
      return context.sessionID;
    case "session.title":
    case "sessionTitle":
      return context.sessionTitle;
    case "directory":
      return context.directory;
    case "project":
      return context.project;
    case "project.name":
    case "projectName":
      return context.projectName;
    case "worktree":
      return context.worktree;
    case "assistant.text":
      return context.assistantText;
    case "error":
      return context.error;
    case "permission":
    case "permission.command":
      return context.permission;
    default:
      return undefined;
  }
}

/** Replace every `{{token}}` in a string. Unknown tokens become empty. */
export function replaceTokens(
  template: string,
  context: NotificationContext,
): string {
  return template.replace(
    /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g,
    (_match, token: string) => {
      const value = getToken(context, token);
      return value === undefined || value === null ? "" : String(value);
    },
  );
}

/** Recursively render `{{token}}` inside a JSON value. */
export function renderTemplate(
  template: JsonValue,
  context: NotificationContext,
): JsonValue {
  if (typeof template === "string") return replaceTokens(template, context);
  if (Array.isArray(template)) {
    return template.map((entry) => renderTemplate(entry, context));
  }
  if (template && typeof template === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, value] of Object.entries(template)) {
      out[key] = renderTemplate(value as JsonValue, context);
    }
    return out;
  }
  return template;
}

/** Compose the message from an override or the event default, then render. */
export function renderMessage(
  raw: string,
  context: NotificationContext,
): string {
  return replaceTokens(raw, context);
}
