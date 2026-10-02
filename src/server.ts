/**
 * Builds the MCP server: 8 read-only PropRaven tools over the REST API
 * (https://propraven.com/api/v1). No tool spends money.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { TOOLS } from "./tools/index.js";
import { errorResult } from "./tools/_types.js";
import { VERSION } from "./version.js";

export function createServer(): Server {
  const server = new Server({ name: "propraven-mcp", version: VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    })),
  }));

  // Always answer with the synchronous CallToolResult branch of the SDK's result
  // union; the cast keeps tool implementations decoupled from SDK task types.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return errorResult(`Unknown tool: ${req.params.name}. Available: ${TOOLS.map((t) => t.name).join(", ")}`) as never;
    }
    try {
      return (await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>)) as never;
    } catch (e) {
      return errorResult((e as Error).message) as never;
    }
  });

  return server;
}
