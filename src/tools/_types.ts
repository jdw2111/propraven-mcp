/** Shared types and helpers for PropRaven MCP tools. */

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Shared wording for every `parcel_id` argument. */
export const PARCEL_ID_DESCRIPTION =
  'PropRaven parcel ID. Canonical form is state_fips:county_fips:parcel_id, e.g. "37:119:12104406" ' +
  '(the legacy 5-digit form "37119:12104406" and PropRaven parcel UUIDs are also accepted). ' +
  "Get one from parcel_lookup or parcel_search.";

/** Format a JSON payload as a fenced markdown block for the agent. */
export function formatJSON(data: unknown): string {
  return "```json\n" + JSON.stringify(data, null, 2) + "\n```";
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Wrap an API call: catch errors, format result/error consistently. */
export async function callAPI<T>(
  fn: () => Promise<T>,
  formatter: (data: T) => string = formatJSON,
): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: formatter(data) }] };
  } catch (e) {
    return errorResult((e as Error).message);
  }
}

/** Coerce an unknown to string with a required-field check. */
export function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`${key} is required and must be a non-empty string`);
  }
  return v.trim();
}

/** Coerce an unknown to string array (or undefined). */
export function asStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new Error(`${key} must be an array of strings`);
  return v.map((x) => String(x));
}

/**
 * Numeric field → number. API 1.2.0 serves JSON numbers; earlier releases
 * served many numeric columns as strings ("19388200.00"). Accept both.
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Optional ISO date argument → Date (throws on garbage so the agent sees it). */
export function asDate(args: Record<string, unknown>, key: string): Date | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`${key} must be an ISO date (YYYY-MM-DD)`);
  return d;
}

/** True when any of the given date-ish values is on or after `since`. */
export function onOrAfter(since: Date, ...values: unknown[]): boolean {
  for (const v of values) {
    if (v == null) continue;
    const d = new Date(String(v));
    if (!Number.isNaN(d.getTime()) && d >= since) return true;
  }
  return false;
}
