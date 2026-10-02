import { test } from "node:test";
import assert from "node:assert/strict";

import { toNumber } from "../src/tools/_types.js";
import { canonicalId } from "../src/tools/parcel-search.js";
import { parseRetryAfter, isAllowedPath, parcelPath } from "../src/client.js";
import { hazardScore } from "../src/tools/hazard-score.js";
import { parcelCompare } from "../src/tools/parcel-compare.js";
import { stubFetch, json, path, unexpected, toolText, PARCEL, X402_BODY } from "./helpers.js";

process.env.PROPRAVEN_API_KEY = "pz_test_key";
delete process.env.PROPRAVEN_BASE_URL;

test("toNumber accepts numbers and numeric strings, rejects junk", () => {
  assert.equal(toNumber(5), 5);
  assert.equal(toNumber("19388200.00"), 19388200);
  assert.equal(toNumber("1,250"), 1250);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber("n/a"), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(Number.NaN), null);
});

test("canonicalId builds state:county:parcel from 3- or 5-digit county codes", () => {
  assert.equal(canonicalId({ state_fips: "37", county_fips: "119", parcel_id: "12104406" }), "37:119:12104406");
  assert.equal(canonicalId({ state_fips: "37", county_fips: "37119", parcel_id: "12104406" }), "37:119:12104406");
  assert.equal(canonicalId({ state_fips: "37", county_fips: "119", parcel_id: "37:119:12104406" }), "37:119:12104406");
  assert.equal(canonicalId({ state_fips: "37", parcel_id: "1" }), null);
});

test("parseRetryAfter handles seconds and HTTP dates", () => {
  assert.equal(parseRetryAfter("3"), 3000);
  assert.equal(parseRetryAfter(null), null);
  const now = Date.parse("2026-10-02T00:00:00Z");
  assert.equal(parseRetryAfter("Fri, 02 Oct 2026 00:00:05 GMT", now), 5000);
  assert.equal(parseRetryAfter("garbage"), null);
});

test("allowlist: free reads pass, paid and reserved paths fail", () => {
  for (const ok of [
    parcelPath("37:119:12104406"),
    parcelPath("37:119:12104406", "risks"),
    parcelPath("37:119:12104406", "deeds"),
    parcelPath("37:119:12104406", "permits"),
    "/api/v1/search/full",
    "/api/v1/owners/search",
    "/api/v1/owners/MARKEY%20ENTERPRISES%20INC/portfolio",
  ])
    assert.ok(isAllowedPath(ok), ok);
  for (const bad of [
    "/api/v1/parcels/37:119:1/report",
    "/api/v1/parcels/37:119:1/comp-pack",
    "/api/v1/parcels/37:119:1/risk-score",
    "/api/v1/parcels/37:119:1/comps",
    "/api/v1/parcels/37:119:1/occupants",
    "/api/v1/parcels/poi",
    "/api/v1/parcels/batch",
    "/api/v1/owners/X/report",
    "/api/v1/storefront/credits/topup",
    "/api/v1/verify",
  ])
    assert.ok(!isAllowedPath(bad), bad);
  // An id cannot smuggle a path segment.
  assert.ok(!isAllowedPath(new URL("https://propraven.com" + parcelPath("x/report")).pathname.replace(/%2F/g, "/")));
  assert.ok(isAllowedPath(new URL("https://propraven.com" + parcelPath("x/report")).pathname));
});

test("hazard_score rejects an unknown include token", async () => {
  stubFetch(unexpected);
  const res = await hazardScore.handler({ parcel_id: "37:119:12104406", include: ["volcano"] });
  assert.equal(res.isError, true);
  assert.match(toolText(res), /unknown include token/);
});

test("parcel_compare include_risks=false skips /risks; a per-parcel x402 402 is reported, not paid", async () => {
  const calls = stubFetch((url) => {
    const p = path(url);
    if (p === "/api/v1/parcels/37:119:12104406") return json(PARCEL);
    if (p === "/api/v1/parcels/37:119:11906402") return json(X402_BODY, 402);
    return unexpected(url);
  });
  const res = await parcelCompare.handler({
    parcel_ids: ["37:119:12104406", "37:119:11906402"],
    criteria: [{ description: "value" }],
    include_risks: false,
  });
  assert.equal(calls.length, 2);
  const text = toolText(res);
  assert.match(text, /payment required — this tool never pays/);
  assert.doesNotMatch(text, /"risks"/);
});
