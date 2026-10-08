import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One-shot local dev setup that mirrors how the plugin is used in practice:
 * it loads the checkout through the same `plugins` + `options` path an
 * installed package uses, pointing at the local source with a relative path.
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

// 1. Real-usage config: plugins array + options, local source, relative path.
const devConfig = {
  $schema: "https://opencode.ai/config.json",
  plugins: [
    {
      package: "../src",
      options: {
        enabled: true,
        scope: "location",
        events: {
          "session.created": {},
          "session.idle": {},
          "session.error": {},
          "permission.asked": {},
          "question.asked": {},
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

// 2. Make sure the plugin is loaded exactly once.
for (const stale of [
  resolve(opencodeDir, "plugins", "notify.ts"),
  resolve(opencodeDir, "opencode-notify-webhook.json"),
]) {
  if (existsSync(stale)) {
    rmSync(stale, { force: true });
    console.log(`• removed stale  ${relative(root, stale)}`);
  }
}

// 3. Resolve conflicts: drop a global install of this package.
const globalConfig = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "opencode",
  "opencode.json",
);

/** Extract the bare package name from an npm specifier. */
function packageName(spec) {
  if (spec.startsWith("@")) return spec.split("@").slice(0, 2).join("@");
  return spec.split("@")[0];
}

function withoutThisPackage(plugins) {
  return plugins.filter((entry) => {
    const spec = typeof entry === "string" ? entry : entry?.package;
    return typeof spec !== "string" || packageName(spec) !== PACKAGE;
  });
}

if (existsSync(globalConfig)) {
  try {
    const parsed = JSON.parse(readFileSync(globalConfig, "utf8"));
    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    const kept = withoutThisPackage(plugins);
    if (kept.length !== plugins.length) {
      parsed.plugins = kept;
      writeFileSync(globalConfig, `${JSON.stringify(parsed, null, 2)}\n`);
      console.log(`✓ global conflict removed (${globalConfig}); local checkout wins`);
    } else {
      console.log("• no global install of this package to remove");
    }
  } catch (error) {
    console.log(`• skipped global conflict check: ${error.message}`);
  }
} else {
  console.log("• no global opencode.json");
}

console.log("\nNext:");
if (discordUrl) {
  console.log("  • notifications go to Discord");
} else {
  console.log("  • npm run dev:capture   # terminal A, watch payloads");
  console.log("    or set DISCORD_WEBHOOK_URL in .opencode/dev.env for a real target");
}
console.log(`  • run OpenCode inside ${root}`);
console.log("    (edit src/, then run `opencode reload` or restart)");
