# Changelog

## 0.2.0 — 2026-10-02

### Breaking

- **Tool renames.** Dotted names were invalid for MCP clients and the Anthropic API (`^[a-zA-Z0-9_-]{1,64}$`). The tools now use the hosted server's names:
  `parcel.lookup` → `parcel_lookup`, `parcel.search` → `parcel_search`, `parcel.compare` → `parcel_compare`, `owner.pierce` → `owner_pierce`, `hazard.score` → `hazard_score`, `valuation.estimate` → `valuation_estimate`, `permits.history` → `permits_history`, `sales.history` → `sales_history`.
- `sales_history` no longer accepts `include_liens` (it fetched the paid parcel report). Passing it returns a note that liens are not available here.
- `valuation_estimate` returns the API's field names: `total_assessed_value`, `land_assessed_value`, `improvement_assessed_value` (plus `avm_value`, `avm_confidence`, `avm_method`, `tax_amount`, `tax_year`, `price_per_sqft`, …) instead of the never-populated `assessed_value` / `land_value` / `improvement_value`.
- `parcel_compare` returns `summary` + `card` (+ `risks`) per parcel instead of the paid report.
- Default base URL is `https://propraven.com` (was `https://api.propraven.com`; `PROPRAVEN_BASE_URL` still overrides).

### Fixed

- No tool can spend money: `parcel_compare` and `sales_history` no longer call the paid `GET /parcels/{id}/report`; the client refuses any path outside the seven free read endpoints the tools use and never sends a payment header; an x402 `402` is reported as "payment required — this tool never pays".
- `sales_history` / `permits_history` always returned 0 events: `/deeds` and `/permits` answer a bare array by default. They now request `shape=envelope` and also accept a bare array, and pass through `status` / `known_deed_count` and `permit_count` / `permit_count_basis` / `truncated`.
- `permits_history` `types` filtered on `type`; it now filters on `permit_type`.
- `valuation_estimate` read fields that do not exist on the Parcel; it now maps the real ones and accepts numbers or pre-1.2.0 numeric strings (`"19388200.00"`).
- `parcel_lookup` treated the canonical ID `37:119:12104406` (and UUIDs) as an address; they now resolve directly.
- `hazard_score` `include: ["flood"]` returned nothing (there is no `flood` key); it maps to `flood_zone` / `is_sfha` / `is_sfha_basis`, every requested key is present (null when not held) and unknown tokens are an error.
- `owner_pierce` ignored `state` (now filters the property list) and resolved `ticker` via a field `owners/search` does not always return (now `owner_name` or `owner_name_normalized`, with the candidates returned under `resolution`).
- `parcel_search` gained `cursor` (sent as the API's keyset `after`); search results carry a `lookup_id` (the row's PropRaven UUID, or `state:county:parcel`) that `parcel_lookup` / `parcel_compare` accept.
- Errors show `<status> <code>: <detail>` from the RFC 7807 body. One retry on `429` / `503` when `Retry-After` ≤ 10 s.
- The MCP handshake and `User-Agent` (`@propraven/mcp/<version>`) report the package version (was `0.1.0-alpha.1` / `0.1.0`).
- Parcel-ID wording uses the canonical `state:county:parcel` form (`37:119:12104406`).

### Added

- `node:test` suite (`npm test`, no network) and a CI workflow running build + tests + `npm pack --dry-run` on pull requests.
- Tools advertise `readOnlyHint` annotations.

### Release order

Publish npm first, then the registry: push tag `v0.2.0` on the merged commit → "Publish to npm" → "Publish to MCP Registry" runs on its completion. A push of `server.json` to `main` before the npm version exists now skips the registry publish instead of failing.

## 0.1.1

- Initial npm release (dotted tool names).
