import { type Tool, callAPI, requireString } from "./_types.js";
import { getClient, parcelPath } from "../client.js";
import { withLookupIds } from "./parcel-search.js";

/** Canonical state:county:parcel, e.g. 37:119:12104406. */
const CANONICAL_ID_RE = /^\d{2}:\d{3}:\S+$/;
/** Legacy 5-digit county FIPS + parcel, e.g. 37119:12104406. */
const LEGACY_ID_RE = /^\d{5}:\S+$/;
/** PropRaven parcel UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isParcelId(q: string): boolean {
  return CANONICAL_ID_RE.test(q) || LEGACY_ID_RE.test(q) || UUID_RE.test(q);
}

export const parcelLookup: Tool = {
  name: "parcel_lookup",
  description:
    "Resolve a single US parcel by identifier (canonical state_fips:county_fips:parcel_id, PropRaven UUID, street address, or APN). " +
    "An ID returns the canonical PropRaven parcel card (GET /api/v1/parcels/{id}): identity, current owner, valuation, " +
    "geography and source provenance. An address or APN runs the text search and returns up to 5 candidates — re-call with the " +
    "chosen candidate's `lookup_id` to get the card. " +
    "Use when the user names one specific property. " +
    "Do NOT use when ranking multiple parcels (use parcel_compare) or when filtering by criteria (use parcel_search). " +
    'Example: `parcel_lookup({ query: "37:119:12104406" })` or `parcel_lookup({ query: "2232 Wilmore Dr, Charlotte, NC 28203" })`. ' +
    "Free read — never purchases anything.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Parcel identifier in any of these forms: " +
          '(1) canonical ID like "37:119:12104406" (state_fips:county_fips:parcel_id) — preferred, direct lookup; ' +
          '(2) legacy "37119:12104406" or a PropRaven parcel UUID — direct lookup; ' +
          "(3) full street address with city/state — text search, top 5 returned; " +
          "(4) raw APN — text search fallback.",
      },
    },
    required: ["query"],
  },
  handler: async (args) =>
    callAPI(async () => {
      const query = requireString(args, "query");
      const c = getClient();
      if (isParcelId(query)) return c.get(parcelPath(query));
      return withLookupIds(
        await c.get<{ results?: Array<Record<string, unknown>> }>(`/api/v1/search/full`, { q: query, limit: 5 }),
      );
    }),
};
