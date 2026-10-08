import { rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Remove the local dev setup created by `npm run dev:setup`.
 * Leaves your global OpenCode config untouched.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  resolve(root, ".opencode", "opencode.jsonc"),
  resolve(root, ".opencode", "dev", "notify-dev", "index.ts"),
  resolve(root, ".opencode", "plugins", "notify.ts"),
  resolve(root, ".opencode", "opencode-notify-webhook.json"),
];

for (const file of targets) {
  rmSync(file, { force: true });
  console.log(`removed ${relative(root, file)}`);
}
