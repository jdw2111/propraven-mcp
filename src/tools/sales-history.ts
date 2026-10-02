import { type Tool, callAPI, requireString, asDate, onOrAfter, PARCEL_ID_DESCRIPTION } from "./_types.js";
import { getClient, parcelPath } from "../client.js";

type Deed = Record<string, unknown>;

/** GET /parcels/{id}/deeds: a bare array by default, an envelope with `?shape=envelope`. */
interface DeedsEnvelope {
  data: Deed[];
  status?: "per_deed" | "rollup_events" | "summary_only" | "none";
  known_deed_count?: number | null;
  known_deed_count_basis?: string | null;
  note?: string;
  join_key_basis?: string;
  rollup_probe?: string;
}

export function normalizeDeeds(body: unknown): DeedsEnvelope {
  if (Array.isArray(body)) return { data: body as Deed[] };
  if (body && typeof body === "object" && Array.isArray((body as DeedsEnvelope).data)) return body as DeedsEnvelope;
  throw new Error("unexpected /deeds response shape (neither an array nor an envelope with `data`)");
}

export const salesHistory: Tool = {
  name: "sales_history",
  description:
    "Deed / transaction timeline for a parcel (GET /api/v1/parcels/{id}/deeds): recorded sales and transfers with recording " +
    "and sale dates, sale price (where disclosed), grantor (seller), grantee (buyer), deed/document type and book/page. " +
    "Use when the user asks about a property's transaction history, flip activity, or holding period. " +
    "Do NOT use to find properties with recent sales market-wide, or to estimate current market value (use valuation_estimate). " +
    "Note: 13 states do not disclose sale prices on deeds (KS, MS, TX, UT, WY, etc.). " +
    "`event_count` is the number of events returned. `status` says where they came from: per_deed (deed rows), " +
    "rollup_events (dated rollup entries), summary_only (no events served, but `known_deed_count` deeds are known — see " +
    "known_deed_count_basis), or none. UCC liens are NOT available here (they are only in the paid parcel report, which this " +
    "server never buys). Free read — never purchases anything.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: PARCEL_ID_DESCRIPTION },
      since: { type: "string", description: "ISO date — only return events on or after this date (client-side filter)." },
    },
    required: ["parcel_id"],
  },
  handler: async (args) =>
    callAPI(async () => {
      const id = requireString(args, "parcel_id");
      const since = asDate(args, "since");

      const env = normalizeDeeds(
        await getClient().get(parcelPath(id, "deeds"), { shape: "envelope" }),
      );
      let events = env.data;
      if (since) events = events.filter((e) => onOrAfter(since, e.sale_date, e.recording_date));

      const { data: _data, ...meta } = env;
      return {
        parcel_id: id,
        ...meta,
        event_count: events.length,
        ...(since ? { since: since.toISOString().slice(0, 10), unfiltered_count: env.data.length } : {}),
        events,
        ...(args.include_liens === true
          ? {
              liens:
                "not available — UCC liens are only in the paid parcel report; @propraven/mcp never buys anything.",
            }
          : {}),
      };
    }),
};
