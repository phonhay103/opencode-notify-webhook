import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Create a local dev entry so OpenCode discovers this plugin from
 * `.opencode/plugins/`. Uses a path relative to the generated file, so
 * nothing machine-specific is written.
 */
export function link(root) {
  const pluginsDir = resolve(root, ".opencode", "plugins");
  const entry = resolve(root, "src", "index.ts");

  mkdirSync(pluginsDir, { recursive: true });

  let rel = relative(pluginsDir, entry).replaceAll("\\", "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;

  const file = resolve(pluginsDir, "notify.ts");
  writeFileSync(file, `export { default } from "${rel}";\n`);
  return { file, rel };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { file, rel } = link(root);
  console.log(`linked ${relative(root, file)} -> ${rel}`);
}
