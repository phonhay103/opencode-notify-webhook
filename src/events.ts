/** Helpers to interpret raw OpenCode event payloads. */

export interface RawEvent {
  type: string;
  /** V2 event payload. */
  data?: Record<string, unknown>;
  /** V1 event payload (kept for compatibility). */
  properties?: Record<string, unknown>;
  durable?: { aggregateID?: string; seq?: number; version?: number };
  location?: { directory?: string; workspaceID?: string };
}

/** Payload of a V2 (`data`) or V1 (`properties`) event. */
export function eventPayload(event: RawEvent): Record<string, unknown> {
  return event.data ?? event.properties ?? {};
}

/** True when `type` is matched by an event filter list. */
export function matchesEvent(type: string, filters: string[]): boolean {
  return filters.some((filter) => filter === "*" || filter === type);
}

/** Best-effort extraction of a session id from an event. */
export function extractSessionID(event: RawEvent): string | undefined {
  const props = eventPayload(event);
  // Some events (e.g. `form.created`) nest the session id under a sub-object.
  const form = props.form;
  const nested =
    form && typeof form === "object"
      ? (form as Record<string, unknown>).sessionID
      : undefined;
  const candidates = [
    props.sessionID,
    props.sessionId,
    nested,
    props.id,
    props.session,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  const aggregate = event.durable?.aggregateID;
  if (typeof aggregate === "string" && aggregate.startsWith("ses_")) {
    return aggregate;
  }
  return undefined;
}

/** Best-effort extraction of a parent (subagent) session id. */
export function extractParentID(
  event: RawEvent,
  session?: { parentID?: string | null; parentId?: string | null },
): string | undefined {
  const props = eventPayload(event);
  const candidates = [
    props.parentID,
    props.parentId,
    props.parentSessionID,
    props.parentSessionId,
    session?.parentID,
    session?.parentId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

/** Extract a human-readable error message when present. */
export function extractError(event: RawEvent): string {
  const props = eventPayload(event);
  const error = props.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "detail", "reason"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  if (typeof props.message === "string" && event.type.includes("error")) {
    return props.message;
  }
  return "";
}

/** Extract a command or resource path for permission events. */
export function extractPermission(event: RawEvent): string {
  const props = eventPayload(event);
  const candidates = [
    props.command,
    props.resource,
    props.filePath,
    props.path,
    props.pattern,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  if (Array.isArray(props.resources)) {
    return props.resources.filter((r) => typeof r === "string").join(", ");
  }
  return "";
}

/** Default human message for a known event type. */
export function defaultMessage(type: string): string {
  switch (type) {
    case "session.execution.succeeded":
      return "Session finished and is waiting for input";
    case "session.execution.failed":
      return "Session encountered an error";
    case "session.execution.started":
      return "Session started running";
    case "session.execution.interrupted":
      return "Session execution was interrupted";
    case "session.idle":
      return "Session finished and is waiting for input";
    case "session.error":
      return "Session encountered an error";
    case "permission.asked":
      return "Permission required to continue";
    case "permission.replied":
      return "Permission request answered";
    case "form.created":
      return "Input required to continue";
    case "form.replied":
      return "Form answered";
    case "form.cancelled":
      return "Form cancelled";
    case "question.asked":
      return "Input required to continue";
    case "question.replied":
      return "Question answered";
    case "session.created":
      return "New session started";
    case "session.deleted":
      return "Session ended";
    case "session.compaction.ended":
    case "session.compacted":
      return "Session context compacted";
    case "todo.updated":
      return "Task list updated";
    case "filesystem.changed":
    case "file.edited":
      return "File edited";
    default:
      return type;
  }
}

/** Emoji prefix for a known event type (`""` when unknown). */
export function emojiFor(type: string): string {
  switch (type) {
    case "session.execution.succeeded":
      return "✅";
    case "session.execution.failed":
      return "❌";
    case "session.execution.started":
      return "▶️";
    case "session.execution.interrupted":
      return "⏹️";
    case "session.idle":
      return "✅";
    case "session.error":
      return "❌";
    case "permission.asked":
      return "🔐";
    case "permission.replied":
      return "✔️";
    case "form.created":
      return "❓";
    case "form.replied":
      return "💬";
    case "question.asked":
      return "❓";
    case "question.replied":
      return "💬";
    case "session.created":
      return "🚀";
    case "session.deleted":
      return "🗑️";
    case "session.compaction.ended":
    case "session.compacted":
      return "🗜️";
    case "todo.updated":
      return "📋";
    case "filesystem.changed":
    case "file.edited":
      return "📝";
    default:
      return "";
  }
}

/** Events worth reading the transcript for (to include the last answer). */
export function wantsAssistantText(type: string): boolean {
  return (
    type === "session.execution.succeeded" ||
    type === "session.execution.failed" ||
    type === "session.idle" ||
    type === "session.error"
  );
}

/** Extract the last assistant text from session messages. */
export function lastAssistantText(messages: readonly unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as {
      role?: string;
      parts?: unknown[];
      info?: { role?: string; parts?: unknown[] };
    };
    const role = message?.info?.role ?? message?.role;
    if (role !== "assistant") continue;
    const parts = message?.parts ?? message?.info?.parts ?? [];
    const text = parts
      .filter(
        (part): part is { type: string; text?: string } =>
          !!part && typeof part === "object" && (part as { type?: string }).type === "text",
      )
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}
