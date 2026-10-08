import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fully isolated end-to-end check of the local checkout.
 *
 * Runs `opencode run --standalone` against a throwaway config directory
 * (`OPENCODE_CONFIG_DIR`) and a temp working directory, so your real global
 * config and any project config are never read or written. A local capture
 * sink records every webhook the plugin sends and the payloads are printed.
 *
 *   npm run dev:isolate                # prompt: "Reply with exactly: ok"
 *   npm run dev:isolate -- "say hi"    # custom prompt
 *   PORT=9000 ISOLATE_DIR=/tmp/x npm run dev:isolate
 *
 * Exits non-zero when no webhook was captured, so it can gate a release.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = resolve(
  process.env.ISOLATE_DIR ??
    join(process.env.TMPDIR ?? "/tmp", "opencode", "nw-isolate"),
);
const configDir = join(base, "config");
const workDir = join(base, "work");
const port = Number(process.env.PORT ?? 8799);
const prompt = process.argv.slice(2).join(" ") || "Reply with exactly: ok";

// Fresh config dir, stable work dir (the data DB records it as a location, so
// recreating it every run avoids "directory not found" reload errors).
rmSync(configDir, { recursive: true, force: true });
mkdirSync(configDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const received = [];
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  received.push(Buffer.concat(chunks).toString("utf8"));
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});
server.listen(port, "127.0.0.1");
await once(server, "listening");

// `OPENCODE_CONFIG_DIR` replaces the *global* config directory, so putting the
// plugin entry here keeps the shared service and the repo's own config out of
// the picture.
writeFileSync(
  join(configDir, "opencode.json"),
  `${JSON.stringify(
    {
      plugins: [
        {
          package: join(root, "src"),
          options: {
            enabled: true,
            scope: "location",
            targets: [
              {
                name: "capture",
                type: "generic",
                url: `http://127.0.0.1:${port}/hook`,
              },
            ],
          },
        },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`capture sink   http://127.0.0.1:${port}/hook`);
console.log(`config dir     ${configDir}`);
console.log(`work dir       ${workDir}`);
console.log(`running: opencode run --standalone "${prompt}"\n`);

const child = spawn("opencode", ["run", "--standalone", prompt], {
  cwd: workDir,
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  },
});

const code = await new Promise((done) => child.on("exit", (c) => done(c ?? 1)));

// Give the fire-and-forget transport a moment to flush before closing.
await new Promise((r) => setTimeout(r, 1500));
server.close();
await once(server, "close");

console.log(`\nopencode exited with ${code}`);
console.log(`webhooks captured: ${received.length}`);
for (const body of received) console.log(`\n${body}`);
process.exitCode = received.length > 0 ? 0 : 1;
