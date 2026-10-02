#!/usr/bin/env node
/**
 * @propraven/mcp — stdio MCP server entry point.
 *
 * Exposes 8 read-only PropRaven tools (parcel_lookup, parcel_search,
 * parcel_compare, owner_pierce, hazard_score, valuation_estimate,
 * permits_history, sales_history) backed by the PropRaven REST API at
 * https://propraven.com/api/v1. Configure with PROPRAVEN_API_KEY (and optionally
 * PROPRAVEN_BASE_URL / PROPRAVEN_TIMEOUT_MS). No tool spends money.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

await createServer().connect(new StdioServerTransport());
