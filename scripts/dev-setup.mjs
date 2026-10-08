import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One-shot local dev setup that mirrors how an installed package is used: it
 * loads the checkout through the same `plugins` + `options` path an installed
 * package uses, pointing at the package root with a relative path.
 *
 * This is intentionally NON-DESTRUCTIVE. It never edits your global OpenCode
 * config. Instead the generated project config disables the globally installed
 * copy for this location with the `-<id>` directive (V2 "Control" syntax) and
 * then loads the local checkout. Your `~/.config/opencode/opencode.json` stays
 * exactly as it is, so real notifications keep working everywhere else.
 *
 * Targets:
 *   - If DISCORD_WEBHOOK_URL is set (from `.opencode/dev.env` or the
 *     environment), a real Discord target is used.
 *   - Otherwise a local capture target on http://127.0.0.1:<PORT>/hook.
 *
 * The URL is read from a gitignored file, never written into tracked sources.
 * Idempotent. Undo with `npm run dev:teardown`.
 */
const PACKAGE = "opencode-notify-webhook";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT ?? "8787";

const opencodeDir = resolve(root, ".opencode");
const jsoncPath = join(opencodeDir, "opencode.jsonc");
const envPath = join(opencodeDir, "dev.env");

/** Minimal KEY=VALUE parser for the gitignored dev env file. */
function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

const env = { ...loadEnvFile(envPath), ...process.env };
const discordUrl = env.DISCORD_WEBHOOK_URL;

const target = discordUrl
  ? { name: "discord", type: "discord", url: discordUrl }
  : { name: "capture", type: "generic", url: `http://127.0.0.1:${port}/hook` };

// Real-usage config: plugins array + options, local package root, relative path.
const devConfig = {
  $schema: "https://opencode.ai/config.json",
  plugins: [
    // 1. Disable any globally installed copy of this package for this location.
    //    Non-destructive: the global config file is not touched.
    `-${PACKAGE}`,
    // 2. Load the local checkout. `../src` (relative to this config file) is
    //    the source directory that contains `index.ts`; OpenCode resolves a
    //    local plugin directory by its `index.ts`/`index.js` entrypoint.
    {
      package: "../src",
      options: {
        enabled: true,
        scope: "location",
        events: {
          "session.created": {},
          "session.execution.started": {},
          "session.execution.succeeded": {},
          "session.execution.failed": {},
          "permission.asked": {},
          "form.created": {},
        },
        targets: [target],
      },
    },
  ],
};

writeFileSync(jsoncPath, `${JSON.stringify(devConfig, null, 2)}\n`);
console.log(
  `✓ dev config    ${relative(root, jsoncPath)} (plugins + options, target: ${target.name})`,
);
console.log(
  `  disables global ${PACKAGE} for this location; ~/.config/opencode/opencode.json is untouched`,
);

// Remove artifacts from the deprecated `dev:link` auto-discovery flow so they
// cannot load the plugin a second time (without `options`).
for (const stale of [
  resolve(opencodeDir, "plugins", "notify.ts"),
  resolve(opencodeDir, "opencode-notify-webhook.json"),
]) {
  if (existsSync(stale)) {
    rmSync(stale, { force: true });
    console.log(`• removed stale  ${relative(root, stale)}`);
  }
}

console.log("\nNext:");
if (discordUrl) {
  console.log("  • notifications go to Discord");
} else {
  console.log("  • npm run dev:capture   # terminal A, watch payloads");
  console.log(
    "    or set DISCORD_WEBHOOK_URL in .opencode/dev.env for a real target",
  );
}
console.log(`  • run OpenCode inside ${root}`);
console.log("    (edit src/, then run `opencode reload` or restart)");
console.log(
  "  • npm run dev:isolate   # end-to-end check in a throwaway config dir",
);
