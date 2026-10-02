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

## Local stdio server (`npx @propraven/mcp`)

**Requirements:** Node ≥18, a PropRaven API key (`pz_…`) from https://propraven.com/settings/api-keys (free, no card).

Claude Desktop — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "propraven": {
      "command": "npx",
      "args": ["-y", "@propraven/mcp"],
      "env": { "PROPRAVEN_API_KEY": "pz_your_real_key_here" }
    }
  }
}
```

Cursor (`~/.cursor/mcp.json`) takes the same block. Claude Code:
`claude mcp add propraven --env PROPRAVEN_API_KEY=pz_your_real_key_here -- npx -y @propraven/mcp`.

Restart the client. The 8 PropRaven tools appear in the tool list.

### Quick test

```
Look up parcel 37:119:12104406 and tell me the owner.
```

The agent should pick `parcel_lookup` and return the canonical parcel card with the owner.

**ChatGPT:** Custom GPT → Actions → OpenAPI URL `https://api.propraven.com/openapi.json` with API-key (Bearer) auth; native MCP-in-ChatGPT can use the hosted endpoint `https://propraven.com/mcp` (OAuth 2.1 + PKCE).

---

## Tools

Names match the hosted server (`^[a-zA-Z0-9_-]{1,64}$`, as MCP clients and the Anthropic API require).

| Tool | Purpose | Backed by |
|---|---|---|
| `parcel_lookup` | Resolve one parcel by ID, address, or APN | `GET /api/v1/parcels/{id}` (ID) or `GET /api/v1/search/full` (address / APN) |
| `parcel_search` | Text search by owner, address fragment, APN or city (+ state/city filters, keyset `cursor`) | `GET /api/v1/search/full` |
| `parcel_compare` | Free card (+ hazards) for 2–25 parcels, for agent-side ranking | `GET /api/v1/parcels/{id}` (+ `/risks`) × N |
| `owner_pierce` | Parcels titled under an owner name (optional `state` filter, best-effort `ticker`) | `GET /api/v1/owners/{name}/portfolio` (+ `/owners/search` for `ticker`) |
| `hazard_score` | Flood / wildfire / seismic / windstorm / air-quality / crime blocks | `GET /api/v1/parcels/{id}/risks` |
| `valuation_estimate` | Market value, AVM, assessed values, last sale, $/sqft | `GET /api/v1/parcels/{id}` |
| `permits_history` | Permit timeline (≤100 newest, with true-count basis) | `GET /api/v1/parcels/{id}/permits?shape=envelope` |
| `sales_history` | Deed / transfer timeline | `GET /api/v1/parcels/{id}/deeds?shape=envelope` |

**Parcel IDs.** The canonical form is `state_fips:county_fips:parcel_id`, e.g. `37:119:12104406`. The legacy 5-digit form (`37119:12104406`) and PropRaven parcel UUIDs are also accepted. `parcel_search` and `parcel_lookup`'s address search add a `canonical_id` to every result.

**No tool spends money.** The client only issues `GET`s to the seven free / metered read endpoints above, refuses every other path before a request is sent (the paid parcel report, comp pack, risk score, owner report, leads, storefront, …), and never sends a payment header. If the API ever answers with an x402 `402 Payment Required`, the tool returns `402 payment required — this tool never pays`. Calls still count against your plan's monthly quota. To buy a dossier, use the hosted server's explicit `buy_*` tools or propraven.com.

**Errors** are RFC 7807 problem details, surfaced as `<status> <code>: <detail>` (e.g. `404 not_found: …`). A `429` or `503` is retried once when `Retry-After` is ≤ 10 s.

Tool descriptions call out **when not to use** each tool, which is the biggest determinant of agent selection accuracy.

---

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PROPRAVEN_API_KEY` | *(required)* | Bearer token, format `pz_...` |
| `PROPRAVEN_BASE_URL` | `https://propraven.com` | API host (every path starts with `/api/v1`). |
| `PROPRAVEN_TIMEOUT_MS` | `30000` | Per-request timeout in ms. |

Requests carry `User-Agent: @propraven/mcp/<version>`.

---

## Develop / inspect

```bash
npm ci
npm run build
npm test          # node:test suite — no network, no API key needed

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
