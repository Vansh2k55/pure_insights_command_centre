import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadDataset,
  datasetAudit,
  publicReport,
  summarize,
  validateTelemetry,
  csvExport,
  ROLES,
} from "./domain.js";
import { verifyCosts, costInsights, explainReport } from "./intelligence.js";
import {
  openStore,
  setting,
  setSetting,
  tokenHash,
  checkPassword,
} from "./store.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const now = () => new Date().toISOString();
const cookieToken = (req) => {
  const match = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("pi_session="));
  return match?.slice(11);
};
export function createApplication(config = {}) {
  const demo = config.demo ?? process.env.DEMO_MODE !== "false";
  const password =
    config.password ?? process.env.DEMO_PASSWORD ?? "InsightsDemo2026!";
  if (!demo && !config.password && !process.env.DEMO_PASSWORD)
    throw new Error(
      "Non-demo mode requires DEMO_PASSWORD to provision initial accounts",
    );
  const price = config.price ?? Number(process.env.CREDIT_PRICE_USD ?? 3);
  if (!Number.isFinite(price) || price < 0)
    throw new Error("CREDIT_PRICE_USD must be finite and nonnegative");
  const origin =
    config.origin ?? process.env.APP_ORIGIN ?? "http://localhost:3000";
  const configuredOrigin = new URL(origin);
  if (
    !["http:", "https:"].includes(configuredOrigin.protocol) ||
    configuredOrigin.origin !== origin
  )
    throw new Error(
      "APP_ORIGIN must be an HTTP(S) origin without a path or trailing slash",
    );
  const allowedOrigins = new Set([origin]);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
  if (loopbackHosts.includes(configuredOrigin.hostname)) {
    for (const hostname of loopbackHosts) {
      const alias = new URL(origin);
      alias.hostname = hostname;
      allowedOrigins.add(alias.origin);
    }
  }
  const secure = config.secure ?? process.env.COOKIE_SECURE === "true";
  const rows = loadDataset(config.dataset ?? resolve(root, "data/reports.csv"));
  const audit = datasetAudit(rows);
  const db = openStore(
    config.dbPath ??
      process.env.DB_PATH ??
      resolve(root, "runtime/insights.sqlite"),
    password,
  );
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "connect-src": [
            "'self'",
            ...Array.from(allowedOrigins, (value) =>
              value.replace(/^http/, "ws"),
            ),
          ],
        },
      },
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.get("X-App-Request") !== "pure-insights" ||
        (req.get("Origin") && !allowedOrigins.has(req.get("Origin"))))
    )
      return res.status(403).json({
        error:
          req.get("X-App-Request") !== "pure-insights"
            ? "Required request-protection header is missing. Reload the application."
            : `Browser address does not match server configuration. Open ${origin} or configure APP_ORIGIN and restart the server.`,
      });
    next();
  });
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const userFor = (req) => {
    const token = cookieToken(req);
    if (!token) return null;
    const session = db
      .prepare(
        "SELECT u.email,u.role,s.expires_at FROM sessions s JOIN users u ON u.email=s.email WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
      )
      .get(tokenHash(token), Date.now());
    return session ? { ...session, tokenHash: tokenHash(token) } : null;
  };
  function auth(req, res, next) {
    req.user = userFor(req);
    if (!req.user)
      return res.status(401).json({ error: "Authentication required" });
    next();
  }
  const allow =
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.user.role)
        ? next()
        : res.status(403).json({
            error: "This role is not permitted to perform this action",
          });
  const recordAudit = (actor, action, target, details) =>
    db
      .prepare(
        "INSERT INTO audit(actor,action,target,details,created_at) VALUES(?,?,?,?,?)",
      )
      .run(actor, action, target, JSON.stringify(details), now());
  let eventQueue = [];
  function publish(type, payload) {
    const at = now();
    const result = db
      .prepare("INSERT INTO events(type,payload,created_at) VALUES(?,?,?)")
      .run(type, JSON.stringify(payload), at);
    const event = {
      id: Number(result.lastInsertRowid),
      type,
      payload,
      created_at: at,
    };
    eventQueue.push(event);
    db.prepare("DELETE FROM events WHERE id <= ?").run(event.id - 1000);
    return event;
  }
  function streamUser(ws) {
    return db
      .prepare(
        "SELECT u.email,u.role FROM sessions s JOIN users u ON s.email=u.email WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
      )
      .get(ws.sessionHash, Date.now());
  }
  const scopedRows = (user) =>
    currentRows().filter(
      (r) => user.role !== "owner" || r.owner_email === user.email,
    );
  function projectedEvent(event, user) {
    if (user.role === "owner") {
      if (event.type === "ownership.updated")
        return {
          id: event.id,
          type: "scope.changed",
          payload: {},
          created_at: event.created_at,
        };
      if (
        event.payload.report_id &&
        !scopedRows(user).some((r) => r.report_id === event.payload.report_id)
      )
        return {
          id: event.id,
          type: "cursor",
          payload: {},
          created_at: event.created_at,
        };
      if (event.type === "users.changed")
        return {
          id: event.id,
          type: "cursor",
          payload: {},
          created_at: event.created_at,
        };
    }
    return event;
  }
  function sendEvent(ws, event) {
    const user = streamUser(ws);
    if (!user) {
      ws.close(1008, "Session ended");
      return;
    }
    if (user.role !== ws.role) {
      ws.close(1008, "Permissions changed; sign in again");
      return;
    }
    if (ws.bufferedAmount > 1024 * 1024) {
      ws.terminate();
      return;
    }
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify(projectedEvent(event, user)));
  }
  function flush() {
    for (const event of eventQueue)
      for (const ws of wss.clients) sendEvent(ws, event);
    eventQueue = [];
  }
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      flush();
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      eventQueue = [];
      throw e;
    }
  }
  const snapshot = () => Number(setting(db, "snapshot", "1"));
  function currentRows() {
    const overrides = new Map(
      db
        .prepare("SELECT * FROM overrides")
        .all()
        .map((x) => [x.report_id, JSON.parse(x.body)]),
    );
    const assignments = new Map(
      db
        .prepare("SELECT * FROM assignments")
        .all()
        .map((x) => [x.report_id, x]),
    );
    return rows
      .filter((r) => r.observation === snapshot())
      .map((r) => {
        const o = overrides.get(r.report_id) || {};
        const copy = {
          ...r,
          ...o,
          flags: [...r.flags],
          telemetry_source:
            o.avg_load_time_sec !== undefined
              ? "SIMULATED_LIVE"
              : "SOURCE_SNAPSHOT",
        };
        const assignment = assignments.get(r.report_id);
        if (assignment) {
          copy.source_owner_email = r.owner_email;
          copy.owner_email = assignment.owner_email;
          copy.ownership_source = "OPERATIONAL_ASSIGNMENT";
          copy.assigned_by = assignment.assigned_by;
          copy.assigned_at = assignment.assigned_at;
        }
        if (assignment || Object.hasOwn(o, "owner_email"))
          copy.flags = copy.flags.filter((f) => f !== "ORPHANED_REPORT");
        if (o.last_refresh_status !== undefined) {
          copy.flags = copy.flags.filter((f) => f !== "UNKNOWN_REFRESH_STATUS");
          if (o.last_refresh_status === "UNKNOWN")
            copy.flags.push("UNKNOWN_REFRESH_STATUS");
        }
        return copy;
      });
  }
  function reconcile(row, source, emit = true, observed = true) {
    const conditions = [
      [
        "LATENCY",
        row.avg_load_time_sec > 15,
        `Load latency ${row.avg_load_time_sec}s exceeds 15s`,
        row.avg_load_time_sec > 30 ? "critical" : "warning",
        row.avg_load_time_sec !== null && row.avg_load_time_sec <= 15,
      ],
      [
        "REFRESH",
        ["FAILED", "TIMED_OUT"].includes(row.last_refresh_status),
        `Refresh ${row.last_refresh_status.toLowerCase()}`,
        "critical",
        row.last_refresh_status === "SUCCESS",
      ],
      [
        "DATA_GAP",
        row.last_refresh_status === "UNKNOWN",
        "Refresh outcome is unknown",
        "warning",
        row.last_refresh_status !== "UNKNOWN",
      ],
    ];
    for (const [type, active, message, severity, recovered] of conditions) {
      const existing = db
        .prepare(
          "SELECT * FROM alerts WHERE report_id=? AND type=? AND resolved_at IS NULL",
        )
        .get(row.report_id, type);
      const at = now();
      if (active && !existing) {
        const result = db
          .prepare(
            "INSERT INTO alerts(report_id,type,message,source,created_at,severity,last_seen_at) VALUES(?,?,?,?,?,?,?)",
          )
          .run(row.report_id, type, message, source, at, severity, at);
        if (emit)
          publish("alert.created", {
            id: Number(result.lastInsertRowid),
            report_id: row.report_id,
            type,
            message,
            source,
            severity,
          });
      } else if (!active && existing && recovered) {
        db.prepare(
          "UPDATE alerts SET resolved_at=?,resolution_reason='HEALTHY_SAMPLE' WHERE id=?",
        ).run(at, existing.id);
        if (emit)
          publish("alert.resolved", {
            id: existing.id,
            report_id: row.report_id,
            type,
          });
      } else if (active && existing) {
        db.prepare(
          "UPDATE alerts SET message=?,severity=?,source=?,last_seen_at=?,seen_count=seen_count+? WHERE id=?",
        ).run(message, severity, source, at, Number(observed), existing.id);
        if (emit && existing.severity !== severity)
          publish("alert.updated", {
            id: existing.id,
            report_id: row.report_id,
            type,
            message,
            severity,
          });
      }
    }
  }

  if (setting(db, "initialized", "") === "")
    transaction(() => {
      setSetting(db, "initialized", "yes");
      for (const r of currentRows()) reconcile(r, "SOURCE_SNAPSHOT", false);
    });
  // Upgrade existing databases once; adding a policy is not an extra telemetry sample.
  if (setting(db, "alert_policy_version", "") !== "2")
    transaction(() => {
      for (const row of currentRows())
        reconcile(row, row.telemetry_source, false, false);
      setSetting(db, "alert_policy_version", "2");
    });
  let replayTimer = null;
  let replayRunning = false;
  const replayStatus = () => ({
    running: replayRunning,
    interval_ms: Number(setting(db, "replay_interval", "5000")),
    snapshot: snapshot(),
    end: audit.observation_sets,
    policy:
      "Undated scenario replay; stops at set 20. Paused after server restart.",
  });
  function stopReplay() {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = null;
    replayRunning = false;
  }
  function advanceReplay(actor = "replay") {
    if (snapshot() >= audit.observation_sets) {
      stopReplay();
      return false;
    }
    transaction(() => {
      db.exec("DELETE FROM overrides");
      setSetting(db, "snapshot", snapshot() + 1);
      for (const r of currentRows()) reconcile(r, "SOURCE_REPLAY");
      recordAudit(actor, "REPLAY_STEP", String(snapshot()), {});
      if (snapshot() >= audit.observation_sets) stopReplay();
      publish("scenario.changed", {
        snapshot: snapshot(),
        source: "SOURCE_REPLAY",
        replay: replayStatus(),
      });
    });
    return true;
  }
  app.get("/api/health", (_, res) =>
    res.json({
      status: "ok",
      mode: demo ? "demo" : "configured",
      service: "pure-insights",
    }),
  );
  app.get("/api/config", (_, res) =>
    res.json({
      demo_mode: demo,
      demo_accounts: demo
        ? ROLES.map((role) => ({
            email: `${role}@pureinsights.demo`,
            role,
          }))
        : [],
      demo_password: demo && password === "InsightsDemo2026!" ? password : null,
    }),
  );
  const loginLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 25,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post("/api/auth/login", loginLimit, (req, res) => {
    const { email, password: provided } = req.body ?? {};
    if (
      typeof email !== "string" ||
      typeof provided !== "string" ||
      provided.length > 256
    )
      return res.status(400).json({ error: "Email and password are required" });
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase());
    // Perform scrypt for invalid users too, avoiding a cheap account-existence timing distinction.
    const fallback = db
      .prepare("SELECT password_hash FROM users LIMIT 1")
      .get();
    const valid = checkPassword(
      provided,
      user?.password_hash ?? fallback.password_hash,
    );
    if (!user || !valid || !user.active)
      return res.status(401).json({ error: "Invalid email or password" });
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      tokenHash(token),
      user.email,
      Date.now() + 8 * 3600000,
    );
    res.cookie("pi_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure,
      maxAge: 8 * 3600000,
      path: "/",
    });
    recordAudit(user.email, "LOGIN", "session", {});
    res.json({ email: user.email, role: user.role });
  });
  app.get("/api/auth/me", auth, (req, res) =>
    res.json({ email: req.user.email, role: req.user.role }),
  );
  app.post("/api/auth/logout", auth, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
      req.user.tokenHash,
    );
    for (const ws of wss.clients)
      if (ws.sessionHash === req.user.tokenHash)
        ws.close(1008, "Session ended");
    res.clearCookie("pi_session", {
      path: "/",
      sameSite: "strict",
      secure,
      httpOnly: true,
    });
    res.status(204).end();
  });
  app.use("/api", auth);
  function filtered(req) {
    let list = scopedRows(req.user);
    const q = String(req.query.q ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 200);
    if (q)
      list = list.filter((r) =>
        [r.report_id, r.report_name, r.owner_email].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      );
    if (req.query.status)
      list = list.filter((r) => r.last_refresh_status === req.query.status);
    if (req.query.orphan === "true") list = list.filter((r) => !r.owner_email);
    if (req.query.slow === "true")
      list = list.filter((r) => r.avg_load_time_sec > 15);
    return list;
  }
  function scopedAlerts(user, state, limit = 500) {
    const clauses = [],
      values = [];
    if (state !== "all")
      clauses.push(
        `resolved_at IS ${state === "active" ? "NULL" : "NOT NULL"}`,
      );
    if (user.role === "owner") {
      const ids = scopedRows(user).map((r) => r.report_id);
      if (!ids.length) return [];
      clauses.push("report_id IN (SELECT value FROM json_each(?))");
      values.push(JSON.stringify(ids));
    }
    return db
      .prepare(
        `SELECT * FROM alerts ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`,
      )
      .all(...values, limit);
  }
  app.get("/api/dashboard", (req, res) =>
    res.json({
      summary: summarize(scopedRows(req.user), req.user.role, price),
      snapshot: snapshot(),
      replay: replayStatus(),
      access_scope:
        req.user.role === "owner" ? "Assigned reports only" : "Workspace",
      observation_sets: audit.observation_sets,
      active_alerts: scopedAlerts(req.user, "active", 100000).length,
      event_cursor: db
        .prepare("SELECT COALESCE(MAX(id),0) AS id FROM events")
        .get().id,
      demo_mode: demo,
      latency_threshold_sec: 15,
      interpretation: audit.interpretation,
    }),
  );
  app.get("/api/reports/export", (req, res) => {
    recordAudit(req.user.email, "EXPORT", "reports", { snapshot: snapshot() });
    res
      .type("text/csv")
      .attachment(`reports-scenario-${snapshot()}.csv`)
      .send(csvExport(filtered(req), req.user.role, price));
  });
  app.get("/api/reports", (req, res) => {
    let list = filtered(req);
    const sort = req.query.sort ?? "report_id";
    const directions = ["asc", "desc"];
    const sorts = [
      "report_id",
      "report_name",
      "monthly_active_views",
      "avg_load_time_sec",
      ...(!["admin", "analyst"].includes(req.user.role)
        ? []
        : ["total_cost_usd", "cost_per_view_usd"]),
    ];
    if (
      !sorts.includes(sort) ||
      !directions.includes(req.query.direction ?? "asc")
    )
      return res.status(400).json({ error: "Invalid sort or direction" });
    const page = Number(req.query.page ?? 1),
      limit = Number(req.query.limit ?? 12);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return res
        .status(400)
        .json({ error: "Page must be positive; limit must be 1–100" });
    list = list.map((r) => publicReport(r, req.user.role, price));
    const direction = req.query.direction === "desc" ? -1 : 1;
    list.sort((a, b) => {
      if (a[sort] == null) return b[sort] == null ? 0 : 1;
      if (b[sort] == null) return -1;
      return (
        direction *
        (typeof a[sort] === "number"
          ? a[sort] - b[sort]
          : String(a[sort]).localeCompare(String(b[sort]), undefined, {
              numeric: true,
            }))
      );
    });
    res.json({
      items: list.slice((page - 1) * limit, page * limit),
      total: list.length,
      page,
      limit,
    });
  });
  app.get("/api/reports/:id", (req, res) => {
    const report = scopedRows(req.user).find(
      (r) => r.report_id === req.params.id,
    );
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(publicReport(report, req.user.role, price));
  });
  app.get("/api/quality", allow("admin", "analyst"), (_, res) =>
    res.json({
      dataset: audit,
      current: currentRows()
        .map((r) => ({
          report_id: r.report_id,
          source_row: r.source_row,
          flags: r.flags,
        }))
        .filter((r) => r.flags.length),
      policy: {
        negative_credits:
          "Retain raw CSV; replace invalid analytical values with null, never zero or absolute value",
        aws_review:
          "Review when AWS USD/view > 1, or positive AWS cost with zero views. Heuristic only.",
        owners:
          "All 100 reports have conflicting non-null owners across observations; selected observation does not establish authoritative ownership",
      },
    }),
  );
  app.get("/api/costs", allow("admin", "analyst"), (req, res) =>
    res.json({
      summary: summarize(scopedRows(req.user), req.user.role, price),
      items: currentRows()
        .map((r) => publicReport(r, req.user.role, price))
        .sort((a, b) => (b.total_cost_usd ?? -1) - (a.total_cost_usd ?? -1)),
      verification: verifyCosts(currentRows(), price),
      insights: costInsights(currentRows(), price),
      scope:
        "Selected undated observation set; price is an assumption; views are not unique users",
    }),
  );
  app.get("/api/alerts", (req, res) => {
    const state = req.query.state ?? "active";
    if (!["active", "resolved", "all"].includes(state))
      return res.status(400).json({ error: "Invalid alert state" });
    res.json({ items: scopedAlerts(req.user, state) });
  });

  app.post(
    "/api/alerts/:id/ack",
    allow("admin", "analyst", "engineer", "owner"),
    (req, res) => {
      const alert = db
        .prepare("SELECT * FROM alerts WHERE id=?")
        .get(req.params.id);
      if (
        !alert ||
        (req.user.role === "owner" &&
          !scopedRows(req.user).some((r) => r.report_id === alert.report_id))
      )
        return res.status(404).json({ error: "Alert not found" });
      if (alert.resolved_at)
        return res.status(409).json({ error: "Alert is already resolved" });
      if (alert.ack_at) return res.json(alert);
      transaction(() => {
        db.prepare("UPDATE alerts SET ack_by=?,ack_at=? WHERE id=?").run(
          req.user.email,
          now(),
          alert.id,
        );
        recordAudit(req.user.email, "ACK_ALERT", String(alert.id), {});
        publish("alert.acknowledged", {
          id: alert.id,
          report_id: alert.report_id,
          ack_by: req.user.email,
        });
      });
      res.json(db.prepare("SELECT * FROM alerts WHERE id=?").get(alert.id));
    },
  );
  app.post(
    "/api/reports/:id/telemetry",
    allow("admin", "engineer"),
    (req, res) => {
      if (!demo)
        return res
          .status(403)
          .json({ error: "Telemetry simulator is disabled outside demo mode" });
      const error = validateTelemetry(req.body);
      if (error) return res.status(400).json({ error });
      const r = currentRows().find((x) => x.report_id === req.params.id);
      if (!r) return res.status(404).json({ error: "Report not found" });
      transaction(() => {
        const existing = db
          .prepare("SELECT body FROM overrides WHERE report_id=?")
          .get(r.report_id);
        const body = { ...JSON.parse(existing?.body ?? "{}"), ...req.body };
        db.prepare(
          "INSERT INTO overrides VALUES(?,?) ON CONFLICT(report_id) DO UPDATE SET body=excluded.body",
        ).run(r.report_id, JSON.stringify(body));
        reconcile({ ...r, ...body }, "SIMULATED_LIVE");
        recordAudit(
          req.user.email,
          "SIMULATE_TELEMETRY",
          r.report_id,
          req.body,
        );
        publish("telemetry.updated", {
          report_id: r.report_id,
          ...req.body,
          source: "SIMULATED_LIVE",
        });
      });
      res.json(
        publicReport(
          currentRows().find((x) => x.report_id === r.report_id),
          req.user.role,
          price,
        ),
      );
    },
  );
  app.patch("/api/reports/:id/owner", allow("admin"), (req, res) => {
    const owner = req.body?.owner_email;
    if (
      typeof owner !== "string" ||
      owner.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.trim())
    )
      return res.status(400).json({ error: "A valid owner email is required" });
    const r = currentRows().find((x) => x.report_id === req.params.id);
    if (!r) return res.status(404).json({ error: "Report not found" });
    transaction(() => {
      const body = { owner_email: owner.trim().toLowerCase() };
      db.prepare(
        "INSERT INTO assignments VALUES(?,?,?,?) ON CONFLICT(report_id) DO UPDATE SET owner_email=excluded.owner_email,assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at",
      ).run(r.report_id, body.owner_email, req.user.email, now());
      recordAudit(req.user.email, "ASSIGN_OWNER", r.report_id, {
        before: r.owner_email,
        after: body.owner_email,
        snapshot: snapshot(),
      });
      publish("ownership.updated", {
        report_id: r.report_id,
        owner_email: body.owner_email,
      });
    });
    res.json(
      publicReport(
        currentRows().find((x) => x.report_id === r.report_id),
        req.user.role,
        price,
      ),
    );
  });
  app.post("/api/scenario", allow("admin"), (req, res) => {
    const n = req.body?.snapshot;
    if (!Number.isInteger(n) || n < 1 || n > audit.observation_sets)
      return res.status(400).json({
        error: `Snapshot must be an integer from 1 to ${audit.observation_sets}`,
      });
    if (!demo)
      return res
        .status(403)
        .json({ error: "Scenario switching requires demo mode" });
    stopReplay();
    transaction(() => {
      db.prepare(
        "UPDATE alerts SET resolved_at=?,resolution_reason='SCENARIO_RESET' WHERE resolved_at IS NULL",
      ).run(now());
      db.exec("DELETE FROM overrides");
      setSetting(db, "snapshot", n);
      for (const r of currentRows()) reconcile(r, "SOURCE_SNAPSHOT", false);
      recordAudit(req.user.email, "RESET_SCENARIO", String(n), {});
      publish("scenario.changed", { snapshot: n });
    });
    res.json({ snapshot: n });
  });
  app.get("/api/replay", (_, res) => res.json(replayStatus()));
  app.post("/api/replay", allow("admin"), (req, res) => {
    if (!demo)
      return res.status(403).json({ error: "Replay requires demo mode" });
    const { action, interval_ms } = req.body ?? {};
    if (
      !["start", "pause", "step"].includes(action) ||
      (interval_ms !== undefined &&
        (!Number.isInteger(interval_ms) ||
          interval_ms < 1000 ||
          interval_ms > 30000))
    )
      return res.status(400).json({
        error:
          "Action must be start, pause or step; interval_ms must be 1000–30000",
      });
    stopReplay();
    if (interval_ms !== undefined)
      setSetting(db, "replay_interval", interval_ms);
    if (action === "step") advanceReplay(req.user.email);
    if (action === "start" && snapshot() < audit.observation_sets) {
      replayRunning = true;
      replayTimer = setInterval(() => {
        try {
          advanceReplay();
        } catch (e) {
          stopReplay();
          console.error("Replay stopped:", e.message);
        }
      }, replayStatus().interval_ms);
      replayTimer.unref();
    }
    transaction(() => {
      recordAudit(req.user.email, "REPLAY_CONTROL", action, replayStatus());
      publish("replay.changed", replayStatus());
    });
    res.json(replayStatus());
  });
  app.get("/api/reports/:id/history", (req, res) => {
    if (!scopedRows(req.user).some((r) => r.report_id === req.params.id))
      return res.status(404).json({ error: "Report not found" });
    res.json({
      items: rows
        .filter((r) => r.report_id === req.params.id)
        .map((r) => publicReport(r, req.user.role, price)),
      scope:
        "Source order only. Twenty undated observations, not a time series.",
    });
  });
  app.get("/api/reports/:id/explanation", (req, res) => {
    const row = scopedRows(req.user).find((r) => r.report_id === req.params.id);
    if (!row) return res.status(404).json({ error: "Report not found" });
    res.json(explainReport(row));
  });
  app.get("/api/costs/verification", allow("admin", "analyst"), (_, res) =>
    res.json(verifyCosts(currentRows(), price)),
  );
  app.get("/api/costs/insights", allow("admin", "analyst"), (_, res) =>
    res.json(costInsights(currentRows(), price)),
  );
  app.get("/api/users", allow("admin"), (_, res) =>
    res.json({
      items: db
        .prepare("SELECT email,role,active FROM users ORDER BY email")
        .all(),
    }),
  );
  app.patch("/api/users/:email", allow("admin"), (req, res) => {
    const email = req.params.email;
    const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    if (!user) return res.status(404).json({ error: "User not found" });
    const { role, active } = req.body ?? {};
    if (
      Object.keys(req.body ?? {}).some(
        (k) => !["role", "active"].includes(k),
      ) ||
      !ROLES.includes(role) ||
      typeof active !== "boolean"
    )
      return res
        .status(400)
        .json({ error: "A supported role and boolean active are required" });
    if (email === req.user.email)
      return res.status(409).json({
        error: "Use another administrator to change your own account",
      });
    transaction(() => {
      db.prepare("UPDATE users SET role=?,active=? WHERE email=?").run(
        role,
        Number(active),
        email,
      );
      db.prepare("DELETE FROM sessions WHERE email=?").run(email);
      recordAudit(req.user.email, "UPDATE_ACCESS", email, { role, active });
      publish("users.changed", {});
    });
    res.json({ email, role, active });
  });
  app.get("/api/audit", allow("admin"), (_, res) =>
    res.json({
      items: db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 200").all(),
    }),
  );
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "API route not found" }),
  );
  const dist = resolve(root, "client/dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: 0 }));
    app.get("/{*path}", (_, res) => res.sendFile(resolve(dist, "index.html")));
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ error: "Malformed JSON" });
    if (err.type === "entity.too.large")
      return res.status(413).json({ error: "Request body is too large" });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    const user = userFor(req);
    if (
      url.pathname !== "/ws" ||
      !user ||
      !allowedOrigins.has(req.headers.origin) ||
      wss.clients.size >= 100 ||
      [...wss.clients].filter((ws) => ws.sessionHash === user?.tokenHash)
        .length >= 5
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const since = Number(url.searchParams.get("since") ?? 0);
    if (!Number.isSafeInteger(since) || since < 0) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.sessionHash = user.tokenHash;
      ws.role = user.role;
      ws.alive = true;
      ws.on("error", () => ws.terminate());
      ws.on("pong", () => (ws.alive = true));
      ws.on("message", () => ws.close(1008, "This stream is receive only"));
      const oldest = db
        .prepare("SELECT MIN(id) AS id,MAX(id) AS max FROM events")
        .get();
      if ((oldest.id && since < oldest.id - 1) || since > (oldest.max ?? 0))
        ws.send(
          JSON.stringify({
            type: "resync.required",
            payload: { reason: "Replay cursor unavailable" },
          }),
        );
      else
        for (const e of db
          .prepare("SELECT * FROM events WHERE id>? ORDER BY id")
          .all(since))
          sendEvent(ws, { ...e, payload: JSON.parse(e.payload) });
      ws.send(
        JSON.stringify({
          type: "connected",
          payload: { role: user.role, snapshot: snapshot() },
        }),
      );
      wss.emit("connection", ws, req);
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (
        !ws.alive ||
        !db
          .prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?")
          .get(ws.sessionHash, Date.now())
      ) {
        ws.terminate();
        continue;
      }
      const liveUser = streamUser(ws);
      if (!liveUser || liveUser.role !== ws.role) {
        ws.close(1008, "Permissions changed");
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 15000);
  heartbeat.unref();
  async function close() {
    stopReplay();
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    await new Promise((r) => wss.close(r));
    if (server.listening) await new Promise((r) => server.close(r));
    db.close();
  }
  return { app, server, db, close, currentRows, rows, audit };
}
