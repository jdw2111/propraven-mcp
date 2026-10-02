import { type Tool, callAPI } from "./_types.js";
import { getClient } from "../client.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An ID parcel_lookup / parcel_compare accept for a search row. /search/full
 * rows carry the PropRaven UUID in `parcel_id` (and a 5-digit `county_fips`),
 * so the UUID is used as-is; a row with a county parcel number becomes
 * state:county(3):parcel. Null when the row has neither.
 */
export function lookupId(r: Record<string, unknown>): string | null {
  const pid = typeof r.parcel_id === "string" ? r.parcel_id.trim() : "";
  if (pid && (UUID_RE.test(pid) || /^\d{2}:\d{3}:\S+$/.test(pid))) return pid;
  const st = r.state_fips, co = r.county_fips;
  if (pid && typeof st === "string" && st && typeof co === "string" && co) {
    return `${st.padStart(2, "0")}:${co.slice(-3).padStart(3, "0")}:${pid}`;
  }
  return typeof r.id === "string" && UUID_RE.test(r.id) ? r.id : null;
}

/** Add `lookup_id` to each /search/full row. */
export function withLookupIds<T extends { results?: Array<Record<string, unknown>> }>(res: T): T {
  if (res && Array.isArray(res.results)) {
    res.results = res.results.map((r) => ({ lookup_id: lookupId(r), ...r }));
  }
  return res;
}

export const parcelSearch: Tool = {
  name: "parcel_search",
  description:
    "Text search over US parcels (GET /api/v1/search/full): pass `q` as a city, owner name, address fragment or APN, " +
    "optionally narrowed by `field`, `state` and `city`. Returns `{ results, total, totalCapped, page, pages, hasMore, nextCursor }` " +
    "(default 50 per page, max 200); each result carries parcel_id, apn, county_fips, state_fips, site_address, city, zip5, " +
    "owner_name, total_value, latitude, longitude (in search rows `parcel_id` is the PropRaven UUID and `county_fips` is 5-digit), " +
    "plus `lookup_id`, added by this server — pass it to parcel_lookup / parcel_compare. " +
    "Page with `cursor` (the previous response's `nextCursor`) rather than `page`; `total` is a floor when `totalCapped` is true. " +
    "Use when the user wants properties matching a name, place or address fragment. " +
    "Do NOT use when looking up a single known property (use parcel_lookup) or ranking a known set (use parcel_compare). " +
    "Free read — never purchases anything.",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "Text query — owner name, address fragment, APN or city. Min 2 chars.", minLength: 2 },
      field: {
        type: "string",
        enum: ["all", "address", "owner_name", "city"],
        description: "Restrict the q match to one field. Default all.",
      },
      state: { type: "string", description: '2-letter state filter (e.g. "NC").', maxLength: 2 },
      city: { type: "string", description: "City filter (when q is not the city)." },
      cursor: {
        type: "string",
        description: "Opaque keyset cursor: the previous response's `nextCursor`. Preferred over `page`. Keep sort/dir stable while paging.",
      },
      page: { type: "integer", minimum: 1, default: 1, description: "1-indexed page number (prefer `cursor`)." },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      sort: { type: "string", enum: ["address", "city", "state", "owner_name", "total_value", "year_built"], default: "address" },
      dir: { type: "string", enum: ["asc", "desc"], default: "asc" },
    },
    required: ["q"],
  },
  handler: async (args) =>
    callAPI(async () => {
      const q = typeof args.q === "string" ? args.q.trim() : "";
      if (q.length < 2) throw new Error("q is required and must be at least 2 characters");
      const params: Record<string, string | number | boolean | undefined> = {
        q,
        field: args.field ? String(args.field) : undefined,
        state: args.state ? String(args.state).toUpperCase() : undefined,
        city: args.city ? String(args.city) : undefined,
        after: args.cursor ? String(args.cursor) : undefined,
        page: typeof args.page === "number" && !args.cursor ? args.page : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
        sort: args.sort ? String(args.sort) : undefined,
        dir: args.dir ? String(args.dir) : undefined,
      };
      return withLookupIds(
        await getClient().get<{ results?: Array<Record<string, unknown>> }>(`/api/v1/search/full`, params),
      );
    }),
};
