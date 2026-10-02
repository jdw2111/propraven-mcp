import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parcelLookup } from "../src/tools/parcel-lookup.js";
import { parcelSearch } from "../src/tools/parcel-search.js";
import { parcelCompare } from "../src/tools/parcel-compare.js";
import { ownerPierce } from "../src/tools/owner-pierce.js";
import { hazardScore } from "../src/tools/hazard-score.js";
import { valuationEstimate } from "../src/tools/valuation-estimate.js";
import { permitsHistory } from "../src/tools/permits-history.js";
import { salesHistory } from "../src/tools/sales-history.js";

import {
  stubFetch,
  json,
  problem,
  unexpected,
  path,
  toolJSON,
  toolText,
  PARCEL,
  RISKS,
  DEEDS,
  PERMITS,
  X402_BODY,
} from "./helpers.js";

process.env.PROPRAVEN_API_KEY = "pz_test_key";
delete process.env.PROPRAVEN_BASE_URL;

const ALL = [
  parcelLookup,
  parcelSearch,
  parcelCompare,
  ownerPierce,
  hazardScore,
  valuationEstimate,
  permitsHistory,
  salesHistory,
];

const HOSTED_NAMES = [
  "parcel_lookup",
  "parcel_search",
  "parcel_compare",
  "owner_pierce",
  "hazard_score",
  "valuation_estimate",
  "permits_history",
  "sales_history",
];

const PAID = /\/(report|comp-pack|risk-score)$|\/storefront\//;

describe("defect 1 — tool names", () => {
  test("every tool name matches ^[a-zA-Z0-9_-]{1,64}$", () => {
    for (const t of ALL) assert.match(t.name, /^[a-zA-Z0-9_-]{1,64}$/, `bad tool name ${t.name}`);
  });

  test("tool names equal the hosted server's names", () => {
    assert.deepEqual(ALL.map((t) => t.name).sort(), [...HOSTED_NAMES].sort());
  });

  test("descriptions never cross-reference a dotted tool name", () => {
    const dotted = /\b(parcel|owner|hazard|valuation|permits|sales)\.(lookup|search|compare|pierce|score|estimate|history)\b/;
    for (const t of ALL) {
      assert.doesNotMatch(JSON.stringify({ d: t.description, s: t.inputSchema }), dotted, t.name);
    }
  });
});

describe("defect 8 — parcel id format", () => {
  test("descriptions use the canonical state:county:parcel form, not 37183:…", () => {
    const blob = JSON.stringify(ALL.map((t) => ({ d: t.description, s: t.inputSchema })));
    assert.doesNotMatch(blob, /37183:/);
    assert.doesNotMatch(blob, /(?<!state_fips:)county_fips:parcel_id/, "old two-part id form");
    assert.match(blob, /37:119:12104406/);
  });

  for (const id of ["37:119:12104406", "37119:12104406", "0b7f2c4e-1111-4222-8333-944455556666"]) {
    test(`parcel_lookup resolves id ${id} directly via GET /parcels/{id}`, async () => {
      const calls = stubFetch((url) => (path(url).startsWith("/api/v1/parcels/") ? json(PARCEL) : unexpected(url)));
      const res = await parcelLookup.handler({ query: id });
      assert.equal(res.isError, undefined, toolText(res));
      assert.equal(calls.length, 1);
      assert.equal(path(calls[0]), `/api/v1/parcels/${id}`);
    });
  }

  test("parcel_lookup sends an address to /search/full", async () => {
    const calls = stubFetch((url) =>
      path(url) === "/api/v1/search/full" ? json({ results: [], total: 0, nextCursor: null }) : unexpected(url),
    );
    await parcelLookup.handler({ query: "2232 Wilmore Dr, Charlotte, NC 28203" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.searchParams.get("q"), "2232 Wilmore Dr, Charlotte, NC 28203");
  });
});

describe("defect 2 — parcel_compare never buys", () => {
  test("uses the free card (+ /risks) and never requests /report", async () => {
    const calls = stubFetch((url) => {
      const p = path(url);
      if (PAID.test(p)) return json(X402_BODY, 402);
      if (p.endsWith("/risks")) return json(RISKS);
      if (/^\/api\/v1\/parcels\/[^/]+$/.test(p)) return json({ ...PARCEL, parcel_id: p.split(":").pop() });
      return unexpected(url);
    });
    const res = await parcelCompare.handler({
      parcel_ids: ["37:119:12104406", "37:119:11906402"],
      criteria: [{ description: "highest assessed value" }],
    });
    assert.equal(res.isError, undefined, toolText(res));
    assert.equal(calls.filter((c) => PAID.test(path(c))).length, 0, "a paid endpoint was requested");
    for (const id of ["37:119:12104406", "37:119:11906402"]) {
      assert.ok(calls.some((c) => path(c) === `/api/v1/parcels/${id}`), `card not fetched for ${id}`);
    }
    const out = toolJSON(res);
    assert.equal(out.parcels.length, 2);
    assert.equal(out.parcels[0].ok, true);
    assert.equal(out.parcels[0].card.total_assessed_value, "19388200.00");
    assert.equal(out.parcels[0].risks.flood_zone, "X");
  });
});

describe("defect 3 — sales_history", () => {
  test("reads a bare-array /deeds response", async () => {
    stubFetch((url) => (path(url).endsWith("/deeds") ? json(DEEDS) : unexpected(url)));
    const out = toolJSON(await salesHistory.handler({ parcel_id: "37:119:12104406" }));
    assert.equal(out.event_count, 2);
    assert.equal(out.events.length, 2);
  });

  test("requests shape=envelope and reads the envelope", async () => {
    const calls = stubFetch((url) =>
      path(url).endsWith("/deeds")
        ? url.searchParams.get("shape") === "envelope"
          ? json({ data: DEEDS, status: "per_deed", known_deed_count: 2, known_deed_count_basis: "frozen_weld" })
          : json(DEEDS)
        : unexpected(url),
    );
    const out = toolJSON(await salesHistory.handler({ parcel_id: "37:119:12104406", since: "2010-01-01" }));
    assert.equal(calls[0].url.searchParams.get("shape"), "envelope");
    assert.equal(out.event_count, 1);
    assert.equal(out.status, "per_deed");
    assert.equal(out.known_deed_count, 2);
  });

  test("include_liens never fetches the paid /report", async () => {
    const calls = stubFetch((url) => {
      const p = path(url);
      if (PAID.test(p)) return json(X402_BODY, 402);
      if (p.endsWith("/deeds")) return json(DEEDS);
      return unexpected(url);
    });
    await salesHistory.handler({ parcel_id: "37:119:12104406", include_liens: true });
    assert.equal(calls.filter((c) => PAID.test(path(c))).length, 0, "a paid endpoint was requested");
  });
});

describe("defect 4 — permits_history", () => {
  test("reads a bare-array /permits response", async () => {
    stubFetch((url) => (path(url).endsWith("/permits") ? json(PERMITS) : unexpected(url)));
    const out = toolJSON(await permitsHistory.handler({ parcel_id: "37:119:12104406" }));
    assert.equal(out.permit_count, 2);
    assert.equal(out.permits.length, 2);
  });

  test("filters `types` on permit_type", async () => {
    stubFetch((url) =>
      path(url).endsWith("/permits")
        ? json({ data: PERMITS, permit_count: 2, permit_count_basis: "exact", truncated: false, row_cap: 100 })
        : unexpected(url),
    );
    const out = toolJSON(await permitsHistory.handler({ parcel_id: "37:119:12104406", types: ["building"] }));
    assert.equal(out.permits.length, 1);
    assert.equal(out.permits[0].permit_number, "P2");
  });
});

describe("defect 5 — valuation_estimate", () => {
  test("maps the real Parcel fields and accepts numeric strings", async () => {
    stubFetch((url) => (/^\/api\/v1\/parcels\/[^/]+$/.test(path(url)) ? json(PARCEL) : unexpected(url)));
    const out = toolJSON(await valuationEstimate.handler({ parcel_id: "37:119:12104406" }));
    assert.equal(out.total_assessed_value, 19388200);
    assert.equal(out.land_assessed_value, 4000000);
    assert.equal(out.improvement_assessed_value, 15388200);
    assert.equal(out.avm_value, 21000000);
    assert.equal(out.avm_confidence, "medium");
    assert.equal(out.avm_method, "assessed_ratio");
    assert.equal(out.last_sale_price, 12500000);
    assert.equal(out.last_sale_date, "2019-05-01");
    assert.equal(out.price_per_sqft, 250.5);
    assert.equal(out.market_value, null);
  });
});

describe("defect 6 — owner_pierce, hazard_score, parcel_search vs the spec", () => {
  test("owner_pierce resolves a ticker via owners/search {data,count} using owner_name_normalized", async () => {
    const calls = stubFetch((url) => {
      const p = path(url);
      if (p === "/api/v1/owners/search")
        return json({ data: [{ owner_name_normalized: "D R HORTON INC", property_count: 10 }], count: 1 });
      if (p === "/api/v1/owners/D R HORTON INC/portfolio")
        return json({ owner_name: "D R HORTON INC", properties: [], summary: { count: 0 }, match: {} });
      return unexpected(url);
    });
    const res = await ownerPierce.handler({ ticker: "DHI" });
    assert.equal(res.isError, undefined, toolText(res));
    assert.ok(calls.some((c) => path(c) === "/api/v1/owners/D R HORTON INC/portfolio"));
  });

  test("owner_pierce honours `state`", async () => {
    stubFetch((url) =>
      path(url) === "/api/v1/owners/MARKEY ENTERPRISES INC/portfolio"
        ? json({
            owner_name: "MARKEY ENTERPRISES INC",
            properties: [
              { parcel_id: "1", state: "NC", total_assessed_value: "100.00" },
              { parcel_id: "2", state: "SC", total_assessed_value: 50 },
            ],
            summary: { count: 2 },
            match: {},
          })
        : unexpected(url),
    );
    const out = toolJSON(await ownerPierce.handler({ name: "MARKEY ENTERPRISES INC", state: "nc" }));
    assert.deepEqual(out.properties.map((p: { parcel_id: string }) => p.parcel_id), ["1"]);
  });

  test("hazard_score `include: [flood]` maps to flood_zone / is_sfha / is_sfha_basis", async () => {
    stubFetch((url) => (path(url).endsWith("/risks") ? json(RISKS) : unexpected(url)));
    const out = toolJSON(await hazardScore.handler({ parcel_id: "37:119:12104406", include: ["flood", "crime"] }));
    assert.equal(out.flood_zone, "X");
    assert.equal(out.is_sfha, false);
    assert.equal(out.is_sfha_basis, "served");
    assert.equal(out.crime.score, 32);
    assert.equal(out.wildfire, undefined);
  });

  test("parcel_search forwards `cursor` as the spec's `after` keyset param", async () => {
    const calls = stubFetch((url) =>
      path(url) === "/api/v1/search/full" ? json({ results: [], total: 0, nextCursor: null }) : unexpected(url),
    );
    await parcelSearch.handler({ q: "charlotte", cursor: "abc123" });
    assert.equal(calls[0].url.searchParams.get("after"), "abc123");
  });
});

describe("errors reach the agent", () => {
  test("a Problem 404 is reported as `<status> <code>: <detail>`", async () => {
    stubFetch(() => problem(404, "not_found", "parcel 37:119:0 not found"));
    const res = await parcelLookup.handler({ query: "37:119:0" });
    assert.equal(res.isError, true);
    assert.match(toolText(res), /404 not_found: parcel 37:119:0 not found/);
  });
});
