import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { resolveConfig } from "../src/config.ts";
import { createNotifier, type PluginHost } from "../src/handler.ts";

async function withServer(
  run: (ctx: { url: string; requests: string[] }) => Promise<void>,
): Promise<void> {
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    requests.push(Buffer.concat(chunks).toString("utf8"));
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run({ url: `http://127.0.0.1:${port}`, requests });
  } finally {
    server.close();
    await once(server, "close");
  }
}

function makeHost(session?: {
  title?: string;
  parentID?: string | null;
}): PluginHost {
  return {
    location: {
      directory: "/work/app",
      project: { id: "proj_1", canonical: "/work/app" },
    },
    session: {
      async get() {
        return session;
      },
      async context() {
        return [];
      },
    },
  };
}

test("handle sends a generic payload on session.idle", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(makeHost({ title: "My Session" }), config, true);

    await notifier.handle({
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    });

    assert.equal(requests.length, 1);
    const body = JSON.parse(requests[0]);
    assert.equal(body.event, "session.idle");
    assert.equal(body.sessionTitle, "My Session");
    assert.equal(body.projectName, "app");
  });
});

test("handle skips subagent sessions by default", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(
      makeHost({ title: "Child", parentID: "parent" }),
      config,
      true,
    );

    await notifier.handle({
      type: "session.idle",
      properties: { sessionID: "ses_child" },
    });

    assert.equal(requests.length, 0);
  });
});

test("handle includes subagents when configured", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      includeSubagents: true,
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(
      makeHost({ title: "Child", parentID: "parent" }),
      config,
      true,
    );

    await notifier.handle({
      type: "session.idle",
      properties: { sessionID: "ses_child" },
    });

    assert.equal(requests.length, 1);
  });
});

test("handle does nothing when disabled", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(makeHost(), config, false);

    await notifier.handle({
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    });

    assert.equal(requests.length, 0);
  });
});

test("handle honors notify:false and unconfigured events", async () => {
  await withServer(async ({ url, requests }) => {
    const muted = resolveConfig({
      events: { "session.idle": { notify: false } },
      targets: [{ name: "t", type: "generic", url }],
    });
    await createNotifier(makeHost(), muted, true).handle({
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    });

    const other = resolveConfig({
      events: { "session.error": {} },
      targets: [{ name: "t", type: "generic", url }],
    });
    await createNotifier(makeHost(), other, true).handle({
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    });

    assert.equal(requests.length, 0);
  });
});

test("handle renders message templates", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      events: { "session.idle": { message: "Done: {{session.title}}" } },
      targets: [{ name: "t", type: "generic", url, format: "text" }],
    });
    const notifier = createNotifier(makeHost({ title: "My Session" }), config, true);

    await notifier.handle({
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    });

    assert.match(requests[0], /Done: My Session/);
  });
});

test("handle reads V2 event data and event location", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      scope: "global",
      events: { "session.created": {} },
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(makeHost({ title: "My Session" }), config, true);

    await notifier.handle({
      type: "session.created",
      data: { sessionID: "ses_v2", title: "Created Title" },
      location: { directory: "/work/other" },
    });

    assert.equal(requests.length, 1);
    const body = JSON.parse(requests[0]);
    assert.equal(body.sessionID, "ses_v2");
    assert.equal(body.sessionTitle, "My Session");
    assert.equal(body.directory, "/work/other");
  });
});

test("handle scopes events to the instance location by default", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      events: { "session.idle": {} },
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(makeHost(), config, true);

    // Same location: handled.
    await notifier.handle({
      type: "session.idle",
      data: { sessionID: "ses_1" },
      location: { directory: "/work/app" },
    });
    // Another location: skipped (this instance does not own the event).
    await notifier.handle({
      type: "session.idle",
      data: { sessionID: "ses_2" },
      location: { directory: "/work/other" },
    });

    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0]).sessionID, "ses_1");
  });
});

test("handle scope:global handles events from any location", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      scope: "global",
      events: { "session.idle": {} },
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(makeHost(), config, true);

    await notifier.handle({
      type: "session.idle",
      data: { sessionID: "ses_2" },
      location: { directory: "/work/other" },
    });

    assert.equal(requests.length, 1);
  });
});

test("handle skips events for another workspace of the same directory", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      events: { "session.idle": {} },
      targets: [{ name: "t", type: "generic", url }],
    });
    const host = makeHost();
    host.location!.workspaceID = "ws_a";
    const notifier = createNotifier(host, config, true);

    await notifier.handle({
      type: "session.idle",
      data: { sessionID: "ses_1" },
      location: { directory: "/work/app", workspaceID: "ws_b" },
    });

    assert.equal(requests.length, 0);
  });
});

test("sendTest posts to configured targets", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(makeHost(), config, true);

    const results = await notifier.sendTest();

    assert.equal(results.length, 1);
    assert.equal(results[0].target, "t");
    assert.equal(results[0].result.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0]).event, "test");
  });
});

test("setEnabled toggles sending at runtime", async () => {
  await withServer(async ({ url, requests }) => {
    const config = resolveConfig({
      targets: [{ name: "t", type: "generic", url }],
    });
    const notifier = createNotifier(makeHost(), config, true);
    notifier.setEnabled(false);

    await notifier.handle({
      type: "session.idle",
      properties: { sessionID: "ses_1" },
    });

    assert.equal(requests.length, 0);
    assert.match(notifier.status(), /disabled/);
  });
});
