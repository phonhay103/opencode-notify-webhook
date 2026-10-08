import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultMessage,
  eventPayload,
  extractError,
  extractParentID,
  extractPermission,
  extractSessionID,
  matchesEvent,
  wantsAssistantText,
} from "../src/events.ts";

test("eventPayload prefers V2 data over properties", () => {
  assert.deepEqual(
    eventPayload({ type: "x", data: { a: 1 }, properties: { a: 2 } }),
    { a: 1 },
  );
  assert.deepEqual(eventPayload({ type: "x", properties: { a: 2 } }), { a: 2 });
  assert.deepEqual(eventPayload({ type: "x" }), {});
});

test("extractSessionID reads V2 data.sessionID", () => {
  assert.equal(
    extractSessionID({ type: "session.created", data: { sessionID: "ses_v2" } }),
    "ses_v2",
  );
});

test("extractSessionID falls back to the durable aggregate id", () => {
  assert.equal(
    extractSessionID({
      type: "session.idle",
      data: {},
      durable: { aggregateID: "ses_fromdurable" },
    }),
    "ses_fromdurable",
  );
});

test("extractParentID reads V2 data and the session record", () => {
  assert.equal(
    extractParentID({ type: "x", data: { parentID: "p1" } }),
    "p1",
  );
  assert.equal(
    extractParentID({ type: "x" }, { parentID: "p2" }),
    "p2",
  );
  assert.equal(extractParentID({ type: "x" }), undefined);
});

test("extractError handles strings and nested objects", () => {
  assert.equal(
    extractError({ type: "session.execution.failed", data: { error: "boom" } }),
    "boom",
  );
  assert.equal(
    extractError({
      type: "session.execution.failed",
      data: { error: { type: "api", message: "nested" } },
    }),
    "nested",
  );
});

test("extractSessionID reads a nested form session id", () => {
  assert.equal(
    extractSessionID({
      type: "form.created",
      data: { form: { id: "form_1", sessionID: "ses_form" } },
    }),
    "ses_form",
  );
});

test("defaultMessage and emoji cover v2 execution events", () => {
  assert.match(defaultMessage("session.execution.succeeded"), /finished/i);
  assert.match(defaultMessage("session.execution.failed"), /error/i);
  assert.equal(wantsAssistantText("session.execution.succeeded"), true);
  assert.equal(wantsAssistantText("session.execution.failed"), true);
  assert.equal(wantsAssistantText("permission.asked"), false);
});

test("extractPermission reads a resource list", () => {
  assert.equal(
    extractPermission({ type: "permission.asked", data: { resources: ["a", "b"] } }),
    "a, b",
  );
  assert.equal(
    extractPermission({ type: "permission.asked", data: { command: "rm -rf" } }),
    "rm -rf",
  );
});

test("matchesEvent supports wildcards and exact matches", () => {
  assert.equal(matchesEvent("session.idle", ["*"]), true);
  assert.equal(matchesEvent("session.idle", ["session.idle"]), true);
  assert.equal(matchesEvent("session.idle", ["session.error"]), false);
});
