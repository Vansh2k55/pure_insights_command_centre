import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { WebSocket } from "ws";
import { createApplication } from "../server/app.js";

test("expired sessions and incorrect WebSocket origins cannot access operational state", async (t) => {
  const s = createApplication({ dbPath: ":memory:" });
  t.after(() => s.close());
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  const login = await request(s.app)
    .post("/api/auth/login")
    .set("X-App-Request", "pure-insights")
    .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(200);
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  assert.ok(login.headers["set-cookie"][0].includes("HttpOnly"));
  assert.ok(login.headers["set-cookie"][0].includes("SameSite=Strict"));
  assert.ok(
    !JSON.stringify(s.db.prepare("SELECT * FROM sessions").all()).includes(
      cookie.split("=")[1],
    ),
  );
  const ws = new WebSocket(`ws://127.0.0.1:${s.server.address().port}/ws`, {
    headers: { Cookie: cookie },
    origin: "https://wrong.example",
  });
  await new Promise((resolve) => {
    ws.on("error", resolve);
    ws.on("unexpected-response", (_, r) => {
      assert.equal(r.statusCode, 401);
      ws.terminate();
    });
  });
  s.db.prepare("UPDATE sessions SET expires_at=?").run(Date.now() - 1);
  await request(s.app).get("/api/dashboard").set("Cookie", cookie).expect(401);
});
test("malformed JSON and extra telemetry fields produce client errors without state changes", async (t) => {
  const s = createApplication({ dbPath: ":memory:" });
  t.after(() => s.close());
  const a = request.agent(s.app);
  await a
    .post("/api/auth/login")
    .set("X-App-Request", "pure-insights")
    .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(200);
  const before = s
    .currentRows()
    .find((r) => r.report_id === "RPT_200").avg_load_time_sec;
  await a
    .post("/api/reports/RPT_200/telemetry")
    .set("X-App-Request", "pure-insights")
    .set("Content-Type", "application/json")
    .send("{broken")
    .expect(400);
  await a
    .post("/api/reports/RPT_200/telemetry")
    .set("X-App-Request", "pure-insights")
    .send({
      avg_load_time_sec: 22,
      last_refresh_status: "FAILED",
      role: "admin",
    })
    .expect(400);
  assert.equal(
    s.currentRows().find((r) => r.report_id === "RPT_200").avg_load_time_sec,
    before,
  );
});
