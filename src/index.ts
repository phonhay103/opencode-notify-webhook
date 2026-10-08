import { Plugin } from "@opencode/plugin";
import { loadConfig } from "./config.ts";
import type { RawEvent } from "./events.ts";
import { createNotifier, type PluginHost } from "./handler.ts";

export const PLUGIN_ID = "opencode-notify-webhook";

/**
 * Plugin setup. Exported so a local development wrapper can register the same
 * behaviour under a different id — OpenCode dedups plugins by their declared
 * id, so a dev copy must not reuse the published id or the globally installed
 * package would shadow it. See `scripts/dev-setup.mjs`.
 */
export async function setup(ctx: Plugin.Context): Promise<() => void> {
  const host = ctx as unknown as PluginHost;
  const options = (ctx.options ?? {}) as Record<string, unknown>;
  const directory = ctx.location?.directory ?? process.cwd();

  const config = loadConfig({ directory, options });
  const notifier = createNotifier(host, config);

  const controller = new AbortController();
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({
        signal: controller.signal,
      })) {
        void notifier.handle(event as unknown as RawEvent).catch((error) => {
          console.error(`[${PLUGIN_ID}] handler error: ${String(error)}`);
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(`[${PLUGIN_ID}] event stream error: ${String(error)}`);
      }
    }
  })();

  console.log(
    `[${PLUGIN_ID}] loaded: ${config.targets.length} target(s), ${
      Object.keys(config.events).length
    } event(s), enabled=${config.enabled}`,
  );

  return () => controller.abort();
}

/**
 * V2-native OpenCode plugin that forwards notable events to one or more
 * webhooks. See README.md for configuration.
 */
export default Plugin.define({ id: PLUGIN_ID, setup });
