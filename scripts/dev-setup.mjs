import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { link } from "./dev-link.mjs";

/**
 * One-shot local dev setup:
 *
 *   1. Link this checkout into `.opencode/plugins/` (relative, no hardcoded paths).
 *   2. Create a dev config that points at the local capture server.
 *   3. Remove any globally installed copy of this package so the local
 *      checkout takes priority instead of firing duplicate webhooks.
 *
 * Idempotent: safe to run again. Undo with `npm run dev:teardown`.
 */
const PACKAGE = "opencode-notify-webhook";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT ?? "8787";

// 1. Local plugin entry.
const { file, rel } = link(root);
console.log(`✓ plugin entry  ${relative(root, file)} -> ${rel}`);

// 2. Dev config (never overwrite a hand-edited one).
const configPath = resolve(root, ".opencode", "opencode-notify-webhook.json");
if (existsSync(configPath)) {
  console.log(`• config kept   ${relative(root, configPath)}`);
} else {
  const config = {
    enabled: true,
    scope: "location",
    events: {
      "session.created": {},
      "session.idle": {},
      "session.error": {},
      "permission.asked": {},
      "question.asked": {},
    },
    targets: [
      {
        name: "capture",
        type: "generic",
        url: `http://127.0.0.1:${port}/hook`,
      },
    ],
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`✓ dev config    ${relative(root, configPath)} (capture :${port})`);
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
console.log(`  1. npm run dev:capture   # terminal A, watch payloads`);
console.log(`  2. run OpenCode inside   ${root}`);
