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

/** USPS abbreviation → 2-digit state FIPS (portfolio rows carry `state` as the FIPS code, e.g. "37"). */
const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13",
  HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25",
  MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36",
  NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48",
  UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56", AS: "60", GU: "66", MP: "69", PR: "72", VI: "78",
};

/** Normalize a `state` argument (USPS code or FIPS) to a 2-digit FIPS, or throw. */
export function stateToFips(input: string): string {
  const v = input.trim().toUpperCase();
  if (/^\d{1,2}$/.test(v)) return v.padStart(2, "0");
  const f = STATE_FIPS[v];
  if (!f) throw new Error(`state must be a 2-letter USPS code or 2-digit FIPS (got "${input}")`);
  return f;
}

/** A portfolio row's state as FIPS: `state_fips`, else `state` (FIPS or USPS code). */
function rowFips(p: Record<string, unknown>): string | null {
  for (const v of [p.state_fips, p.state]) {
    if (v == null || v === "") continue;
    const s = String(v).trim().toUpperCase();
    if (/^\d{1,2}$/.test(s)) return s.padStart(2, "0");
    if (STATE_FIPS[s]) return STATE_FIPS[s];
  }
  return null;
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

      const stateArg = typeof args.state === "string" ? args.state.trim() : "";
      if (stateArg && Array.isArray(out.properties)) {
        const fips = stateToFips(stateArg);
        const all = out.properties;
        out.properties = all.filter((p) => rowFips(p) === fips);
        out.state_filter = {
          state: stateArg.toUpperCase(),
          state_fips: fips,
          matched: out.properties.length,
          of_returned: all.length,
          note: "Filtered client-side over the returned properties; `summary` is portfolio-wide.",
        };
      }
      return out;
    }),
};
