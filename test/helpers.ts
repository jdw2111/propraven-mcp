/**
 * Test helpers: a recording stub for globalThis.fetch so tool handlers run
 * end-to-end against canned PropRaven API responses (no network).
 */
import { readFileSync } from "node:fs";

export const PKG_VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
}

export type Route = (url: URL, call: RecordedCall) => Response | Promise<Response>;

/** Replace globalThis.fetch with `route`; every request is recorded in the returned array. */
export function stubFetch(route: Route): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const call = { url, method: init?.method ?? "GET", headers };
    calls.push(call);
    return route(url, call);
  }) as typeof fetch;
  return calls;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function problem(
  status: number,
  code: string,
  detail: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ type: `https://api.propraven.com/errors/${code}`, title: "Error", status, detail, code }),
    { status, headers: { "content-type": "application/problem+json", ...headers } },
  );
}

/** A route that fails loudly for anything a test did not expect. */
export function unexpected(url: URL): Response {
  return problem(599, "unexpected_test_request", `test did not expect ${url.pathname}${url.search}`);
}

/** Decoded path (so `37%3A119%3A1` and `37:119:1` compare equal). */
export function path(call: RecordedCall | URL): string {
  const u = call instanceof URL ? call : call.url;
  return decodeURIComponent(u.pathname);
}

/** Parse the JSON payload out of a tool's text result (fenced ```json block or bare JSON). */
export function toolJSON(result: { content: Array<{ type: string; text: string }>; isError?: boolean }): any {
  const text = result.content[0]?.text ?? "";
  const m = text.match(/```json\n([\s\S]*)\n```/);
  return JSON.parse(m ? m[1] : text);
}

export function toolText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

/** A Parcel card as served before API 1.2.0 (numeric strings) mixed with 1.2.0 numbers. */
export const PARCEL = {
  id: "0b7f2c4e-1111-4222-8333-944455556666",
  county_fips: "119",
  state_fips: "37",
  parcel_id: "12104406",
  address: "100 N TRYON ST",
  city: "CHARLOTTE",
  owner_name: "MARKEY ENTERPRISES INC",
  total_assessed_value: "19388200.00",
  land_assessed_value: "4000000.00",
  improvement_assessed_value: 15388200,
  market_value: null,
  avm_value: "21000000",
  avm_confidence: "medium",
  avm_method: "assessed_ratio",
  last_sale_price: "12500000.00",
  last_sale_date: "2019-05-01",
  price_per_sqft: 250.5,
};

export const RISKS = {
  flood_zone: "X",
  is_sfha: false,
  is_sfha_basis: "served",
  seismic: { ss: 0.2, s1: 0.1, sds: null, sd1: null, sdc: "B", pga_g: null, nri_earthquake_rating: null },
  windstorm: { hurricane_rating: null, tornado_rating: "low" },
  wildfire: { county_name: "Mecklenburg", risk_national_rank: 10, bp_national_rank: 5, risk_state_rank: 1, bp_state_rank: 1 },
  air_quality: { year: 2024, median_aqi: 42, max_aqi: 90, good_days: 300, moderate_days: 60, unhealthy_days: 5 },
  crime: { score: 32, tier: 3, tier_label: "moderate", trend: "stable", violent_crime_rate: 1, property_crime_rate: 2 },
  withhold_gate: { applied: false, suppressed: [], reason: null, reasons: {}, withheld_on: null, note: null },
  identity_gate: { applied: false, suppressed: [], reason: null, join_key_basis: "state_county_parcel_id" },
};

export const DEEDS = [
  { document_number: "D1", recording_date: "2019-05-02", sale_date: "2019-05-01", sale_price: "12500000.00", grantor_name: "A", grantee_name: "MARKEY ENTERPRISES INC", deed_type: "WD" },
  { document_number: "D0", recording_date: "2008-01-10", sale_date: "2008-01-09", sale_price: 3000000, grantor_name: "B", grantee_name: "A", deed_type: "WD" },
];

export const PERMITS = [
  { permit_number: "P2", permit_type: "Building", permit_status: "Issued", issued_date: "2024-03-01", estimated_cost: "150000.00" },
  { permit_number: "P1", permit_type: "Electrical", permit_status: "Final", issued_date: "2021-06-01", estimated_cost: 2000 },
];

/** An x402 Payment Required body (what a paid endpoint answers without payment). */
export const X402_BODY = {
  x402Version: 1,
  error: "X-PAYMENT header is required",
  accepts: [{ scheme: "exact", network: "base", maxAmountRequired: "5000000", resource: "https://propraven.com/api/v1/parcels/x/report" }],
};
