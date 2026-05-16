import { type Tool, callAPI, requireString, formatJSON } from "./_types.js";
import { getClient } from "../client.js";

interface ParcelResponse {
  assessed_value?: number | null;
  land_value?: number | null;
  improvement_value?: number | null;
  market_value?: number | null;
  last_sale_date?: string | null;
  last_sale_price?: number | null;
  [k: string]: unknown;
}

export const valuationEstimate: Tool = {
  name: "valuation.estimate",
  description:
    "Estimated market value for a parcel: market estimate, assessed value, last sale price, and the underlying assessment + " +
    "improvement breakdown. " +
    "Use when the user asks for a property's value, market estimate, AVM, or wants to compare assessed vs market. " +
    "Do NOT use as a substitute for an appraisal — PropRaven AVM has ±10–15% MAE in normal markets, wider in tail. " +
    "Historical AVM (as_of) is not yet supported in v1; tool returns the current snapshot.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: "Composite parcel ID (county_fips:parcel_id)." },
      as_of: { type: "string", description: "ISO date — historical AVM. NOT YET SUPPORTED in v1; ignored." },
    },
    required: ["parcel_id"],
  },
  handler: async (args) => {
    const id = requireString(args, "parcel_id");
    return callAPI(
      async () => {
        const data = await getClient().get<ParcelResponse>(`/api/v1/parcels/${encodeURIComponent(id)}`);
        return {
          parcel_id: id,
          market_value: data.market_value ?? null,
          assessed_value: data.assessed_value ?? null,
          land_value: data.land_value ?? null,
          improvement_value: data.improvement_value ?? null,
          last_sale_date: data.last_sale_date ?? null,
          last_sale_price: data.last_sale_price ?? null,
          confidence_note:
            data.market_value === null
              ? "market_value not available; assessed_value is the best proxy."
              : "PropRaven AVM ±10–15% MAE in normal markets. Use a licensed appraisal for transactions.",
          as_of_supported: false,
        };
      },
      formatJSON,
    );
  },
};
