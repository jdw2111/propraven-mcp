import { type Tool, callAPI } from "./_types.js";
import { getClient } from "../client.js";

/** GET /api/v1/owners/search → { data: Owner[], count }. */
interface OwnerSearch {
  data?: Array<{ owner_name?: string | null; owner_name_normalized?: string | null; property_count?: number | null }>;
  count?: number;
}

interface Portfolio {
  owner_name?: string;
  properties?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  match?: unknown;
  [k: string]: unknown;
}

const ownerLabel = (o: NonNullable<OwnerSearch["data"]>[number]) => o.owner_name ?? o.owner_name_normalized ?? null;

export const ownerPierce: Tool = {
  name: "owner_pierce",
  description:
    "List the parcels titled under an owner-of-record name (GET /api/v1/owners/{name}/portfolio). Returns the matched owner " +
    "name, a portfolio `summary` (count, total_value, total_acreage, by_state, truncated) and the `properties` list " +
    "(parcel_id, county_fips, state_fips, address, assessed values, last sale, match_basis, match_confidence). " +
    "This matches owner-name SPELLINGS — it is NOT a verified corporate, parent-subsidiary or beneficial-ownership link. " +
    "Use when the user names a person, LLC, trust, or company and wants to see what is titled under that name. " +
    "Do NOT use when starting from a parcel (use parcel_lookup, which returns owner inline). " +
    "`ticker` is best-effort: it runs an owner-name search (GET /api/v1/owners/search) for the ticker text and uses the top " +
    "match, returning the candidates under `resolution` — verify them, or call again with `name`. " +
    "`state` filters the returned properties client-side (the summary stays portfolio-wide). Free read — never purchases anything.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: 'Owner name or entity name as recorded, e.g. "MARKEY ENTERPRISES INC". Preferred over ticker.',
      },
      ticker: { type: "string", description: "Public-company ticker. Resolved best-effort via an owner-name search." },
      state: { type: "string", description: 'Optional 2-letter state (e.g. "NC") or 2-digit state FIPS to filter the property list.' },
    },
  },
  handler: async (args) =>
    callAPI(async () => {
      const c = getClient();
      const name = typeof args.name === "string" ? args.name.trim() : "";
      const ticker = typeof args.ticker === "string" ? args.ticker.trim() : "";
      let resolvedName = name;
      let resolution: Record<string, unknown> | undefined;

      if (!resolvedName && ticker) {
        const search = await c.get<OwnerSearch>(`/api/v1/owners/search`, { q: ticker, limit: 5 });
        const candidates = (search?.data ?? []).map(ownerLabel).filter((n): n is string => !!n);
        if (candidates.length === 0) {
          throw new Error(`no owner name matched ticker "${ticker}" — call again with \`name\``);
        }
        resolvedName = candidates[0];
        resolution = {
          via: "owners/search",
          query: ticker,
          resolved_name: resolvedName,
          candidates,
          note: "Best-effort: the ticker text was searched as an owner name. Verify the match, or call again with `name`.",
        };
      }
      if (!resolvedName) throw new Error("provide `name` (preferred) or `ticker`.");

      const portfolio = await c.get<Portfolio>(`/api/v1/owners/${encodeURIComponent(resolvedName)}/portfolio`);
      const out: Portfolio = { ...(portfolio ?? {}) };
      if (resolution) out.resolution = resolution;

      const state = typeof args.state === "string" ? args.state.trim().toUpperCase() : "";
      if (state && Array.isArray(out.properties)) {
        const all = out.properties;
        out.properties = all.filter((p) =>
          /^\d{1,2}$/.test(state)
            ? String(p.state_fips ?? "").padStart(2, "0") === state.padStart(2, "0")
            : String(p.state ?? "").toUpperCase() === state,
        );
        out.state_filter = {
          state,
          matched: out.properties.length,
          of_returned: all.length,
          note: "Filtered client-side over the returned properties; `summary` is portfolio-wide.",
        };
      }
      return out;
    }),
};
