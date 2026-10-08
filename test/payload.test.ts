import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig } from "../src/config.ts";
import { replaceTokens, renderTemplate } from "../src/payload.ts";
import { prepareRequest } from "../src/targets.ts";
import type { NotificationContext } from "../src/types.ts";

const context: NotificationContext = {
  event: "session.idle",
  message: "Session finished",
  title: "My Session",
  emoji: "✅",
  timestamp: "2026-01-01T00:00:00.000Z",
  sessionID: "ses_1",
  sessionTitle: "My Session",
  directory: "/work/app",
  project: "proj_1",
  projectName: "app",
  worktree: "/work/app",
  assistantText: "Done.",
  error: "",
  permission: "",
};

function target(partial: Record<string, unknown>) {
  const resolved = resolveConfig({
    targets: [{ url: "https://example.com", ...partial }],
  });
  return resolved.targets[0];
}

test("replaceTokens resolves known tokens and blanks unknown", () => {
  assert.equal(
    replaceTokens("{{emoji}} {{message}} @ {{session.title}} {{nope}}", context),
    "✅ Session finished @ My Session ",
  );
});

test("renderTemplate renders nested values", () => {
  assert.deepEqual(
    renderTemplate(
      { text: "{{message}}", meta: { event: "{{event}}", n: 3 } },
      context,
    ),
    { text: "Session finished", meta: { event: "session.idle", n: 3 } },
  );
});

test("slack payload is a text object", () => {
  const request = prepareRequest(target({ type: "slack" }), context);
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.body ?? "{}"), {
    text: "Session finished",
  });
});

test("discord payload includes content and optional identity", () => {
  const request = prepareRequest(
    target({ type: "discord", username: "bot" }),
    context,
  );
  assert.deepEqual(JSON.parse(request.body ?? "{}"), {
    content: "Session finished",
    username: "bot",
  });
});

test("ntfy uses headers for title/priority/tags and plain body", () => {
  const request = prepareRequest(
    target({ type: "ntfy", priority: 4, tags: ["a", "b"] }),
    context,
  );
  assert.equal(request.headers["Content-Type"], "text/plain");
  assert.equal(request.headers.Title, "My Session");
  assert.equal(request.headers.Priority, "4");
  assert.equal(request.headers.Tags, "a,b");
  assert.equal(request.body, "Session finished");
});

test("gotify appends the token query parameter", () => {
  const request = prepareRequest(
    target({ type: "gotify", url: "https://gotify/message", token: "APP" }),
    context,
  );
  assert.equal(request.url, "https://gotify/message?token=APP");
  assert.deepEqual(JSON.parse(request.body ?? "{}"), {
    title: "My Session",
    message: "Session finished",
    priority: 5,
  });
});

test("telegram builds the bot url and chat payload", () => {
  const request = prepareRequest(
    target({ type: "telegram", token: "T", chatId: "42", url: undefined }),
    context,
  );
  assert.equal(request.url, "https://api.telegram.org/botT/sendMessage");
  assert.deepEqual(JSON.parse(request.body ?? "{}"), {
    chat_id: "42",
    text: "My Session\nSession finished",
    disable_web_page_preview: true,
  });
});

test("generic text format renders the summary block", () => {
  const request = prepareRequest(target({ type: "generic", format: "text" }), context);
  assert.equal(request.headers["Content-Type"], "text/plain");
  assert.equal(request.body, "✅ Session finished\napp | /work/app\nsession.idle");
});

test("generic json format emits a structured body", () => {
  const request = prepareRequest(target({ type: "generic" }), context);
  const body = JSON.parse(request.body ?? "{}");
  assert.equal(body.event, "session.idle");
  assert.equal(body.projectName, "app");
  assert.equal(body.assistantText, "Done.");
});

test("generic custom payload templates are rendered", () => {
  const request = prepareRequest(
    target({
      type: "generic",
      payload: { text: "{{message}}", session: "{{session.id}}" },
    }),
    context,
  );
  assert.deepEqual(JSON.parse(request.body ?? "{}"), {
    text: "Session finished",
    session: "ses_1",
  });
});

test("bearer and basic auth set the Authorization header", () => {
  const bearer = prepareRequest(target({ type: "slack", bearer: "tok" }), context);
  assert.equal(bearer.headers.Authorization, "Bearer tok");

  const basic = prepareRequest(
    target({ type: "slack", basicAuth: { username: "u", password: "p" } }),
    context,
  );
  assert.equal(
    basic.headers.Authorization,
    `Basic ${Buffer.from("u:p").toString("base64")}`,
  );
});
