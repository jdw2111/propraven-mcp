/**
 * End-to-end: spawn the stdio server and talk MCP to it with the SDK client.
 * No API calls are made (tools/list only).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { PKG_VERSION } from "./helpers.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("defect 7 — MCP handshake version equals package.json version; defect 1 — listed names are valid", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? "", PROPRAVEN_API_KEY: "pz_test_key" },
    stderr: "pipe",
  });
  const client = new Client({ name: "propraven-mcp-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const info = client.getServerVersion();
    assert.equal(info?.version, PKG_VERSION);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 8);
    for (const t of tools) assert.match(t.name, /^[a-zA-Z0-9_-]{1,64}$/);
  } finally {
    await client.close();
  }
});
