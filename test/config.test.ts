import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_EVENTS,
  loadConfig,
  mergeConfig,
  resolveConfig,
  substituteEnv,
} from "../src/config.ts";

test("substituteEnv replaces ${VAR} and $VAR in nested structures", () => {
  const env = { TOKEN: "abc", TOPIC: "t1" };
  const input = {
    url: "https://example.com/${TOKEN}/$TOPIC",
    headers: { Authorization: "Bearer ${TOKEN}" },
    list: ["$TOPIC", 1, true],
  };
  assert.deepEqual(substituteEnv(input, env), {
    url: "https://example.com/abc/t1",
    headers: { Authorization: "Bearer abc" },
    list: ["t1", 1, true],
  });
});

test("substituteEnv blanks undefined variables", () => {
  assert.equal(substituteEnv("x-${MISSING}", {}), "x-");
});

test("resolveConfig fills defaults", () => {
  const resolved = resolveConfig({ targets: [{ type: "generic", url: "https://x" }] });
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.includeSubagents, false);
  assert.equal(resolved.scope, "location");
  assert.equal(resolved.method, "POST");
  assert.equal(resolved.timeoutMs, 10_000);
  assert.equal(resolved.retries, 2);
  assert.deepEqual(
    Object.keys(resolved.events).sort(),
    [...DEFAULT_EVENTS].sort(),
  );
  assert.equal(resolved.targets[0].name, "generic1");
  assert.deepEqual(resolved.targets[0].events, ["*"]);
  assert.equal(resolved.targets[0].method, "POST");
});

test("resolveConfig skips disabled targets and applies target defaults", () => {
  const resolved = resolveConfig({
    defaults: { timeoutMs: 500, retries: 0, method: "put" },
    events: { "session.idle": { message: "hi" } },
    targets: [
      { type: "slack", url: "https://slack", enabled: false },
      { name: "keep", type: "slack", url: "https://slack", timeoutMs: 100 },
    ],
  });
  assert.equal(resolved.targets.length, 1);
  assert.equal(resolved.targets[0].name, "keep");
  assert.equal(resolved.targets[0].method, "PUT");
  assert.equal(resolved.targets[0].timeoutMs, 100);
  assert.equal(resolved.targets[0].retries, 0);
  assert.deepEqual(Object.keys(resolved.events), ["session.idle"]);
});

test("mergeConfig lets override win and merges maps", () => {
  const merged = mergeConfig(
    { enabled: true, events: { a: {} }, defaults: { retries: 1 }, targets: [] },
    { enabled: false, events: { b: {} }, defaults: { method: "put" } },
  );
  assert.equal(merged.enabled, false);
  assert.deepEqual(Object.keys(merged.events ?? {}).sort(), ["a", "b"]);
  assert.equal(merged.defaults?.retries, 1);
  assert.equal(merged.defaults?.method, "put");
  assert.deepEqual(merged.targets, []);
});

test("loadConfig merges file sources then options", () => {
  const dir = "/proj";
  const readFile = (path: string): string | undefined => {
    if (path === `${dir}/.opencode/opencode-notify-webhook.json`) {
      return JSON.stringify({
        events: { "session.idle": { message: "from-project" } },
        targets: [{ name: "file", type: "ntfy", url: "https://file" }],
      });
    }
    if (path === `${dir}/opencode-notify-webhook.json`) {
      return JSON.stringify({
        targets: [{ name: "root", type: "generic", url: "https://root" }],
      });
    }
    return undefined;
  };

  const config = loadConfig({
    directory: dir,
    env: { HOME: dir, XDG_CONFIG_HOME: `${dir}/.config` },
    readFile,
    options: { enabled: false },
  });

  assert.equal(config.enabled, false);
  assert.equal(config.targets.length, 1);
  assert.equal(config.targets[0].name, "file");
  assert.equal(config.events["session.idle"].message, "from-project");
});

test("loadConfig ignores malformed files", () => {
  const config = loadConfig({
    directory: "/proj",
    env: { HOME: "/proj", XDG_CONFIG_HOME: "/proj/.config" },
    readFile: () => "{ not json",
    options: { targets: [{ type: "generic", url: "https://x" }] },
  });
  assert.equal(config.targets.length, 1);
  assert.equal(config.targets[0].url, "https://x");
});
