import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { WebSocket } from "ws";
import { createApplication } from "../server/app.js";

test("local hostname aliases work for login and WebSocket without trusting other ports or hosts", async (t) => {
  const s = createApplication({ dbPath: ":memory:" });
  t.after(() => s.close());
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  for (const origin of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ]) {
    const response = await request(s.app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .set("X-App-Request", "pure-insights")
      .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
      .expect(200);
    const cookie = response.headers["set-cookie"][0].split(";")[0];
    const ws = new WebSocket(`ws://127.0.0.1:${s.server.address().port}/ws`, {
      origin,
      headers: { Cookie: cookie },
    });
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    ws.terminate();
  }
  for (const origin of [
    "http://localhost:5173",
    "https://localhost:3000",
    "http://localhost.evil.example:3000",
    "http://192.168.1.2:3000",
  ]) {
    const response = await request(s.app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .set("X-App-Request", "pure-insights")
      .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
      .expect(403);
    assert.match(response.body.error, /Open http:\/\/localhost:3000/);
  }
});

test("development aliases use only the configured development port", async (t) => {
  const s = createApplication({
    dbPath: ":memory:",
    origin: "http://localhost:5173",
  });
  t.after(() => s.close());
  await request(s.app)
    .post("/api/auth/login")
    .set("Origin", "http://127.0.0.1:5173")
    .set("X-App-Request", "pure-insights")
    .send({ email: "viewer@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(200);
  await request(s.app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:3000")
    .set("X-App-Request", "pure-insights")
    .send({ email: "viewer@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(403);
});

test("a deployed non-loopback origin does not gain loopback aliases", async (t) => {
  const s = createApplication({
    dbPath: ":memory:",
    origin: "https://insights.example",
  });
  t.after(() => s.close());
  await request(s.app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:3000")
    .set("X-App-Request", "pure-insights")
    .send({ email: "viewer@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(403);
});
