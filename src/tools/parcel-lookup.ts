import { type Tool, callAPI, requireString } from "./_types.js";
import { getClient } from "../client.js";

const COMPOSITE_ID_RE = /^\d{5}:\S+$/;

export const parcelLookup: Tool = {
  name: "parcel.lookup",
  description:
    "Resolve a single US parcel by identifier (composite county_fips:parcel_id, street address, or APN). " +
    "Returns the canonical PropRaven record: identity, current owner, valuation, geography, and source provenance. " +
    "Use when the user names one specific property. " +
    "Do NOT use when ranking multiple parcels (use parcel.compare) or when filtering by criteria (use parcel.search). " +
    "Example: `parcel.lookup({ query: \"37183:0012345\" })` or `parcel.lookup({ query: \"420 S Tryon St, Charlotte NC\" })`.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Parcel identifier in any of three forms: " +
          "(1) composite ID like \"37183:0012345\" — preferred, direct lookup; " +
          "(2) full street address with state — uses fuzzy search, top 5 returned; " +
          "(3) raw APN — search fallback.",
      },
    },
    required: ["query"],
  },
  handler: async (args) => {
    const query = requireString(args, "query");
    const c = getClient();
    if (COMPOSITE_ID_RE.test(query)) {
      return callAPI(() => c.get(`/api/v1/parcels/${encodeURIComponent(query)}`));
    }
    return callAPI(() => c.get(`/api/v1/search/full`, { q: query, limit: 5 }));
  },
};
