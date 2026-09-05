# @propraven/mcp

Model Context Protocol server for PropRaven — gives Claude, ChatGPT, Cursor, and any MCP-compatible agent canonical access to 191.3M US parcels (110.0M mapped) with ownership, valuation, permits, deeds, hazard, and market data.

**Hosted endpoint:** **https://propraven.com/mcp** (Streamable HTTP, no install — docs: https://propraven.com/docs/mcp · agents + x402: https://propraven.com/docs/agents). Or run the stdio server locally (below).

---

## Hosted (no install)

Point any HTTP-transport MCP client at **`https://propraven.com/mcp`** with your API key as a bearer header. Claude Desktop / Cursor (`claude_desktop_config.json`, `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "propraven": {
      "url": "https://propraven.com/mcp",
      "headers": { "Authorization": "Bearer pz_your_real_key_here" }
    }
  }
}
```

Claude Code: `claude mcp add --transport http propraven https://propraven.com/mcp --header "Authorization: Bearer pz_your_real_key_here"`.
The claude.ai web connector uses OAuth instead — add a custom connector with the same URL and sign in.

---

## Local install in Claude Desktop

**Requirements:** Node ≥18, a PropRaven API key (`pz_…`) from https://propraven.com/settings/api-keys (free, no card).

### One-time setup

```bash
git clone https://github.com/jdw2111/propraven-mcp.git
cd propraven-mcp
npm install
npm run build
```

### Wire into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "propraven": {
      "command": "node",
      "args": ["/absolute/path/to/propraven-mcp/dist/index.js"],
      "env": {
        "PROPRAVEN_API_KEY": "pz_your_real_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The 8 PropRaven tools (parcel.lookup, parcel.search, parcel.compare, owner.pierce, hazard.score, valuation.estimate, permits.history, sales.history) appear in the tool list.

### Quick test

```
Look up parcel 37183:0012345 and tell me the owner.
```

Claude should pick `parcel.lookup` and return canonical record + owner.

---

## Cursor + ChatGPT

**Cursor:** install via the MCP marketplace (search "PropRaven") once we publish, or wire manually:
```jsonc
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "propraven": { "command": "node", "args": ["/abs/path/dist/index.js"], "env": { "PROPRAVEN_API_KEY": "pz_..." } }
  }
}
```

**ChatGPT:** Custom GPT → Actions → OpenAPI URL `https://api.propraven.com/openapi.json` with API-key (Bearer) auth; native MCP-in-ChatGPT can use the hosted endpoint `https://propraven.com/mcp` (OAuth 2.1 + PKCE).

---

## Tools

| Tool | Purpose | Backed by |
|---|---|---|
| `parcel.lookup` | Resolve one parcel by composite ID, address, or APN | `GET /api/v1/parcels/{id}` or `GET /api/v1/search/full` |
| `parcel.search` | Filter parcels by geography + attributes | `GET /api/v1/search/full` |
| `parcel.compare` | Fetch reports for 2–25 parcels for agent-side ranking | `GET /api/v1/parcels/{id}/report` × N |
| `owner.pierce` | Resolve a name/entity to its full portfolio | `GET /api/v1/owners/{name}/portfolio` |
| `hazard.score` | Flood / fire / seismic / windstorm / air-quality / crime composite | `GET /api/v1/parcels/{id}/risks` |
| `valuation.estimate` | AVM + assessed / market values for a parcel | `GET /api/v1/parcels/{id}` |
| `permits.history` | Permit timeline for a parcel | `GET /api/v1/parcels/{id}/permits` |
| `sales.history` | Deed timeline ± UCC liens | `GET /api/v1/parcels/{id}/deeds` (+ `/report` if liens) |

Tool descriptions are optimized for agent reasoning — they explicitly call out **when not to use** each tool, which is the biggest determinant of agent selection accuracy.

---

## Environment

The server reads:

| Variable | Default | Purpose |
|---|---|---|
| `PROPRAVEN_API_KEY` | *(required)* | Bearer token, format `pz_...` |
| `PROPRAVEN_BASE_URL` | `https://api.propraven.com` | API host. Use `https://propzilla.vercel.app` during the DNS cutover window. |
| `PROPRAVEN_TIMEOUT_MS` | `30000` | Per-request timeout in ms. |

---

## Develop / inspect

```bash
# Live-reloading dev (TypeScript, no build step):
PROPRAVEN_API_KEY=pz_test... npm run dev

# Or open the MCP Inspector UI:
PROPRAVEN_API_KEY=pz_test... npm run inspect
```

The inspector at https://modelcontextprotocol.io/legacy/tools/inspector lets you call each tool manually and see request/response payloads.

---

## Why this exists

Every Claude / ChatGPT / Cursor workflow that touches property data needs an authoritative parcel-lookup tool. There is no canonical property-data MCP today. PropRaven aims to be it before the first-mover window closes (~12–18 months).

---

## License

Apache-2.0
