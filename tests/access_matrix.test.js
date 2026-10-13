import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { WebSocket } from "ws";
import { createApplication } from "../server/app.js";

const header = "pure-insights";
const roles = ["admin", "engineer", "analyst", "viewer", "owner"];

async function login(service, role) {
  const agent = request.agent(service.app);
  await agent
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: `${role}@pureinsights.demo`, password: "InsightsDemo2026!" })
    .expect(200);
  return agent;
}

test("role-by-route matrix enforces every protected route and owner object scope", async (t) => {
  const service = createApplication({ dbPath: ":memory:" });
  t.after(() => service.close());
  const agents = Object.fromEntries(
    await Promise.all(roles.map(async (role) => [role, await login(service, role)])),
  );
  const admin = agents.admin;
  await admin
    .patch("/api/reports/RPT_200/owner")
    .set("X-App-Request", header)
    .send({ owner_email: "owner@pureinsights.demo" })
    .expect(200);

  const expectGet = async (path, allowed) => {
    for (const role of roles)
      await agents[role]
        .get(`/api${path}`)
        .expect(allowed.includes(role) ? 200 : 403);
  };
  const everyone = roles;
  for (const path of [
    "/auth/me",
    "/dashboard",
    "/reports?limit=10",
    "/reports/export",
    "/reports/RPT_200",
    "/reports/RPT_200/history",
    "/reports/RPT_200/explanation",
    "/alerts",
    "/replay",
  ])
    await expectGet(path, everyone);
  for (const path of ["/quality", "/costs", "/costs/verification", "/costs/insights"])
    await expectGet(path, ["admin", "analyst"]);
  for (const path of ["/users", "/audit"])
    await expectGet(path, ["admin"]);

  await agents.owner.get("/api/reports/RPT_201").expect(404);
  await agents.owner.get("/api/reports/RPT_201/history").expect(404);
  await agents.owner.get("/api/reports/RPT_201/explanation").expect(404);

  for (const role of roles)
    await agents[role]
      .post("/api/reports/RPT_200/telemetry")
      .set("X-App-Request", header)
      .send({ avg_load_time_sec: 22, last_refresh_status: "FAILED" })
      .expect(["admin", "engineer"].includes(role) ? 200 : 403);
  const alert = (await admin.get("/api/alerts")).body.items.find(
    (item) => item.report_id === "RPT_200",
  );
  assert.ok(alert);
  for (const role of roles)
    await agents[role]
      .post(`/api/alerts/${alert.id}/ack`)
      .set("X-App-Request", header)
      .send({})
      .expect(role === "viewer" ? 403 : 200);
  for (const role of roles) {
    await agents[role]
      .patch("/api/reports/RPT_201/owner")
      .set("X-App-Request", header)
      .send({ owner_email: "matrix@company.com" })
      .expect(role === "admin" ? 200 : 403);
    await agents[role]
      .post("/api/scenario")
      .set("X-App-Request", header)
      .send({ snapshot: 1 })
      .expect(role === "admin" ? 200 : 403);
    await agents[role]
      .post("/api/replay")
      .set("X-App-Request", header)
      .send({ action: "pause" })
      .expect(role === "admin" ? 200 : 403);
  }
});

test("WebSocket limits one session to five streams and rejects client messages", async (t) => {
  const service = createApplication({ dbPath: ":memory:" });
  t.after(() => service.close());
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const loginResponse = await request(service.app)
    .post("/api/auth/login")
    .set("X-App-Request", header)
    .send({ email: "admin@pureinsights.demo", password: "InsightsDemo2026!" })
    .expect(200);
  const cookie = loginResponse.headers["set-cookie"][0].split(";")[0];
  const address = `ws://127.0.0.1:${service.server.address().port}/ws`;
  const streams = [];
  const connect = () => {
    const ws = new WebSocket(address, {
      origin: "http://localhost:3000",
      headers: { Cookie: cookie },
    });
    streams.push(ws);
    return new Promise((resolve, reject) => {
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
  };
  await Promise.all(Array.from({ length: 5 }, connect));
  const sixth = new WebSocket(address, {
    origin: "http://localhost:3000",
    headers: { Cookie: cookie },
  });
  await new Promise((resolve, reject) => {
    sixth.once("unexpected-response", (_, response) => {
      assert.equal(response.statusCode, 401);
      sixth.terminate();
      resolve();
    });
    sixth.once("open", () => reject(new Error("Sixth stream unexpectedly opened")));
    sixth.once("error", () => resolve());
  });
  const protectedStream = streams[0];
  const closed = new Promise((resolve) =>
    protectedStream.once("close", (code) => resolve(code)),
  );
  protectedStream.send("client messages are not accepted");
  assert.equal(await closed, 1008);
  for (const ws of streams.slice(1)) ws.terminate();
});
