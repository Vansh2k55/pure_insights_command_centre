import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { WebSocket } from "ws";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../server/app.js";
const csrf = "pure-insights";
async function fixture(t, options = {}) {
  const s = createApplication({ dbPath: ":memory:", ...options });
  t.after(() => s.close());
  return s;
}
async function login(service, role) {
  const agent = request.agent(service.app);
  await agent
    .post("/api/auth/login")
    .set("X-App-Request", csrf)
    .send({ email: `${role}@pureinsights.demo`, password: "InsightsDemo2026!" })
    .expect(200);
  return agent;
}
const mutate = (a, path, body) =>
  a.post(path).set("X-App-Request", csrf).send(body);
test("authentication, CSRF, backend RBAC and role-specific serialization", async (t) => {
  const s = await fixture(t);
  await request(s.app).get("/api/dashboard").expect(401);
  await request(s.app)
    .post("/api/auth/login")
    .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(403);
  await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", csrf)
    .set("Origin", "https://attacker.example")
    .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(403);
  await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", csrf)
    .send({ email: "admin@pureinsights.demo", password: "wrong" })
    .expect(401);
  const viewer = await login(s, "viewer"),
    analyst = await login(s, "analyst");
  const reports = (await viewer.get("/api/reports?limit=100").expect(200)).body;
  assert.equal(reports.total, 100);
  assert.equal(reports.items.length, 100);
  assert.ok(!JSON.stringify(reports).includes("snowflake_credits_consumed"));
  assert.ok(!JSON.stringify(reports).includes("aws_hosting_cost_usd"));
  for (const path of ["/api/costs", "/api/quality", "/api/audit"])
    await viewer.get(path).expect(403);
  await mutate(viewer, "/api/reports/RPT_200/telemetry", {
    avg_load_time_sec: 22,
    last_refresh_status: "FAILED",
  }).expect(403);
  await mutate(analyst, "/api/scenario", { snapshot: 2 }).expect(403);
  await analyst.get("/api/costs").expect(200);
  await analyst.get("/api/audit").expect(403);
  await viewer.get("/api/reports?sort=total_cost_usd").expect(400);
  await viewer.post("/api/auth/logout").set("X-App-Request", csrf).expect(204);
  await viewer.get("/api/dashboard").expect(401);
});
test("strict latency threshold, deduplication, acknowledgement and recovery episodes", async (t) => {
  const s = await fixture(t);
  const admin = await login(s, "admin"),
    analyst = await login(s, "analyst");
  const send = (latency, status = "SUCCESS") =>
    mutate(admin, "/api/reports/RPT_200/telemetry", {
      avg_load_time_sec: latency,
      last_refresh_status: status,
    }).expect(200);
  await send(15);
  let active = (await admin.get("/api/alerts").expect(200)).body.items.filter(
    (x) => x.report_id === "RPT_200",
  );
  assert.equal(active.length, 0);
  await send(15.01, "FAILED");
  active = (await admin.get("/api/alerts")).body.items.filter(
    (x) => x.report_id === "RPT_200",
  );
  assert.equal(active.length, 2);
  const ids = active.map((a) => a.id);
  await send(22, "TIMED_OUT");
  assert.deepEqual(
    (await admin.get("/api/alerts")).body.items
      .filter((x) => x.report_id === "RPT_200")
      .map((a) => a.id),
    ids,
  );
  await mutate(analyst, `/api/alerts/${ids[0]}/ack`, {}).expect(200);
  await mutate(analyst, `/api/alerts/${ids[0]}/ack`, {}).expect(200);
  assert.equal(
    (await admin.get("/api/alerts")).body.items.filter(
      (x) => x.report_id === "RPT_200",
    ).length,
    2,
  );
  await send(2.5);
  assert.equal(
    (await admin.get("/api/alerts")).body.items.filter(
      (x) => x.report_id === "RPT_200",
    ).length,
    0,
  );
  await mutate(analyst, `/api/alerts/${ids[0]}/ack`, {}).expect(409);
  await send(20, "FAILED");
  assert.ok(
    (await admin.get("/api/alerts")).body.items
      .filter((x) => x.report_id === "RPT_200")
      .every((x) => !ids.includes(x.id)),
  );
});
test("invalid inputs, pagination, filtered export and owner correction", async (t) => {
  const s = await fixture(t);
  const admin = await login(s, "admin");
  for (const url of [
    "/api/reports?page=0",
    "/api/reports?limit=101",
    "/api/reports?sort=bad",
    "/api/alerts?state=bad",
  ])
    await admin.get(url).expect(400);
  await admin.get("/api/reports/missing").expect(404);
  await mutate(admin, "/api/scenario", { snapshot: 0 }).expect(400);
  await mutate(admin, "/api/scenario", { snapshot: 1.5 }).expect(400);
  await mutate(admin, "/api/reports/RPT_200/telemetry", {
    avg_load_time_sec: -1,
    last_refresh_status: "FAILED",
  }).expect(400);
  await admin
    .patch("/api/reports/RPT_203/owner")
    .set("X-App-Request", csrf)
    .send({ owner_email: "bad" })
    .expect(400);
  const r = (
    await admin
      .patch("/api/reports/RPT_203/owner")
      .set("X-App-Request", csrf)
      .send({ owner_email: " New.Owner@company.com " })
      .expect(200)
  ).body;
  assert.equal(r.owner_email, "new.owner@company.com");
  assert.ok(!r.flags.includes("ORPHANED_REPORT"));
  const filtered = (await admin.get("/api/reports?q=RPT_203").expect(200)).body;
  assert.equal(filtered.total, 1);
  const csv = await admin.get("/api/reports/export?q=RPT_203").expect(200);
  assert.equal(csv.text.split("\r\n").length, 2);
  await mutate(admin, "/api/scenario", { snapshot: 2 }).expect(200);
  assert.equal(s.currentRows().length, 100);
  await mutate(admin, "/api/scenario", { snapshot: 1 }).expect(200);
  assert.equal(
    (await admin.get("/api/reports/RPT_203")).body.owner_email,
    "new.owner@company.com",
  );
});
test("sessions, ownership overrides, telemetry and audit survive server restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-test-"));
  let s;
  try {
    s = createApplication({ dbPath: join(dir, "state.sqlite") });
    const admin = await login(s, "admin");
    await admin
      .patch("/api/reports/RPT_203/owner")
      .set("X-App-Request", csrf)
      .send({ owner_email: "persist@company.com" })
      .expect(200);
    await mutate(admin, "/api/reports/RPT_200/telemetry", {
      avg_load_time_sec: 1,
      last_refresh_status: "SUCCESS",
    }).expect(200);
    const cookie = (
      await request(s.app)
        .post("/api/auth/login")
        .set("X-App-Request", csrf)
        .send({
          email: "admin@pureinsights.demo",
          password: "InsightsDemo2026!",
        })
    ).headers["set-cookie"][0].split(";")[0];
    await s.close();
    s = createApplication({ dbPath: join(dir, "state.sqlite") });
    assert.equal(
      (
        await request(s.app)
          .get("/api/reports/RPT_203")
          .set("Cookie", cookie)
          .expect(200)
      ).body.owner_email,
      "persist@company.com",
    );
    assert.equal(
      (await request(s.app).get("/api/reports/RPT_200").set("Cookie", cookie))
        .body.avg_load_time_sec,
      1,
    );
    assert.ok(
      (
        await request(s.app).get("/api/audit").set("Cookie", cookie)
      ).body.items.some((a) => a.action === "ASSIGN_OWNER"),
    );
  } finally {
    if (s) await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("authenticated WebSocket delivers alerts, replays missed events and revokes logout", async (t) => {
  const s = await fixture(t);
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  const address = `ws://127.0.0.1:${s.server.address().port}/ws`;
  const result = await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", csrf)
    .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(200);
  const cookie = result.headers["set-cookie"][0].split(";")[0];
  const agent = request(s.app);
  const rejected = new WebSocket(address, { origin: "http://localhost:3000" });
  await new Promise((r) => {
    rejected.on("error", r);
    rejected.on("unexpected-response", (_, res) => {
      assert.equal(res.statusCode, 401);
      rejected.terminate();
    });
  });
  const connect = async (since) => {
    const ws = new WebSocket(address + `?since=${since}`, {
      headers: { Cookie: cookie },
      origin: "http://localhost:3000",
    });
    const messages = [];
    ws.on("message", (x) => messages.push(JSON.parse(x)));
    await new Promise((r, j) => {
      ws.once("open", r);
      ws.once("error", j);
    });
    return { ws, messages };
  };
  const { ws, messages } = await connect(0);
  const send = (body) =>
    agent
      .post("/api/reports/RPT_200/telemetry")
      .set("Cookie", cookie)
      .set("X-App-Request", csrf)
      .send(body)
      .expect(200);
  await send({ avg_load_time_sec: 2, last_refresh_status: "SUCCESS" });
  await send({ avg_load_time_sec: 22, last_refresh_status: "FAILED" });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(
    messages.filter(
      (e) => e.type === "alert.created" && e.payload.report_id === "RPT_200",
    ).length,
    2,
  );
  const last = messages.at(-1).id;
  ws.terminate();
  await send({ avg_load_time_sec: 1, last_refresh_status: "SUCCESS" });
  const replay = await connect(last);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    replay.messages.filter((e) => e.type === "alert.resolved").length,
    2,
  );
  const closed = new Promise((r) => replay.ws.once("close", r));
  await agent
    .post("/api/auth/logout")
    .set("Cookie", cookie)
    .set("X-App-Request", csrf)
    .expect(204);
  assert.equal(await closed, 1008);
});
test("non-demo mode disables simulated writes and omits demo credentials", async (t) => {
  const s = await fixture(t, { demo: false, password: "InsightsDemo2026!" });
  const admin = await login(s, "admin");
  const c = (await request(s.app).get("/api/config")).body;
  assert.equal(c.demo_password, null);
  assert.deepEqual(c.demo_accounts, []);
  await mutate(admin, "/api/reports/RPT_200/telemetry", {
    avg_load_time_sec: 22,
    last_refresh_status: "FAILED",
  }).expect(403);
  await mutate(admin, "/api/scenario", { snapshot: 2 }).expect(403);
});
