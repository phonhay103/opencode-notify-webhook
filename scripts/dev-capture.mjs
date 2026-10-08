import { createServer } from "node:http";

/**
 * Local webhook sink for development.
 *
 * Prints every incoming request (method, path, headers, body) so you can
 * verify payloads without touching Slack / Discord / ntfy / etc.
 *
 *   npm run dev:capture            # http://127.0.0.1:8787
 *   PORT=9000 npm run dev:capture
 */
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.url}`);
  for (const [key, value] of Object.entries(req.headers)) {
    console.log(`  ${key}: ${value}`);
  }
  if (body) {
    try {
      console.log(`  body: ${JSON.stringify(JSON.parse(body), null, 2)}`);
    } catch {
      console.log(`  body: ${body}`);
    }
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});

server.listen(port, host, () => {
  console.log(`Webhook capture listening on http://${host}:${port}`);
  console.log(`Targets should POST to http://${host}:${port}/hook`);
});
