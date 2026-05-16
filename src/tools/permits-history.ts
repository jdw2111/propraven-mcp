import { type Tool, callAPI, requireString, asStringArray, formatJSON } from "./_types.js";
import { getClient } from "../client.js";

interface PermitsResponse {
  data?: Array<Record<string, unknown>>;
}

export const permitsHistory: Tool = {
  name: "permits.history",
  description:
    "Timeline of building / construction / demolition permits filed against a parcel. Each permit includes type, status, " +
    "declared value, issued date, completion date, contractor (where disclosed), and the originating jurisdiction's permit ID. " +
    "Use when the user asks about construction activity, recent renovations, planned work, or wants to detect a property " +
    "that's actively changing. " +
    "Do NOT use to find properties WITH recent permits across a market (use parcel.search). " +
    "Coverage varies by county: top-100 metros have near-complete permit feeds; smaller jurisdictions may be empty.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: "Composite parcel ID." },
      since: { type: "string", description: "ISO date — only return permits issued on or after this date (client-side filter)." },
      types: {
        type: "array",
        items: { type: "string" },
        description: "Filter by permit type substring (e.g. [\"Building\", \"Demolition\"]). Case-insensitive.",
      },
    },
    required: ["parcel_id"],
  },
  handler: async (args) => {
    const id = requireString(args, "parcel_id");
    const since = args.since ? new Date(String(args.since)) : undefined;
    const types = asStringArray(args, "types");

    return callAPI(
      async () => {
        const res = await getClient().get<PermitsResponse>(
          `/api/v1/parcels/${encodeURIComponent(id)}/permits`,
        );
        let permits = res.data ?? [];
        if (since && !Number.isNaN(since.getTime())) {
          permits = permits.filter((p) => {
            const d = p.issued_date ? new Date(String(p.issued_date)) : null;
            return d && !Number.isNaN(d.getTime()) && d >= since;
          });
        }
        if (types && types.length > 0) {
          const lower = types.map((t) => t.toLowerCase());
          permits = permits.filter((p) => {
            const t = String(p.type ?? "").toLowerCase();
            return lower.some((needle) => t.includes(needle));
          });
        }
        return { parcel_id: id, permit_count: permits.length, permits };
      },
      formatJSON,
    );
  },
};
