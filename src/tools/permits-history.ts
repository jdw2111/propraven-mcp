import { type Tool, callAPI, requireString, asStringArray, asDate, onOrAfter, PARCEL_ID_DESCRIPTION } from "./_types.js";
import { getClient, parcelPath } from "../client.js";

type Permit = Record<string, unknown>;

/** GET /parcels/{id}/permits: a bare array by default, an envelope with `?shape=envelope`. */
interface PermitsEnvelope {
  data: Permit[];
  permit_count?: number;
  permit_count_basis?: "exact" | "capped" | "returned_rows";
  truncated?: boolean;
  row_cap?: number;
}

export function normalizePermits(body: unknown): PermitsEnvelope {
  if (Array.isArray(body)) {
    // Bare array: all we know is the rows we got.
    return { data: body as Permit[], permit_count: body.length, permit_count_basis: "returned_rows" };
  }
  if (body && typeof body === "object" && Array.isArray((body as PermitsEnvelope).data)) return body as PermitsEnvelope;
  throw new Error("unexpected /permits response shape (neither an array nor an envelope with `data`)");
}

export const permitsHistory: Tool = {
  name: "permits_history",
  description:
    "Timeline of building / construction / demolition permits filed against a parcel (GET /api/v1/parcels/{id}/permits). " +
    "Each permit includes permit_number, permit_type, permit_status, description, work_class, issued_date, completed_date, " +
    "estimated_cost, contractor_name (where disclosed). " +
    "Use when the user asks about construction activity, recent renovations, planned work, or wants to detect a property " +
    "that's actively changing. Do NOT use to find properties WITH recent permits across a market. " +
    "At most 100 permits are returned (newest first). `permit_count` is the parcel's TRUE count when `permit_count_basis` is " +
    '"exact"; "capped" means it is the size of the 100-row window (a floor); `truncated: true` means the parcel has more permits ' +
    "than returned. `since` / `types` filter the returned window only (`returned_count` is after filtering). " +
    "Coverage varies by county. Free read — never purchases anything.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: PARCEL_ID_DESCRIPTION },
      since: { type: "string", description: "ISO date — only return permits issued on or after this date (client-side filter)." },
      types: {
        type: "array",
        items: { type: "string" },
        description: 'Keep permits whose permit_type contains any of these substrings (e.g. ["Building", "Demolition"]). Case-insensitive.',
      },
    },
    required: ["parcel_id"],
  },
  handler: async (args) =>
    callAPI(async () => {
      const id = requireString(args, "parcel_id");
      const since = asDate(args, "since");
      const types = asStringArray(args, "types")?.filter((t) => t.trim() !== "");

      const env = normalizePermits(
        await getClient().get(parcelPath(id, "permits"), { shape: "envelope" }),
      );
      let permits = env.data;
      if (since) permits = permits.filter((p) => onOrAfter(since, p.issued_date));
      if (types && types.length > 0) {
        const needles = types.map((t) => t.toLowerCase());
        permits = permits.filter((p) => {
          const t = String(p.permit_type ?? p.type ?? "").toLowerCase();
          return needles.some((n) => t.includes(n));
        });
      }
      const { data: _data, ...meta } = env;
      return {
        parcel_id: id,
        ...meta,
        returned_count: permits.length,
        permits,
      };
    }),
};
