import { type Tool, callAPI, asStringArray, formatJSON } from "./_types.js";
import { getClient } from "../client.js";

interface Criterion {
  description: string;
  weight?: number;
  direction?: "maximize" | "minimize";
}

export const parcelCompare: Tool = {
  name: "parcel.compare",
  description:
    "Fetch reports for 2–25 parcels so they can be ranked against criteria. Returns each parcel's full report " +
    "(identity, owner, valuation, risks, permits, deeds) in a single payload — the calling agent does the per-criterion " +
    "scoring and final ranking. This is the underwriting / shortlist loop. " +
    "Use when the user has identified candidate properties (often from parcel.search) and wants them ranked. " +
    "Do NOT use to discover new candidates (use parcel.search) or for a single property (use parcel.lookup + hazard.score). " +
    "The `criteria` argument is returned verbatim in the response so the agent can pin its scoring to the user's intent.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_ids: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 25,
        description:
          "Composite parcel IDs to compare (e.g. \"37183:0012345\"). 2–25 parcels. Get IDs via parcel.search or parcel.lookup.",
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
    },
    required: ["parcel_ids", "criteria"],
  },
  handler: async (args) => {
    const ids = asStringArray(args, "parcel_ids") ?? [];
    if (ids.length < 2 || ids.length > 25) {
      return {
        content: [{ type: "text", text: "Error: parcel_ids must contain 2–25 IDs" }],
        isError: true,
      };
    }
    const criteria = (Array.isArray(args.criteria) ? args.criteria : []) as Criterion[];

    const c = getClient();
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const data = await c.get(`/api/v1/parcels/${encodeURIComponent(id)}/report`);
          return { id, ok: true as const, data };
        } catch (e) {
          return { id, ok: false as const, error: (e as Error).message };
        }
      }),
    );

    return callAPI(async () => ({
      criteria_received: criteria,
      parcels: results,
      ranking_note:
        "PropRaven returned raw data for each parcel. Rank them yourself by applying the criteria above to the per-parcel data " +
        "(particularly assessed_value, owner type, risks, permits.history). Report the ranking plus a one-line rationale per criterion.",
    }), formatJSON);
  },
};
