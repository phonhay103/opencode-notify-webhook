import type { PreparedRequest } from "./targets.ts";

export interface SendOptions {
  timeoutMs: number;
  retries: number;
  /** Injectable fetch implementation (used by tests). */
  fetchImpl?: typeof fetch;
}

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
  attempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  return Math.min(4_000, 250 * 2 ** attempt);
}

/**
 * Send a prepared request with a timeout and bounded retries.
 *
 * Never throws: transport failures are reported in the result so a broken
 * webhook can never break the agent loop.
 */
export async function sendWebhook(
  request: PreparedRequest,
  options: SendOptions,
): Promise<SendResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const attempts = Math.max(1, Math.floor(options.retries) + 1);
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  let lastError: string | undefined;
  let lastStatus: number | undefined;
  let performed = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    performed += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await doFetch(request.url, {
        method,
        headers: request.headers,
        body: hasBody ? request.body : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        return { ok: true, status: response.status, attempts: performed };
      }

      lastStatus = response.status;
      lastError = `HTTP ${response.status}`;

      // Do not retry most client errors; 429 is transient.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        break;
      }
    } catch (error) {
      clearTimeout(timer);
      lastError = controller.signal.aborted
        ? `timeout after ${options.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    }

    if (attempt < attempts - 1) {
      await sleep(backoff(attempt));
    }
  }

  return { ok: false, status: lastStatus, error: lastError, attempts: performed };
}
