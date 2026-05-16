import { type Tool, callAPI, requireString, asStringArray } from "./_types.js";
import { getClient } from "../client.js";

type Hazard = "flood" | "wildfire" | "seismic" | "windstorm" | "air_quality" | "crime" | "all";

export const hazardScore: Tool = {
  name: "hazard.score",
  description:
    "Composite hazard score for a parcel: flood (FEMA NFIP zone), wildfire (USFS WUI), seismic (USGS ASCE7), windstorm, " +
    "air quality (EPA AQS), and crime (composite tier). Each sub-score includes source citations. " +
    "Use when the user asks about a property's risk profile — insurance pricing, underwriting, or due diligence. " +
    "Do NOT use to compare multiple parcels (use parcel.compare with a hazard criterion). " +
    "Backed by /api/v1/parcels/{id}/risks. Coverage varies by hazard: flood and crime are widely available; " +
    "wildfire is strongest in CA/OR/WA/ID/MT/CO; seismic strongest on the West Coast.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: "Composite parcel ID (county_fips:parcel_id). Use parcel.lookup to obtain." },
      include: {
        type: "array",
        items: { type: "string", enum: ["flood", "wildfire", "seismic", "windstorm", "air_quality", "crime", "all"] },
        description: "Subset of hazards to keep in the response. Default: return all.",
      },
    },
    required: ["parcel_id"],
  },
  handler: async (args) => {
    const id = requireString(args, "parcel_id");
    const include = (asStringArray(args, "include") as Hazard[] | undefined) ?? ["all"];

    return callAPI(async () => {
      const data = await getClient().get<Record<string, unknown>>(
        `/api/v1/parcels/${encodeURIComponent(id)}/risks`,
      );
      if (include.includes("all")) return data;
      const filtered: Record<string, unknown> = {};
      for (const k of include) {
        if (k in data) filtered[k] = data[k];
      }
      return filtered;
    });
  },
};
