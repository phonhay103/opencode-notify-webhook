import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { sendWebhook } from "../src/transport.ts";

interface Recorded {
  url: string;
  method: string;
  body: string;
}

type Responder = (
  request: Recorded,
  reply: (status: number, body?: string) => void,
) => void | Promise<void>;

async function withServer(
  responder: Responder,
  run: (ctx: { url: string; requests: Recorded[] }) => Promise<void>,
): Promise<void> {
  const requests: Recorded[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const recorded: Recorded = {
      url: req.url ?? "",
      method: req.method ?? "",
      body: Buffer.concat(chunks).toString("utf8"),
    };
    requests.push(recorded);
    try {
      await responder(recorded, (status, body) => {
        res.writeHead(status, { "Content-Type": "text/plain" });
        res.end(body ?? "");
      });
    } catch {
      res.destroy();
    }
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

const request = (url: string) => ({
  url,
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hello: "world" }),
});

test("sendWebhook returns ok on 2xx", async () => {
  await withServer(
    (_req, reply) => reply(200, "ok"),
    async ({ url, requests }) => {
      const result = await sendWebhook(request(url), {
        timeoutMs: 1_000,
        retries: 0,
      });
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.attempts, 1);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body, JSON.stringify({ hello: "world" }));
    },
  );
});

test("sendWebhook retries server errors then succeeds", async () => {
  let count = 0;
  await withServer(
    (_req, reply) => {
      count += 1;
      reply(count === 1 ? 500 : 200, "ok");
    },
    async ({ url }) => {
      const result = await sendWebhook(request(url), {
        timeoutMs: 1_000,
        retries: 1,
      });
      assert.equal(result.ok, true);
      assert.equal(result.attempts, 2);
    },
  );
});

test("sendWebhook does not retry most 4xx", async () => {
  await withServer(
    (_req, reply) => reply(400, "bad"),
    async ({ url, requests }) => {
      const result = await sendWebhook(request(url), {
        timeoutMs: 1_000,
        retries: 3,
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.equal(result.attempts, 1);
      assert.equal(requests.length, 1);
    },
  );
});

test("sendWebhook reports a timeout", async () => {
  await withServer(
    async (_req, reply) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      reply(200, "late");
    },
    async ({ url }) => {
      const result = await sendWebhook(request(url), {
        timeoutMs: 40,
        retries: 0,
      });
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /timeout/);
    },
  );
});
