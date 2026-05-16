/** Shared types and helpers for PropRaven MCP tools. */

import { PropRavenAPIError } from "../client.js";

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

/** Format a JSON payload as a fenced markdown block for the agent. */
export function formatJSON(data: unknown): string {
  return "```json\n" + JSON.stringify(data, null, 2) + "\n```";
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
    const err = e as Error;
    if (err instanceof PropRavenAPIError && err.status === 404) {
      return {
        content: [{ type: "text", text: "Not found." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

/** Coerce an unknown to string with a required-field check. */
export function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${key} is required and must be a non-empty string`);
  }
  return v;
}

/** Coerce an unknown to string array (or undefined). */
export function asStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new Error(`${key} must be an array of strings`);
  return v.map((x) => String(x));
}
