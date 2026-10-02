import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { PropRavenClient } from "../src/client.js";
import { stubFetch, json, problem, path, PKG_VERSION, X402_BODY } from "./helpers.js";

const client = () => new PropRavenClient({ apiKey: "pz_test_key" });

describe("defect 7 — client", () => {
  test("default base URL is https://propraven.com", async () => {
    const calls = stubFetch(() => json({}));
    await client().get("/api/v1/parcels/37:119:12104406");
    assert.equal(calls[0].url.origin, "https://propraven.com");
  });

  test("PROPRAVEN_BASE_URL-style override is honoured", async () => {
    const calls = stubFetch(() => json({}));
    await new PropRavenClient({ apiKey: "k", baseURL: "http://127.0.0.1:9999/" }).get("/api/v1/search/full", { q: "ab" });
    assert.equal(calls[0].url.origin, "http://127.0.0.1:9999");
  });

  test("User-Agent is @propraven/mcp/<package.json version>", async () => {
    const calls = stubFetch(() => json({}));
    await client().get("/api/v1/parcels/37:119:12104406");
    assert.equal(calls[0].headers["user-agent"], `@propraven/mcp/${PKG_VERSION}`);
  });

  test("a Problem body becomes `<status> <code>: <detail>`", async () => {
    stubFetch(() => problem(400, "invalid_parameter", "limit: must be >= 1"));
    await assert.rejects(client().get("/api/v1/search/full", { q: "ab", limit: 0 }), (e: Error) => {
      assert.match(e.message, /^400 invalid_parameter: limit: must be >= 1/);
      return true;
    });
  });

  test("an x402 402 says payment required and that the tool never pays", async () => {
    stubFetch(() => json(X402_BODY, 402));
    await assert.rejects(client().get("/api/v1/parcels/37:119:12104406"), (e: Error) => {
      assert.match(e.message, /payment required — this tool never pays/);
      return true;
    });
  });

  test("retries once on 429, honouring Retry-After ≤ 10 s", async () => {
    let n = 0;
    const calls = stubFetch(() => (++n === 1 ? problem(429, "rate_limit_exceeded", "slow down", { "retry-after": "0" }) : json({ ok: 1 })));
    const out = await client().get<{ ok: number }>("/api/v1/parcels/37:119:12104406");
    assert.equal(out.ok, 1);
    assert.equal(calls.length, 2);
  });

  test("retries a 503 at most once", async () => {
    const calls = stubFetch(() => problem(503, "service_unavailable", "down", { "retry-after": "0" }));
    await assert.rejects(client().get("/api/v1/parcels/37:119:12104406"), /503 service_unavailable: down/);
    assert.equal(calls.length, 2);
  });

  test("does not wait when Retry-After exceeds 10 s", async () => {
    const calls = stubFetch(() => problem(429, "rate_limit_exceeded", "slow down", { "retry-after": "60" }));
    const t0 = Date.now();
    await assert.rejects(client().get("/api/v1/parcels/37:119:12104406"), /429 rate_limit_exceeded/);
    assert.equal(calls.length, 1);
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe("defects 2/3 — no tool can reach a paid endpoint", () => {
  for (const p of [
    "/api/v1/parcels/37:119:12104406/report",
    "/api/v1/parcels/37:119:12104406/comp-pack",
    "/api/v1/parcels/37:119:12104406/risk-score",
    "/api/v1/owners/MARKEY/report",
    "/api/v1/leads/find",
  ]) {
    test(`client refuses ${p} without sending a request`, async () => {
      const calls = stubFetch(() => json(X402_BODY, 402));
      await assert.rejects(client().get(p));
      assert.equal(calls.length, 0, `request sent to ${path(calls[0]?.url ?? new URL("http://x"))}`);
    });
  }

  test("never sends a payment header", async () => {
    const calls = stubFetch(() => json({}));
    await client().get("/api/v1/parcels/37:119:12104406");
    assert.equal(calls[0].headers["x-payment"], undefined);
    assert.equal(calls[0].method, "GET");
  });
});
