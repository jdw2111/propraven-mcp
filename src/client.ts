/**
 * Minimal PropRaven REST API client used by the MCP tool handlers.
 *
 * Read-only by construction: it only issues GET requests, only to the free /
 * metered endpoints in ALLOWED_PATHS, and never sends a payment header. A paid
 * endpoint (parcel report, comp pack, risk score, owner report, leads, ...) is
 * refused before any request leaves the process, and an x402 `402 Payment
 * Required` answer is surfaced as an error — no tool in this package can spend
 * money.
 */
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://propraven.com";
export const USER_AGENT = `@propraven/mcp/${VERSION}`;

/** Longest Retry-After we are willing to wait before the single retry. */
const MAX_RETRY_AFTER_MS = 10_000;
/** Wait before the retry when a 429/503 carries no Retry-After header. */
const DEFAULT_RETRY_MS = 1_000;

/**
 * Every endpoint a tool may call (matched against the final URL pathname).
 * All are plain reads; none is an x402 / pay-per-call product.
 */
const ALLOWED_PATHS: readonly RegExp[] = [
  /^\/api\/v1\/parcels\/(?!(?:batch|geojson|poi)$)[^/]+$/,
  /^\/api\/v1\/parcels\/[^/]+\/(?:risks|deeds|permits)$/,
  /^\/api\/v1\/search\/full$/,
  /^\/api\/v1\/owners\/search$/,
  /^\/api\/v1\/owners\/[^/]+\/portfolio$/,
];

export function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PATHS.some((re) => re.test(pathname));
}

/** `/api/v1/parcels/<id>[/<suffix>]` with the id encoded but its colons kept readable. */
export function parcelPath(id: string, suffix?: "risks" | "deeds" | "permits"): string {
  const enc = encodeURIComponent(id).replace(/%3A/gi, ":");
  return `/api/v1/parcels/${enc}${suffix ? `/${suffix}` : ""}`;
}

export interface PropRavenConfig {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
}

/** RFC 7807 problem details, as served by every /api/v1 endpoint. */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Array<{ param: string; message: string }>;
  request_id?: string;
  [k: string]: unknown;
}

export class PropRavenAPIError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
    public code?: string,
    public problem?: Problem,
  ) {
    super(message);
    this.name = "PropRavenAPIError";
  }
}

/** Build the error for a non-2xx response: `<status> <code>: <detail>` for a Problem body. */
export function apiErrorFrom(status: number, statusText: string, text: string): PropRavenAPIError {
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;

  if (status === 402 && obj && ("x402Version" in obj || Array.isArray(obj.accepts))) {
    return new PropRavenAPIError(
      402,
      text,
      "402 payment required — this tool never pays. The endpoint asked for an x402 payment; " +
        "@propraven/mcp only reads free/metered data and will not buy anything.",
      "x402_payment_required",
    );
  }

  if (obj && typeof obj.code === "string") {
    const p = obj as Problem;
    const detail = p.detail ?? p.title ?? "";
    const params =
      Array.isArray(p.errors) && p.errors.length > 0 && !detail.includes(p.errors[0].message)
        ? ` (${p.errors.map((e) => `${e.param}: ${e.message}`).join("; ")})`
        : "";
    const rid = p.request_id ? ` [request_id ${p.request_id}]` : "";
    return new PropRavenAPIError(status, text, `${status} ${p.code}: ${detail}${params}${rid}`, p.code, p);
  }

  const snippet = text.slice(0, 300) || statusText;
  return new PropRavenAPIError(status, text, `${status} ${statusText || "error"}: ${snippet}`);
}

/** Retry-After (delta-seconds or HTTP-date) → milliseconds, or null when absent/unparseable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value == null || value.trim() === "") return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(parseFloat(v) * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class PropRavenClient {
  readonly #apiKey: string;
  readonly #baseURL: string;
  readonly #timeoutMs: number;

  constructor(cfg: PropRavenConfig) {
    if (!cfg.apiKey) throw new Error("PropRavenClient: apiKey is required");
    this.#apiKey = cfg.apiKey;
    this.#baseURL = (cfg.baseURL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  get baseURL(): string {
    return this.#baseURL;
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    const url = new URL(this.#baseURL + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    if (!isAllowedPath(url.pathname)) {
      throw new Error(
        `@propraven/mcp refuses ${url.pathname}: not one of the free read endpoints this server uses (no tool can buy anything).`,
      );
    }
    return this.#request<T>(url);
  }

  async #request<T>(url: URL, attempt = 0): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let res: Response;
    let text: string;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "User-Agent": USER_AGENT,
          Accept: "application/json, application/problem+json",
        },
      });
      text = await res.text();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        throw new Error(`request to ${url.pathname} timed out after ${this.#timeoutMs} ms`);
      }
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      throw new Error(`network error calling ${url.origin}${url.pathname}: ${cause?.code ?? cause?.message ?? (e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new PropRavenAPIError(res.status, text, `${res.status}: response was not JSON: ${text.slice(0, 200)}`);
      }
    }

    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      const wait = parseRetryAfter(res.headers.get("retry-after")) ?? DEFAULT_RETRY_MS;
      if (wait <= MAX_RETRY_AFTER_MS) {
        await sleep(wait);
        return this.#request<T>(url, attempt + 1);
      }
    }

    throw apiErrorFrom(res.status, res.statusText, text);
  }
}

// Singleton accessor — instantiated lazily from env at first call.
let _client: PropRavenClient | null = null;

export function getClient(): PropRavenClient {
  if (_client) return _client;
  const apiKey = process.env.PROPRAVEN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PROPRAVEN_API_KEY env var is required. " +
        "Set it in your MCP client config, or export it in your shell when running locally.",
    );
  }
  const timeout = parseInt(process.env.PROPRAVEN_TIMEOUT_MS ?? "", 10);
  _client = new PropRavenClient({
    apiKey,
    baseURL: process.env.PROPRAVEN_BASE_URL || undefined,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
  });
  return _client;
}
