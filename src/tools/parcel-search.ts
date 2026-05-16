import { type Tool, callAPI } from "./_types.js";
import { getClient } from "../client.js";

export const parcelSearch: Tool = {
  name: "parcel.search",
  description:
    "Filter US parcels by geography + attributes. Returns a ranked list (default 50, max 200) of matches " +
    "with summary fields (id, address, owner, assessed value, last sale). " +
    "Use when the user wants properties matching criteria (\"absentee-owned SFR in Mecklenburg County over $400k\", " +
    "\"flipped properties in Phoenix since 2024\"). " +
    "Do NOT use when looking up a single known property (use parcel.lookup) or ranking a known set (use parcel.compare). " +
    "Backed by the /api/v1/search/full text+attribute index; pass `q` as either a city, owner name, or address fragment.",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "Text query — owner name, address fragment, or city. Min 2 chars.", minLength: 2 },
      field: { type: "string", enum: ["all", "address", "owner_name", "city"], description: "Restrict the q match to one field." },
      state: { type: "string", description: "2-letter state filter." },
      city: { type: "string", description: "City filter (when q is non-city)." },
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      sort: { type: "string", enum: ["address", "city", "state", "owner_name", "total_value", "year_built"], default: "address" },
      dir: { type: "string", enum: ["asc", "desc"], default: "asc" },
    },
    required: ["q"],
  },
  handler: async (args) => {
    const params: Record<string, string | number | boolean | undefined> = {
      q: String(args.q ?? ""),
      field: args.field ? String(args.field) : undefined,
      state: args.state ? String(args.state) : undefined,
      city: args.city ? String(args.city) : undefined,
      page: typeof args.page === "number" ? args.page : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
      sort: args.sort ? String(args.sort) : undefined,
      dir: args.dir ? String(args.dir) : undefined,
    };
    return callAPI(() => getClient().get(`/api/v1/search/full`, params));
  },
};
