import { type Tool, callAPI, requireString, toNumber, PARCEL_ID_DESCRIPTION } from "./_types.js";
import { getClient, parcelPath } from "../client.js";

type Parcel = Record<string, unknown>;

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

export function valuationFromParcel(id: string, p: Parcel) {
  const market_value = toNumber(p.market_value);
  const avm_value = toNumber(p.avm_value);
  const total_assessed_value = toNumber(p.total_assessed_value);

  let confidence_note: string;
  if (market_value != null) {
    confidence_note =
      "market_value is PropRaven's modeled estimate — read avm_method / avm_confidence before quoting it. Not an appraisal.";
  } else if (avm_value != null) {
    confidence_note =
      "market_value is not served; avm_value is the modeled estimate (see avm_method / avm_confidence). Not an appraisal.";
  } else if (total_assessed_value != null) {
    confidence_note = "No market estimate is served for this parcel; total_assessed_value is the best available proxy.";
  } else {
    confidence_note = "PropRaven holds no market estimate or assessment for this parcel.";
  }

  return {
    parcel_id: id,
    market_value,
    avm_value,
    avm_confidence: str(p.avm_confidence),
    avm_method: str(p.avm_method),
    ...(p.avm_method_family !== undefined ? { avm_method_family: p.avm_method_family } : {}),
    ...(p.avm_method_basis !== undefined ? { avm_method_basis: p.avm_method_basis } : {}),
    total_assessed_value,
    land_assessed_value: toNumber(p.land_assessed_value),
    improvement_assessed_value: toNumber(p.improvement_assessed_value),
    tax_amount: toNumber(p.tax_amount),
    tax_year: toNumber(p.tax_year),
    last_sale_price: toNumber(p.last_sale_price),
    last_sale_date: str(p.last_sale_date),
    price_per_sqft: toNumber(p.price_per_sqft),
    ...(p.price_per_sqft_basis !== undefined ? { price_per_sqft_basis: p.price_per_sqft_basis } : {}),
    building_sqft: toNumber(p.building_sqft),
    confidence_note,
    as_of_supported: false,
  };
}

export const valuationEstimate: Tool = {
  name: "valuation_estimate",
  description:
    "Value fields for a parcel from its free card (GET /api/v1/parcels/{id}): market_value, avm_value with avm_confidence / " +
    "avm_method, total / land / improvement assessed value, tax, last sale price and date, price_per_sqft. Numbers are " +
    "normalized to JSON numbers (null = not held). " +
    "Use when the user asks for a property's value, market estimate, AVM, or wants to compare assessed vs market. " +
    "Do NOT use as a substitute for an appraisal — this is a modeled estimate. " +
    "Historical AVM (as_of) is not supported; the tool returns the current snapshot. Free read — never purchases anything.",
  inputSchema: {
    type: "object",
    properties: {
      parcel_id: { type: "string", description: PARCEL_ID_DESCRIPTION },
      as_of: { type: "string", description: "ISO date — historical AVM. NOT SUPPORTED; ignored." },
    },
    required: ["parcel_id"],
  },
  handler: async (args) =>
    callAPI(async () => {
      const id = requireString(args, "parcel_id");
      const data = await getClient().get<Parcel>(parcelPath(id));
      return valuationFromParcel(id, data ?? {});
    }),
};
