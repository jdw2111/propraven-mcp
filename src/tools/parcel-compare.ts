import { type Tool, callAPI, asStringArray, toNumber, PARCEL_ID_DESCRIPTION } from "./_types.js";
import { getClient, parcelPath } from "../client.js";

interface Criterion {
  description: string;
  weight?: number;
  direction?: "maximize" | "minimize";
}

/** Requests in flight at once (2–25 parcels × card + risks). */
const CONCURRENCY = 4;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

type Row = Record<string, unknown>;

/** The fields most rankings need, with numeric strings normalized to numbers. */
function summarize(card: Row, risks: Row | null): Row {
  return {
    address: card.address ?? null,
    city: card.city ?? null,
    owner_name: card.owner_name ?? null,
    property_type: card.property_type ?? null,
    land_use_desc: card.land_use_desc ?? null,
    year_built: toNumber(card.year_built),
    building_sqft: toNumber(card.building_sqft),
    lot_size_acres: toNumber(card.lot_size_acres),
    total_assessed_value: toNumber(card.total_assessed_value),
    market_value: toNumber(card.market_value),
    avm_value: toNumber(card.avm_value),
    last_sale_price: toNumber(card.last_sale_price),
    last_sale_date: card.last_sale_date ?? null,
    is_absentee: card.is_absentee ?? null,
    is_entity_owned: card.is_entity_owned ?? null,
    permit_count: toNumber(card.permit_count),
    flood_zone: (risks?.flood_zone ?? card.flood_zone ?? null) as unknown,
    is_sfha: (risks?.is_sfha ?? card.is_sfha ?? null) as unknown,
  };
}

export const parcelCompare: Tool = {
  name: "parcel_compare",
  description:
    "Fetch 2–25 parcels side by side so they can be ranked against criteria. For each parcel it reads the free parcel card " +
    "(GET /api/v1/parcels/{id}: identity, owner, valuation, building, lot) and, unless include_risks=false, the hazard block " +
    "(GET /api/v1/parcels/{id}/risks), and returns a normalized `summary` plus the raw `card` / `risks`. The calling agent does " +
    "the per-criterion scoring and final ranking. NEVER buys the paid parcel report or any other paid product. " +
    "Use when the user has identified candidate properties (often from parcel_search) and wants them ranked. " +
    "Do NOT use to discover new candidates (use parcel_search) or for a single property (use parcel_lookup + hazard_score). " +
    "For deed or permit timelines call sales_history / permits_history per parcel. " +
    "The `criteria` argument is returned verbatim so the agent can pin its scoring to the user's intent.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_ids: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 25,
        description: `2–25 parcel IDs to compare. ${PARCEL_ID_DESCRIPTION}`,
      },
      criteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            weight: { type: "number", minimum: 0, maximum: 1 },
            direction: { type: "string", enum: ["maximize", "minimize"] },
          },
          required: ["description"],
        },
        description: "1–8 ranking criteria, free-form natural language. Echoed back in the response to anchor the agent's scoring.",
      },
      include_risks: {
        type: "boolean",
        default: true,
        description: "Also fetch each parcel's hazard block (/risks). Default true; set false to halve the API calls.",
      },
    },
    required: ["parcel_ids", "criteria"],
  },
  handler: async (args) =>
    callAPI(async () => {
      const ids = [...new Set((asStringArray(args, "parcel_ids") ?? []).map((s) => s.trim()).filter(Boolean))];
      if (ids.length < 2 || ids.length > 25) throw new Error("parcel_ids must contain 2–25 distinct IDs");
      const criteria = (Array.isArray(args.criteria) ? args.criteria : []) as Criterion[];
      const includeRisks = args.include_risks !== false;

      const c = getClient();
      const parcels = await mapLimit(ids, CONCURRENCY, async (id) => {
        let card: Row;
        try {
          card = await c.get<Row>(parcelPath(id));
        } catch (e) {
          return { id, ok: false as const, error: (e as Error).message };
        }
        let risks: Row | null = null;
        let risks_error: string | undefined;
        if (includeRisks) {
          try {
            risks = await c.get<Row>(parcelPath(id, "risks"));
          } catch (e) {
            risks_error = (e as Error).message;
          }
        }
        return {
          id,
          ok: true as const,
          summary: summarize(card, risks),
          card,
          ...(includeRisks ? { risks } : {}),
          ...(risks_error ? { risks_error } : {}),
        };
      });

      return {
        criteria_received: criteria,
        parcels,
        ranking_note:
          "PropRaven returned the free card (and hazards) for each parcel. Rank them yourself by applying the criteria above to " +
          "`summary` (and the raw `card` / `risks` for anything else). Report the ranking plus a one-line rationale per criterion. " +
          "Null means PropRaven does not hold the value — do not treat it as zero.",
      };
    }),
};
