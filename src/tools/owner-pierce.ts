import { type Tool, callAPI } from "./_types.js";
import { getClient } from "../client.js";

export const ownerPierce: Tool = {
  name: "owner.pierce",
  description:
    "Resolve an owner name or entity to its full property portfolio. Pierces LLC/Trust veils where PropRaven has linked the " +
    "entity to its parent (via SEC Ex 21, sponsor parent-rollup, and county-level filings). " +
    "Returns: canonical owner name, entity type, portfolio summary (count, total value, geographic distribution), and a list of parcels owned. " +
    "Use when the user names a person, LLC, trust, or public company and wants to see what they own. " +
    "Do NOT use when starting from a parcel (use parcel.lookup, which returns owner inline). " +
    "If `ticker` is provided, the tool searches owner records for the company name first (best-effort). " +
    "Tier-1 portfolios (SEC-tracked public companies — DHI, INVH, AMH, PHM, etc.) have higher confidence on cross-state attribution.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Owner name or entity name. Free-form — PropRaven normalizes (trims suffixes, handles trust/LLC variants)." },
      ticker: { type: "string", description: "Public-company ticker. The tool attempts to resolve to a company name via owner search first." },
      state: { type: "string", description: "Optional 2-letter state filter to scope the portfolio." },
    },
  },
  handler: async (args) => {
    const c = getClient();
    let resolvedName = args.name ? String(args.name) : undefined;

    // If only ticker provided, try resolving to a name via owner search.
    if (!resolvedName && args.ticker) {
      try {
        const search = await c.get<{ data?: Array<{ owner_name: string }> }>(
          `/api/v1/owners/search`,
          { q: String(args.ticker), limit: 1 },
        );
        if (search.data && search.data[0]) {
          resolvedName = search.data[0].owner_name;
        }
      } catch {
        // fall through — error reported below
      }
    }

    if (!resolvedName) {
      return {
        content: [{ type: "text", text: "Error: provide `name` (preferred) or `ticker`." }],
        isError: true,
      };
    }

    return callAPI(() => c.get(`/api/v1/owners/${encodeURIComponent(resolvedName!)}/portfolio`));
  },
};
