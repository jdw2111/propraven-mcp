import type { Tool } from "./_types.js";
import { parcelLookup } from "./parcel-lookup.js";
import { parcelSearch } from "./parcel-search.js";
import { parcelCompare } from "./parcel-compare.js";
import { ownerPierce } from "./owner-pierce.js";
import { hazardScore } from "./hazard-score.js";
import { valuationEstimate } from "./valuation-estimate.js";
import { permitsHistory } from "./permits-history.js";
import { salesHistory } from "./sales-history.js";

/** The 8 tools, named exactly as on the hosted server (https://propraven.com/mcp). */
export const TOOLS: readonly Tool[] = [
  parcelLookup,
  parcelSearch,
  parcelCompare,
  ownerPierce,
  hazardScore,
  valuationEstimate,
  permitsHistory,
  salesHistory,
];
