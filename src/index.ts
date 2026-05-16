#!/usr/bin/env node
/**
 * @propraven/mcp — MCP server entry point.
 *
 * Exposes 8 PropRaven tools over the Model Context Protocol. Each tool maps
 * to one or more REST endpoints on api.propraven.com (legacy host:
 * propzilla.vercel.app, in use until DNS cutover). Tool descriptions are
 * tuned for agent reasoning — see ./tools/* for the exact wording.
 *
 * Tools are wired to the real PropRaven REST API via src/client.ts.
 * Configure with the PROPRAVEN_API_KEY env var (and optionally PROPRAVEN_BASE_URL).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { parcelLookup } from "./tools/parcel-lookup.js";
import { parcelSearch } from "./tools/parcel-search.js";
import { parcelCompare } from "./tools/parcel-compare.js";
import { ownerPierce } from "./tools/owner-pierce.js";
import { hazardScore } from "./tools/hazard-score.js";
import { valuationEstimate } from "./tools/valuation-estimate.js";
import { permitsHistory } from "./tools/permits-history.js";
import { salesHistory } from "./tools/sales-history.js";

const TOOLS = [
  parcelLookup,
  parcelSearch,
  parcelCompare,
  ownerPierce,
  hazardScore,
  valuationEstimate,
  permitsHistory,
  salesHistory,
];

const server = new Server(
  { name: "propraven-mcp", version: "0.1.0-alpha.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

// The MCP SDK's ServerResult union has a `task: ...` branch for long-running
// operations; we always return the synchronous CallToolResult branch so we
// cast through `unknown` to satisfy the discriminator without coupling tool
// implementations to the SDK's internal Task types.
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      isError: true,
    } as unknown as Awaited<ReturnType<typeof tool extends never ? never : never>>;
  }
  return (await tool.handler(req.params.arguments ?? {})) as never;
});

const transport = new StdioServerTransport();
await server.connect(transport);
