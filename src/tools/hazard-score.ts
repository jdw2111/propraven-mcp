import { type Tool, callAPI, requireString, asStringArray, PARCEL_ID_DESCRIPTION } from "./_types.js";
import { getClient, parcelPath } from "../client.js";

/** Each `include` token → the RiskAssessment keys it covers. */
export const HAZARD_KEYS: Record<string, string[]> = {
  flood: ["flood_zone", "is_sfha", "is_sfha_basis"],
  wildfire: ["wildfire"],
  seismic: ["seismic"],
  windstorm: ["windstorm"],
  air_quality: ["air_quality"],
  crime: ["crime"],
};
/** Provenance blocks that always travel with any subset. */
const GATE_KEYS = ["withhold_gate", "identity_gate"];

export const hazardScore: Tool = {
  name: "hazard_score",
  description:
    "Hazard profile for a parcel (GET /api/v1/parcels/{id}/risks): flood (FEMA zone + SFHA flag), wildfire, seismic, windstorm, " +
    "air quality and crime blocks, plus withhold_gate / identity_gate provenance. " +
    "Use when the user asks about a property's risk profile — insurance pricing, underwriting, or due diligence. " +
    "Do NOT use to compare multiple parcels (use parcel_compare, which includes each parcel's hazards). " +
    "Every requested key is present: the value, or null when PropRaven does not hold it. " +
    "Coverage varies by hazard. Free read — never purchases anything (this is not the paid risk-score product).",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: PARCEL_ID_DESCRIPTION },
      include: {
        type: "array",
        items: { type: "string", enum: ["flood", "wildfire", "seismic", "windstorm", "air_quality", "crime", "all"] },
        description:
          "Hazard blocks to return (default all). flood → flood_zone + is_sfha + is_sfha_basis; the others map to the same-named block.",
      },
    },
    required: ["parcel_id"],
  },
  handler: async (args) =>
    callAPI(async () => {
      const id = requireString(args, "parcel_id");
      const include = asStringArray(args, "include")?.map((s) => s.trim().toLowerCase()) ?? ["all"];
      const unknown = include.filter((t) => t !== "all" && !(t in HAZARD_KEYS));
      if (unknown.length > 0) {
        throw new Error(`unknown include token(s): ${unknown.join(", ")} (allowed: ${Object.keys(HAZARD_KEYS).join(", ")}, all)`);
      }

      const data = (await getClient().get<Record<string, unknown>>(parcelPath(id, "risks"))) ?? {};
      if (include.length === 0 || include.includes("all")) return { parcel_id: id, ...data };

      const out: Record<string, unknown> = { parcel_id: id, included: include };
      for (const token of include) {
        for (const key of HAZARD_KEYS[token]) out[key] = data[key] ?? null;
      }
      for (const key of GATE_KEYS) if (key in data) out[key] = data[key];
      return out;
    }),
};
