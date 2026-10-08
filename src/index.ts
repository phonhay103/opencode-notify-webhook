import { Plugin } from "@opencode/plugin";
import { loadConfig } from "./config.ts";
import type { RawEvent } from "./events.ts";
import { createNotifier, type PluginHost } from "./handler.ts";

const PLUGIN_ID = "opencode-notify-webhook";

/**
 * V2-native OpenCode plugin that forwards notable events to one or more
 * webhooks. See README.md for configuration.
 */
export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const host = ctx as unknown as PluginHost;
    const options = (ctx.options ?? {}) as Record<string, unknown>;
    const directory = ctx.location?.directory ?? process.cwd();

    const config = loadConfig({ directory, options });

    const stored = await ctx.storage.get("enabled");
    const enabled = typeof stored === "boolean" ? stored : config.enabled;
    const notifier = createNotifier(host, config, enabled);

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "notify_toggle",
        description:
          "Enable or disable opencode-notify-webhook notifications at runtime.",
        input: {
          type: "object",
          properties: {
            enable: {
              type: "boolean",
              description: "true to enable notifications, false to disable",
            },
          },
          required: ["enable"],
          additionalProperties: false,
        },
        async execute(raw) {
          const enable = Boolean((raw as { enable?: boolean }).enable);
          notifier.setEnabled(enable);
          await ctx.storage.set("enabled", enable);
          return {
            content: `Webhook notifications ${enable ? "enabled" : "disabled"}.`,
          };
        },
      });

      editor.add({
        name: "notify_status",
        description:
          "Report opencode-notify-webhook status: enabled flag, targets, and tracked events.",
        input: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          return { content: notifier.status() };
        },
      });

      editor.add({
        name: "notify_test",
        description:
          "Send a test notification to one or all configured webhook targets.",
        input: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Target name; omit to test all targets",
            },
          },
          additionalProperties: false,
        },
        async execute(raw) {
          const name = (raw as { target?: string }).target;
          const results = await notifier.sendTest(name);
          if (results.length === 0) {
            return { content: "No matching webhook targets configured." };
          }
          return {
            content: results
              .map(
                (entry) =>
                  `${entry.target}: ${
                    entry.result.ok
                      ? `ok (${entry.result.status})`
                      : `failed (${entry.result.error ?? "unknown error"})`
                  }`,
              )
              .join("\n"),
          };
        },
      });
    });

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
      } event(s), enabled=${enabled}`,
    );

    return () => controller.abort();
  },
});
