// Shared HTTP helper: timeout, bounded retries with exponential backoff (+jitter)
// for 429/5xx/network errors only, and secret redaction in any error text.
export class HttpError extends Error {
  constructor(message, { status, body, retryable } = {}) {
    super(message);
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

const SECRET_PARAMS = /((?:^|[?&\s"'(])(?:apikey|key|api_key|access_token|x-api-key)\s*[=:]\s*)[^&\s"',)]+/gi;
const KNOWN_SECRET_ENV = ['BING_WEBMASTER_API_KEY', 'ANTHROPIC_API_KEY', 'INDEXNOW_KEY'];

export function redact(text) {
  let out = String(text || '').replace(SECRET_PARAMS, '$1[redacted]');
  // Belt and braces: scrub the literal values of known secrets wherever they appear.
  for (const name of KNOWN_SECRET_ENV) {
    const v = process.env[name];
    if (v && v.length >= 6) out = out.split(v).join('[redacted]');
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, options = {}, { attempts = 3, baseDelayMs = 2000, timeoutMs = 20000, fetchImpl = fetch } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) {
        const body = await res.text().catch(() => '');
        lastErr = new HttpError(`HTTP ${res.status}`, { status: res.status, body: redact(body).slice(0, 500), retryable: true });
        const retryAfter = Number(res.headers.get('retry-after'));
        if (i < attempts - 1) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : baseDelayMs * 2 ** i + Math.random() * 250);
        continue;
      }
      return res;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastErr = new HttpError(redact(err.message || 'network error'), { retryable: true });
      if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i + Math.random() * 250);
    }
  }
  throw lastErr;
}
