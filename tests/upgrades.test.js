import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { WebSocket } from "ws";
import { createApplication } from "../server/app.js";
import { verifyCosts, costInsights } from "../server/intelligence.js";
import { loadDataset, summarize } from "../server/domain.js";
const password = "InsightsDemo2026!",
  header = "pure-insights";
async function setup(t) {
  const s = createApplication({ dbPath: ":memory:" });
  t.after(() => s.close());
  return s;
}
async function login(s, role) {
  const agent = request.agent(s.app);
  await agent
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: `${role}@pureinsights.demo`, password })
    .expect(200);
  return agent;
}
const post = (a, path, body) =>
  a
    .post("/api" + path)
    .set("X-App-Request", header)
    .send(body);
const owner = (a, id, email) =>
  a
    .patch(`/api/reports/${id}/owner`)
    .set("X-App-Request", header)
    .send({ owner_email: email });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sample = (a, id, l, status = "SUCCESS") =>
  post(a, `/reports/${id}/telemetry`, {
    avg_load_time_sec: l,
    last_refresh_status: status,
  }).expect(200);

test("independent SQL costs reconcile all twenty sets, non-default prices, gaps and unmatched tags", () => {
  const all = loadDataset(new URL("../data/reports.csv", import.meta.url));
  for (let i = 1; i <= 20; i++)
    for (const price of [0, 3, 4.5]) {
      const rows = all.filter((r) => r.observation === i),
        result = verifyCosts(rows, price),
        summary = summarize(rows, "analyst", price);
      assert.equal(result.passed, result.total, `Set ${i} price ${price}`);
      assert.ok(
        Math.abs(result.fixture.combined_usd - summary.known_total_cost_usd) <
          1e-6,
      );
      assert.equal(
        result.fixture.matched_views,
        summary.cost_denominator_views,
      );
    }
  const row = {
    report_id: "RPT_0",
    monthly_active_views: 0,
    snowflake_credits_consumed: 10,
    aws_hosting_cost_usd: 12,
    owner_email: null,
    query_count_last_30d: 0,
  };
  const result = verifyCosts([row], 3);
  assert.equal(result.passed, 8);
  assert.equal(result.fixture.cost_per_view_usd, null);
  assert.equal(result.fixture.combined_usd, 42);
  assert.equal(costInsights([row], 3).proxy[0].query_count_proxy_credits, null);
});

test("owner scope covers list, detail, history, assistant, export, metrics and alert acknowledgement", async (t) => {
  const s = await setup(t),
    admin = await login(s, "admin"),
    owned = await login(s, "owner");
  assert.equal((await owned.get("/api/reports")).body.total, 0);
  await owner(admin, "RPT_200", "owner@pureinsights.demo").expect(200);
  await sample(admin, "RPT_200", 22, "FAILED");
  await sample(admin, "RPT_201", 22, "FAILED");
  assert.equal((await owned.get("/api/reports")).body.total, 1);
  assert.equal((await owned.get("/api/dashboard")).body.summary.reports, 1);
  for (const suffix of ["", "/history", "/explanation"]) {
    const allowed = await owned
      .get("/api/reports/RPT_200" + suffix)
      .expect(200);
    assert.ok(
      !JSON.stringify(allowed.body).includes("snowflake_credits_consumed"),
    );
    await owned.get("/api/reports/RPT_201" + suffix).expect(404);
  }
  const csv = (await owned.get("/api/reports/export")).text;
  assert.ok(csv.includes("RPT_200"));
  assert.ok(!csv.includes("RPT_201"));
  assert.ok(!csv.includes("cost_usd"));
  const ownAlerts = (await owned.get("/api/alerts")).body.items;
  assert.equal(ownAlerts.length, 2);
  assert.ok(ownAlerts.every((a) => a.report_id === "RPT_200"));
  await post(owned, `/alerts/${ownAlerts[0].id}/ack`, {}).expect(200);
  const other = (await admin.get("/api/alerts")).body.items.find(
    (a) => a.report_id === "RPT_201",
  );
  await post(owned, `/alerts/${other.id}/ack`, {}).expect(404);
  for (const path of [
    "/costs",
    "/costs/verification",
    "/costs/insights",
    "/quality",
    "/audit",
    "/users",
  ])
    await owned.get("/api" + path).expect(403);
  await owner(admin, "RPT_200", "other@company.com").expect(200);
  await owned.get("/api/reports/RPT_200").expect(404);
});

test("engineer can operate but every cost surface remains redacted", async (t) => {
  const s = await setup(t),
    engineer = await login(s, "engineer");
  for (const path of [
    "/reports?limit=100",
    "/reports/RPT_200",
    "/reports/RPT_200/history",
    "/dashboard",
  ]) {
    const value = JSON.stringify(
      (await engineer.get("/api" + path).expect(200)).body,
    );
    assert.ok(!value.includes("snowflake_credits_consumed"));
    assert.ok(!value.includes("aws_hosting_cost_usd"));
    assert.ok(!value.includes("cost_per_view"));
  }
  await sample(engineer, "RPT_200", 45, "FAILED");
  await engineer.get("/api/costs").expect(403);
  await post(engineer, "/replay", { action: "start" }).expect(403);
});

test("severity changes reuse incident IDs, UNKNOWN does not establish refresh recovery", async (t) => {
  const s = await setup(t),
    admin = await login(s, "admin");
  await sample(admin, "RPT_200", 15);
  await sample(admin, "RPT_200", 20, "FAILED");
  const initial = (await admin.get("/api/alerts")).body.items.filter(
    (a) => a.report_id === "RPT_200",
  );
  await sample(admin, "RPT_200", 35, "UNKNOWN");
  const current = (await admin.get("/api/alerts")).body.items.filter(
    (a) => a.report_id === "RPT_200",
  );
  assert.equal(current.length, 3);
  assert.equal(
    current.find((a) => a.type === "LATENCY").id,
    initial.find((a) => a.type === "LATENCY").id,
  );
  assert.equal(current.find((a) => a.type === "LATENCY").severity, "critical");
  assert.ok(current.some((a) => a.type === "REFRESH"));
  assert.ok(
    s.db.prepare("SELECT * FROM events WHERE type='alert.updated'").all()
      .length,
  );
  await sample(admin, "RPT_200", 15, "SUCCESS");
  assert.equal(
    (await admin.get("/api/alerts")).body.items.filter(
      (a) => a.report_id === "RPT_200",
    ).length,
    0,
  );
});

test("replay start, pause, step, end and scenario reset preserve explicit ownership", async (t) => {
  const s = await setup(t),
    admin = await login(s, "admin");
  await owner(admin, "RPT_203", "owner@pureinsights.demo").expect(200);
  await post(admin, "/replay", { action: "start", interval_ms: 999 }).expect(
    400,
  );
  await post(admin, "/replay", { action: "step" }).expect(200);
  assert.equal((await admin.get("/api/dashboard")).body.snapshot, 2);
  await post(admin, "/replay", { action: "start", interval_ms: 1000 }).expect(
    200,
  );
  await sleep(1100);
  await post(admin, "/replay", { action: "pause" }).expect(200);
  assert.equal((await admin.get("/api/dashboard")).body.snapshot, 3);
  await post(admin, "/scenario", { snapshot: 19 }).expect(200);
  await post(admin, "/replay", { action: "start", interval_ms: 1000 }).expect(
    200,
  );
  await sleep(1100);
  let state = (await admin.get("/api/replay")).body;
  assert.equal(state.snapshot, 20);
  assert.equal(state.running, false);
  await post(admin, "/replay", { action: "step" }).expect(200);
  assert.equal((await admin.get("/api/replay")).body.snapshot, 20);
  assert.equal(
    (await admin.get("/api/reports/RPT_203")).body.owner_email,
    "owner@pureinsights.demo",
  );
});

test("access changes revoke established REST sessions and WebSocket streams immediately", async (t) => {
  const s = await setup(t),
    admin = await login(s, "admin");
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  const auth = await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: "analyst@pureinsights.demo", password })
    .expect(200);
  const cookie = auth.headers["set-cookie"][0].split(";")[0];
  const ws = new WebSocket(`ws://127.0.0.1:${s.server.address().port}/ws`, {
    origin: "http://localhost:3000",
    headers: { Cookie: cookie },
  });
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  const closed = new Promise((r) => ws.once("close", r));
  await admin
    .patch("/api/users/analyst%40pureinsights.demo")
    .set("X-App-Request", header)
    .send({ role: "viewer", active: true })
    .expect(200);
  assert.equal(await closed, 1008);
  await request(s.app).get("/api/costs").set("Cookie", cookie).expect(401);
  const viewer = await login(s, "analyst");
  await viewer.get("/api/costs").expect(403);
  await admin
    .patch("/api/users/viewer%40pureinsights.demo")
    .set("X-App-Request", header)
    .send({ role: "viewer", active: false })
    .expect(200);
  await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: "viewer@pureinsights.demo", password })
    .expect(401);
  await admin
    .patch("/api/users/admin%40pureinsights.demo")
    .set("X-App-Request", header)
    .send({ role: "viewer", active: true })
    .expect(409);
});

test("owner streams redact unrelated live and replay events, and revoke scope after reassignment", async (t) => {
  const s = await setup(t),
    admin = await login(s, "admin");
  await owner(admin, "RPT_200", "owner@pureinsights.demo").expect(200);
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  const auth = await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: "owner@pureinsights.demo", password })
    .expect(200);
  const cookie = auth.headers["set-cookie"][0].split(";")[0],
    messages = [];
  const ws = new WebSocket(
    `ws://127.0.0.1:${s.server.address().port}/ws?since=0`,
    { origin: "http://localhost:3000", headers: { Cookie: cookie } },
  );
  ws.on("message", (b) => messages.push(JSON.parse(b)));
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  await sample(admin, "RPT_201", 35, "FAILED");
  await sample(admin, "RPT_200", 35, "FAILED");
  await sleep(30);
  assert.ok(
    messages.some(
      (e) =>
        e.type === "telemetry.updated" && e.payload.report_id === "RPT_200",
    ),
  );
  assert.ok(!JSON.stringify(messages).includes("RPT_201"));
  await owner(admin, "RPT_200", "other@company.com").expect(200);
  messages.length = 0;
  await sample(admin, "RPT_200", 2);
  await sleep(30);
  assert.ok(!JSON.stringify(messages).includes("RPT_200"));
  ws.terminate();
});

test("restart pauses active replay while preserving assignment and incident identity", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pi-v2-"));
  let s;
  try {
    const path = join(dir, "state.sqlite");
    s = createApplication({ dbPath: path });
    let admin = await login(s, "admin");
    await owner(admin, "RPT_203", "owner@pureinsights.demo").expect(200);
    await sample(admin, "RPT_200", 35, "FAILED");
    const incidents = s.db
      .prepare(
        "SELECT id,seen_count FROM alerts WHERE report_id='RPT_200' AND resolved_at IS NULL ORDER BY id",
      )
      .all();
    await post(admin, "/replay", {
      action: "start",
      interval_ms: 30000,
    }).expect(200);
    await s.close();
    s = createApplication({ dbPath: path });
    admin = await login(s, "admin");
    assert.equal((await admin.get("/api/replay")).body.running, false);
    assert.equal(
      (await admin.get("/api/reports/RPT_203")).body.owner_email,
      "owner@pureinsights.demo",
    );
    assert.deepEqual(
      s.db
        .prepare(
          "SELECT id,seen_count FROM alerts WHERE report_id='RPT_200' AND resolved_at IS NULL ORDER BY id",
        )
        .all(),
      incidents,
    );
  } finally {
    if (s) await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("event retention gaps and future cursors require resynchronization without stale replay", async (t) => {
  const s = await setup(t),
    admin = await login(s, "admin");
  for (let i = 0; i < 19; i++)
    await post(admin, "/replay", { action: "step" }).expect(200);
  const range = s.db
    .prepare(
      "SELECT MIN(id) AS oldest,MAX(id) AS newest,COUNT(*) AS n FROM events",
    )
    .get();
  assert.equal(range.n, 1000);
  assert.ok(range.oldest > 1);
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  const auth = await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: "admin@pureinsights.demo", password })
    .expect(200);
  const cookie = auth.headers["set-cookie"][0].split(";")[0];
  for (const since of [0, range.newest + 1]) {
    const messages = [],
      ws = new WebSocket(
        `ws://127.0.0.1:${s.server.address().port}/ws?since=${since}`,
        { origin: "http://localhost:3000", headers: { Cookie: cookie } },
      );
    ws.on("message", (b) => messages.push(JSON.parse(b)));
    await new Promise((r, j) => {
      ws.once("open", r);
      ws.once("error", j);
    });
    await sleep(25);
    assert.ok(messages.some((e) => e.type === "resync.required"));
    assert.ok(!messages.some((e) => e.id));
    ws.terminate();
  }
});
