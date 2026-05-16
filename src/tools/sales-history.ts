import { type Tool, callAPI, requireString, formatJSON } from "./_types.js";
import { getClient } from "../client.js";

interface DeedsResponse {
  data?: Array<Record<string, unknown>>;
}

interface ReportResponse {
  ucc_liens?: Array<Record<string, unknown>>;
}

export const salesHistory: Tool = {
  name: "sales.history",
  description:
    "Deed / transaction timeline for a parcel: every recorded sale, transfer, refinance. Each event includes date, " +
    "sale price (where disclosed; flagged when withheld by state), buyer, seller, and deed type. " +
    "Use when the user asks about a property's transaction history, flip activity, or holding period. " +
    "Do NOT use to find properties with recent sales market-wide (use parcel.search with `sold_since`) or to estimate " +
    "current market value (use valuation.estimate, which incorporates this data plus comps). " +
    "Note: 13 states do not disclose sale prices on deeds (KS, MS, TX, UT, WY, etc.); PropRaven flags these explicitly. " +
    "If `include_liens=true`, the tool ALSO fetches UCC liens via the parcel report — two API calls.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: "Composite parcel ID." },
      since: { type: "string", description: "ISO date — only return events on or after this date (client-side filter)." },
      include_liens: { type: "boolean", description: "Include UCC liens. Default false. Adds one extra API call.", default: false },
    },
    required: ["parcel_id"],
  },
  handler: async (args) => {
    const id = requireString(args, "parcel_id");
    const since = args.since ? new Date(String(args.since)) : undefined;
    const includeLiens = args.include_liens === true;

    return callAPI(
      async () => {
        const c = getClient();
        const deeds = await c.get<DeedsResponse>(`/api/v1/parcels/${encodeURIComponent(id)}/deeds`);
        let events = deeds.data ?? [];
        if (since && !Number.isNaN(since.getTime())) {
          events = events.filter((e) => {
            const candidates = [e.sale_date, e.recording_date].filter((x) => x != null);
            for (const c of candidates) {
              const d = new Date(String(c));
              if (!Number.isNaN(d.getTime()) && d >= since) return true;
            }
            return false;
          });
        }
        let ucc_liens: Array<Record<string, unknown>> | undefined;
        if (includeLiens) {
          try {
            const report = await c.get<ReportResponse>(
              `/api/v1/parcels/${encodeURIComponent(id)}/report`,
            );
            ucc_liens = report.ucc_liens;
          } catch {
            // non-fatal — return deeds without liens
            ucc_liens = undefined;
          }
        }
        return {
          parcel_id: id,
          event_count: events.length,
          events,
          ...(ucc_liens !== undefined && { ucc_liens, ucc_lien_count: ucc_liens.length }),
        };
      },
      formatJSON,
    );
  },
};
