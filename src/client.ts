/**
 * Minimal PropRaven REST API client used by the MCP tool handlers.
 *
 * Hand-coded fetch wrapper for now — will be replaced by the Stainless-generated
 * @propraven/sdk client once that ships. Until then the MCP server stands on its
 * own without an SDK dependency.
 */

export interface PropRavenConfig {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
}

export class PropRavenAPIError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
  ) {
    super(message);
    this.name = "PropRavenAPIError";
  }
}

export class PropRavenClient {
  readonly #apiKey: string;
  readonly #baseURL: string;
  readonly #timeoutMs: number;

  constructor(cfg: PropRavenConfig) {
    if (!cfg.apiKey) throw new Error("PropRavenClient: apiKey is required");
    this.#apiKey = cfg.apiKey;
    this.#baseURL = (cfg.baseURL ?? "https://api.propraven.com").replace(/\/$/, "");
    this.#timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    const url = new URL(this.#baseURL + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return this.#request<T>("GET", url.toString());
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.#request<T>("POST", this.#baseURL + path, JSON.stringify(body));
  }

  async #request<T>(method: string, url: string, body?: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "User-Agent": "@propraven/mcp/0.1.0",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new PropRavenAPIError(
          res.status,
          text,
          `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`,
        );
      }
      return text ? (JSON.parse(text) as T) : (undefined as T);
    } finally {
      clearTimeout(timer);
    }
  }
}

// Singleton accessor — instantiated lazily from env at first call.
let _client: PropRavenClient | null = null;

export function getClient(): PropRavenClient {
  if (_client) return _client;
  const apiKey = process.env.PROPRAVEN_API_KEY;
  const baseURL = process.env.PROPRAVEN_BASE_URL;
  if (!apiKey) {
    throw new Error(
      "PROPRAVEN_API_KEY env var is required. " +
        "Set it in your Claude Desktop MCP config, or pass via shell when running locally.",
    );
  }
  _client = new PropRavenClient({
    apiKey,
    baseURL,
    timeoutMs: process.env.PROPRAVEN_TIMEOUT_MS
      ? parseInt(process.env.PROPRAVEN_TIMEOUT_MS, 10)
      : undefined,
  });
  return _client;
}
