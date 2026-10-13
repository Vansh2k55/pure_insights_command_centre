import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApplication } from "../server/app.js";
import { costs, publicReport, summarize } from "../server/domain.js";
import { costInsights, explainReport } from "../server/intelligence.js";

const header = "pure-insights";
const password = "InsightsDemo2026!";

async function service(t) {
  const instance = createApplication({ dbPath: ":memory:" });
  t.after(() => instance.close());
  return instance;
}

async function login(instance, role) {
  const agent = request.agent(instance.app);
  await agent
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: `${role}@pureinsights.demo`, password })
    .expect(200);
  return agent;
}

const post = (agent, path, body) =>
  agent.post(`/api${path}`).set("X-App-Request", header).send(body);

test("role projections are immutable and financial redaction cannot alter stored source evidence", async (t) => {
  const instance = await service(t);
  const source = instance.currentRows().find((row) => row.report_id === "RPT_200");
  const flagsBefore = [...source.flags];
  const viewer = publicReport(source, "viewer", 3);
  const analyst = publicReport(source, "analyst", 3);
  viewer.flags.push("CLIENT_ONLY_FLAG");
  assert.deepEqual(source.flags, flagsBefore);
  assert.ok(!("snowflake_credits_consumed" in viewer));
  assert.ok("snowflake_credits_consumed" in analyst);
  assert.equal(source.snowflake_credits_consumed, analyst.snowflake_credits_consumed);
});

test("cost sensitivity preserves invalid-value nulls and uses a matching report population", () => {
  const valid = {
    report_id: "VALID",
    owner_email: "owner@example.com",
    monthly_active_views: 10,
    snowflake_credits_consumed: 4,
    aws_hosting_cost_usd: 8,
    query_count_last_30d: 2,
    flags: [],
  };
  const invalid = {
    ...valid,
    report_id: "INVALID",
    monthly_active_views: 10_000,
    snowflake_credits_consumed: null,
    query_count_last_30d: 0,
  };
  const zeroViews = { ...valid, report_id: "ZERO", monthly_active_views: 0 };
  assert.equal(costs(invalid, 3).total_cost_usd, null);
  assert.equal(costs(zeroViews, 3).cost_per_view_usd, null);
  const summary = summarize([valid, invalid, zeroViews], "analyst", 3);
  assert.equal(summary.complete_cost_reports, 2);
  assert.equal(summary.cost_denominator_views, 10);
  assert.equal(summary.portfolio_cost_per_view_usd, 4);
  const insights = costInsights([valid, invalid, zeroViews], 3);
  assert.equal(insights.proxy.find((row) => row.report_id === "INVALID").query_count_proxy_credits, 0);
  assert.match(insights.proxy_note, /not billed attribution/i);
});

test("deterministic evidence assistant returns source-grounded findings without causal claims", async (t) => {
  const instance = await service(t);
  const row = instance.currentRows().find((item) => item.report_id === "RPT_200");
  const explanation = explainReport({
    ...row,
    avg_load_time_sec: 31,
    last_refresh_status: "FAILED",
    owner_email: null,
  });
  assert.equal(explanation.engine, "Deterministic evidence assistant");
  assert.equal(explanation.report_id, "RPT_200");
  assert.ok(explanation.evidence.every((item) => item.source_row === row.source_row));
  assert.deepEqual(
    explanation.findings.map((item) => item.level),
    ["critical", "critical", "warning"],
  );
  assert.match(explanation.limitation, /No model call or causal diagnosis/);
});

test("cost API exposes SQL-fixture boundaries while denying financial endpoints to viewers", async (t) => {
  const instance = await service(t);
  const analyst = await login(instance, "analyst");
  const viewer = await login(instance, "viewer");
  const verification = (await analyst.get("/api/costs/verification").expect(200)).body;
  assert.equal(verification.passed, 8);
  assert.equal(verification.total, 8);
  assert.ok(verification.checks.every((check) => check.status === "PASS"));
  assert.match(verification.scope, /native Snowflake execution is not claimed/i);
  const insights = (await analyst.get("/api/costs/insights").expect(200)).body;
  assert.match(insights.proxy_note, /hypothetical sensitivity model/i);
  await viewer.get("/api/costs").expect(403);
  await viewer.get("/api/costs/verification").expect(403);
  await viewer.get("/api/costs/insights").expect(403);
});

test("every source scenario retains its own API cost verification result", async (t) => {
  const instance = await service(t);
  const admin = await login(instance, "admin");
  for (let snapshot = 1; snapshot <= 20; snapshot += 1) {
    await post(admin, "/scenario", { snapshot }).expect(200);
    const dashboard = (await admin.get("/api/dashboard").expect(200)).body;
    const verification = (await admin.get("/api/costs/verification").expect(200)).body;
    assert.equal(dashboard.snapshot, snapshot);
    assert.equal(dashboard.summary.reports, 100);
    assert.equal(verification.passed, verification.total, `scenario ${snapshot}`);
    assert.equal(verification.total, 8);
  }
});
