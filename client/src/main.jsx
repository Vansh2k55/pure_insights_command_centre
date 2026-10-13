import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  LayoutDashboard,
  BarChart3,
  Bell,
  Database,
  ShieldCheck,
  Search,
  ArrowUpRight,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  Radio,
  Check,
  AlertTriangle,
  RefreshCw,
  Layers,
  ClipboardList,
  UserRound,
  Zap,
  Clock3,
} from "lucide-react";
import "./styles.css";
import {
  ReplayControls,
  HealthHighlights,
  CostVerification,
  CostAnalysis,
  EvidencePanel,
  UserAccess,
} from "./Extensions.jsx";

async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-App-Request": "pure-insights",
      ...options.headers,
    },
  });
  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {}
    const error = new Error(body?.error ?? `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}
const number = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const money = (n, digits = 0) =>
  n == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(n);
const time = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
function Badge({ status }) {
  return (
    <span className={`badge ${status?.toLowerCase()}`}>
      {status?.replaceAll("_", " ")}
    </span>
  );
}
function Empty({ children }) {
  return (
    <div className="empty">
      <Check size={25} />
      <p>{children}</p>
    </div>
  );
}
function Login({ onLogin }) {
  const [config, setConfig] = useState(null),
    [email, setEmail] = useState("admin@pureinsights.demo"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api("/config")
      .then((c) => {
        setConfig(c);
        if (c.demo_password) setPassword(c.demo_password);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <div className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Layers size={21} />
          </span>
          pure<span className="brand-light">insights</span>
        </div>
        <div className="login-title">
          <span className="eyebrow light">ANALYTICS OPERATIONS</span>
          <h1>
            Every report.
            <br />
            Every signal.
            <br />
            <em>One clear view.</em>
          </h1>
          <p>
            A command centre for report health, ownership and the cost of
            delivering insight.
          </p>
          <div className="login-chips">
            <span>
              <Activity size={15} />
              Health monitoring
            </span>
            <span>
              <Zap size={15} />
              Live alerts
            </span>
          </div>
        </div>
        <div className="login-foot">
          Case Study 03 <span>Technical Data AI Validation</span>
        </div>
      </div>
      <main className="login-form">
        <span className="eyebrow">PURE INSIGHTS COMMAND CENTRE</span>
        <h2>Welcome to operations.</h2>
        <p>Sign in to explore the monitoring workspace.</p>
        {config?.demo_mode && (
          <div className="demo-roles">
            <span>Choose a demo role</span>
            <div>
              {config.demo_accounts.map((a) => (
                <button
                  key={a.role}
                  className={email === a.email ? "selected" : ""}
                  onClick={() => setEmail(a.email)}
                >
                  {a.role}
                </button>
              ))}
            </div>
          </div>
        )}
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Open command centre"}
            <ArrowUpRight size={17} />
          </button>
        </form>
        {config?.demo_password && (
          <p className="demo-note">
            Local demo password: <code>{config.demo_password}</code>
            <br />
            Admin can manage operations. Analyst can review costs and
            acknowledge alerts. Engineer can simulate telemetry. Viewer has
            read-only health access. Owner sees assigned reports only.
          </p>
        )}
        <div className="login-security">
          <ShieldCheck size={16} />
          Server-enforced roles · Secure session cookies
        </div>
      </main>
    </div>
  );
}
const navigation = [
  ["overview", "Overview", LayoutDashboard],
  ["reports", "Report inventory", Layers],
  ["alerts", "Alert centre", Bell],
  ["costs", "Cost intelligence", BarChart3],
  ["quality", "Data validation", Database],
  ["audit", "Audit trail", ClipboardList],
];
function App() {
  const [user, setUser] = useState(undefined),
    [tab, setTab] = useState("overview"),
    [dashboard, setDashboard] = useState(null),
    [reports, setReports] = useState(null),
    [allReports, setAllReports] = useState([]),
    [alerts, setAlerts] = useState([]),
    [costs, setCosts] = useState(null),
    [quality, setQuality] = useState(null),
    [audit, setAudit] = useState([]),
    [theme, setTheme] = useState(
      () => localStorage.getItem("pi_theme") ?? "dark",
    );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pi_theme", theme);
  }, [theme]);
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [orphan, setOrphan] = useState(false),
    [slow, setSlow] = useState(false),
    [page, setPage] = useState(1),
    [sort, setSort] = useState("report_id"),
    [direction, setDirection] = useState("asc"),
    [alertState, setAlertState] = useState("active");
  const [detail, setDetail] = useState(null),
    [online, setOnline] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [scenario, setScenario] = useState(1);
  const refreshRef = useRef(null),
    version = useRef(0),
    toastTimer = useRef(null);
  const canCost = ["admin", "analyst"].includes(user?.role),
    canOperate = ["admin", "engineer"].includes(user?.role),
    canAck = ["admin", "analyst", "engineer", "owner"].includes(user?.role),
    admin = user?.role === "admin";
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch((e) => {
        setUser(null);
        if (e.status !== 401) setError(e.message);
      });
    return () => clearTimeout(toastTimer.current);
  }, []);
  function notify(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }
  const params = new URLSearchParams({
    q,
    status,
    orphan: String(orphan),
    slow: String(slow),
    page: String(page),
    limit: "10",
    sort,
    direction,
  });
  async function refresh() {
    if (!user) return;
    const n = ++version.current;
    setLoading(true);
    try {
      const [d, r, a, all, c, v, trail] = await Promise.all([
        api("/dashboard"),
        api("/reports?" + params),
        api("/alerts?state=" + alertState),
        api("/reports?limit=100"),
        canCost ? api("/costs") : null,
        canCost ? api("/quality") : null,
        admin ? api("/audit") : null,
      ]);
      if (n !== version.current) return;
      setDashboard(d);
      setScenario(d.snapshot);
      setReports(r);
      setAlerts(a.items);
      setAllReports(all.items);
      setCosts(c);
      setQuality(v);
      setAudit(trail?.items ?? []);
      setError("");
      // A response captured before Escape/navigation must never reopen a closed drawer.
      setDetail((current) =>
        current
          ? (all.items.find((x) => x.report_id === current.report_id) ?? null)
          : null,
      );
    } catch (e) {
      if (n === version.current) {
        setError(e.message);
        if (e.status === 401) setUser(null);
      }
    } finally {
      if (n === version.current) setLoading(false);
    }
  }
  refreshRef.current = refresh;
  useEffect(() => {
    refresh();
  }, [user, q, status, orphan, slow, page, sort, direction, alertState]);
  useEffect(() => {
    if (!user) return;
    let stopped = false,
      ws,
      retry,
      debounce,
      cursor = 0,
      attempt = 0;
    function connect() {
      if (stopped) return;
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?since=${cursor}`,
      );
      ws.onopen = () => {
        setOnline(true);
        attempt = 0;
      };
      ws.onmessage = async (e) => {
        const event = JSON.parse(e.data);
        if (event.id) cursor = event.id;
        if (event.type === "resync.required") {
          try {
            const state = await api("/dashboard");
            cursor = state.event_cursor;
            refreshRef.current();
          } catch (e) {
            setError(e.message);
          }
          return;
        }
        if (event.type === "connected") {
          clearTimeout(debounce);
          debounce = setTimeout(() => refreshRef.current(), 80);
          return;
        }
        if (event.type === "cursor") return;
        if (event.type === "alert.created" || event.type === "alert.updated")
          notify(`${event.payload.report_id}: ${event.payload.message}`);
        if (event.type === "alert.resolved")
          notify(
            `${event.payload.report_id}: ${event.payload.type.toLowerCase()} recovered`,
          );
        clearTimeout(debounce);
        debounce = setTimeout(() => refreshRef.current(), 80);
      };
      ws.onclose = (e) => {
        setOnline(false);
        if (stopped) return;
        if (e.code === 1008) {
          setUser(null);
          return;
        }
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
      ws.onerror = () => ws.close();
    }
    api("/dashboard")
      .then((d) => {
        cursor = d.event_cursor;
        connect();
      })
      .catch((e) => setError(e.message));
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(debounce);
      ws?.close();
      setOnline(false);
    };
  }, [user]);
  async function action(path, body, method = "POST", message = "Saved") {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, { method, body: JSON.stringify(body) });
      await refreshRef.current();
      notify(message);
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setDashboard(null);
      setDetail(null);
      setToast("");
      setQ("");
      setStatus("");
      setOrphan(false);
      setSlow(false);
      setPage(1);
      setAlertState("active");
      setTab("overview");
      setSort("report_id");
      setAllReports([]);
      setReports(null);
      setAlerts([]);
      setCosts(null);
      setQuality(null);
      setAudit([]);
    } catch (e) {
      setError(e.message);
    }
  }
  async function download() {
    try {
      const response = await fetch("/api/reports/export?" + params);
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pure-insights-scenario-${dashboard.snapshot}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Filtered report inventory exported");
    } catch (e) {
      setError(e.message);
    }
  }
  function go(next) {
    setTab(next);
    setPage(1);
  }
  if (user === undefined)
    return (
      <div className="startup">
        <Layers />
        <p>Opening command centre…</p>
      </div>
    );
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          setError("");
        }}
      />
    );
  const title = {
    overview: "Operations overview",
    reports: "Report inventory",
    alerts: "Alert centre",
    costs: "Cost intelligence",
    quality: "Data validation",
    audit: "Audit trail",
  }[tab];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Layers size={21} />
          </span>
          pure<span className="brand-light">insights</span>
        </div>
        <div className="workspace-tag">
          COMMAND CENTRE <span>03</span>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {navigation
            .filter(
              ([id]) =>
                (canCost || !["costs", "quality"].includes(id)) &&
                (admin || id !== "audit"),
            )
            .map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={tab === id ? "active" : ""}
              >
                <Icon size={18} />
                {label}
                {id === "alerts" && dashboard?.active_alerts > 0 && (
                  <span className="nav-count">{dashboard.active_alerts}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="scope-note">
            <Database size={19} />
            <strong>Dataset workspace</strong>
            <span>
              2,000 observations
              <br />
              100 distinct reports
            </span>
          </div>
          <div className="user-box">
            <span className="avatar">{user.role[0].toUpperCase()}</span>
            <div>
              <strong>{user.role}</strong>
              <span>{user.email}</span>
            </div>
            <button onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} /> <span>{title}</span>
          </div>
          <div className={`connection ${online ? "connected" : ""}`}>
            <span />
            {online ? "Live stream connected" : "Stream reconnecting"}
          </div>
          <button
            className="theme-toggle secondary"
            aria-label="Toggle colour theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <span className="role-chip">
            <ShieldCheck size={14} />
            {user.role}
          </span>
          <button
            className="mobile-logout icon-button"
            onClick={logout}
            aria-label="Sign out"
          >
            <LogOut size={17} />
          </button>
        </header>
        <main className="main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">PURE INSIGHTS / OPERATIONS</span>
              <h1>{title}</h1>
              <p>
                {
                  {
                    overview:
                      "Keep your analytics healthy, owned and accountable.",
                    reports:
                      "Inspect the reports behind your analytics workspace.",
                    alerts: "Act on refresh failures and slow report loads.",
                    costs:
                      "Understand the cost of delivering every report view.",
                    quality:
                      "Trace every validation decision back to the source.",
                    audit: "A record of who changed what in this workspace.",
                  }[tab]
                }
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => refreshRef.current()}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
          <div className="scenario-strip">
            <div>
              <span className="scenario-icon">
                <Layers size={17} />
              </span>
              <strong>
                Observation set {dashboard?.snapshot ?? "—"} of 20
              </strong>
              <span>Undated source scenario · no monthly aggregation</span>
            </div>
            {admin && dashboard?.demo_mode ? (
              <div className="scenario-control">
                <select
                  aria-label="Observation set"
                  value={scenario}
                  onChange={(e) => setScenario(Number(e.target.value))}
                >
                  {Array.from({ length: 20 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Set {i + 1}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy}
                  onClick={() =>
                    action(
                      "/scenario",
                      { snapshot: scenario },
                      "POST",
                      "Scenario loaded; simulated telemetry cleared",
                    )
                  }
                >
                  Load / reset
                </button>
              </div>
            ) : (
              <span className="small-muted">
                {dashboard?.demo_mode
                  ? "Demo workspace"
                  : "Configured workspace"}
              </span>
            )}
          </div>
          {dashboard?.demo_mode && (
            <ReplayControls
              state={dashboard.replay}
              admin={admin}
              busy={busy}
              action={action}
            />
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={17} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {!dashboard || !reports ? (
            <div className="empty">
              {error
                ? "Unable to load workspace. Use Refresh to retry."
                : "Loading reports…"}
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <HealthHighlights
                    reports={allReports}
                    summary={dashboard.summary}
                    onInspect={setDetail}
                  />
                  <div className="metrics">
                    <Metric
                      title="Reports monitored"
                      value={number(dashboard.summary.reports)}
                      foot={`${number(dashboard.summary.views)} monthly active views`}
                      icon={Layers}
                    />
                    <Metric
                      title="Refresh failures"
                      value={number(dashboard.summary.refresh_failures)}
                      foot={`${dashboard.summary.unknown_refresh} unknown statuses need review`}
                      icon={RefreshCw}
                      tone="warning"
                    />
                    <Metric
                      title="Slow reports"
                      value={number(dashboard.summary.slow)}
                      foot="Load latency strictly above 15 seconds"
                      icon={Clock3}
                      tone="warning"
                    />
                    <Metric
                      title="Orphaned reports"
                      value={number(dashboard.summary.orphans)}
                      foot="No valid owner in this observation set"
                      icon={UserRound}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <PanelHead
                        eyebrow="PLATFORM HEALTH"
                        title="Refresh outcomes"
                      />
                      <StatusChart reports={allReports} />
                    </section>
                    <section className="panel">
                      <PanelHead
                        eyebrow="PERFORMANCE"
                        title="Report load latency"
                        right={
                          <span className="subtle-tag">Threshold 15s</span>
                        }
                      />
                      <LatencyChart reports={allReports} />
                    </section>
                  </div>
                  <div className="overview-bottom">
                    <section className="panel">
                      <PanelHead
                        eyebrow="NEEDS ATTENTION"
                        title="Operational priorities"
                        right={
                          <button
                            className="text-button"
                            onClick={() => go("alerts")}
                          >
                            View alerts <ArrowUpRight size={15} />
                          </button>
                        }
                      />
                      <div className="priority-list">
                        {allReports
                          .filter(
                            (r) =>
                              !r.owner_email ||
                              ["FAILED", "TIMED_OUT"].includes(
                                r.last_refresh_status,
                              ),
                          )
                          .slice(0, 5)
                          .map((r) => (
                            <button
                              key={r.report_id}
                              onClick={() => setDetail(r)}
                            >
                              <span className="report-symbol">
                                <BarChart3 size={18} />
                              </span>
                              <div>
                                <strong>{r.report_name}</strong>
                                <span>
                                  {r.report_id} ·{" "}
                                  {r.owner_email ?? "Owner missing"}
                                </span>
                              </div>
                              <Badge
                                status={
                                  !r.owner_email
                                    ? "ORPHANED"
                                    : r.last_refresh_status
                                }
                              />
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        {!allReports.some(
                          (r) =>
                            !r.owner_email ||
                            ["FAILED", "TIMED_OUT"].includes(
                              r.last_refresh_status,
                            ),
                        ) && (
                          <Empty>
                            No ownership or refresh issues in this set.
                          </Empty>
                        )}
                      </div>
                    </section>
                    <section className="panel cost-preview">
                      <PanelHead
                        eyebrow={canCost ? "COST COVERAGE" : "MONITORING SCOPE"}
                        title={
                          canCost ? "Cost of insight" : "Signals you can trust"
                        }
                      />
                      {canCost ? (
                        <>
                          <div className="big-cost">
                            {money(dashboard.summary.known_total_cost_usd)}
                          </div>
                          <p>
                            Known combined cost for{" "}
                            <strong>
                              {dashboard.summary.complete_cost_reports} /{" "}
                              {dashboard.summary.reports}
                            </strong>{" "}
                            reports
                          </p>
                          <div className="cost-detail">
                            <span>Portfolio cost / view</span>
                            <strong>
                              {money(
                                dashboard.summary.portfolio_cost_per_view_usd,
                                2,
                              )}
                            </strong>
                          </div>
                          <div className="cost-detail">
                            <span>Assumed Snowflake price</span>
                            <strong>
                              {money(dashboard.summary.credit_price_usd, 2)} /
                              credit
                            </strong>
                          </div>
                          <p className="small-muted">
                            Invalid credit values are excluded. The denominator
                            uses views from the same cost-complete reports.
                          </p>
                          <button
                            className="text-button"
                            onClick={() => go("costs")}
                          >
                            Explore cost intelligence <ArrowUpRight size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <p>
                            Refresh and latency alerts arrive through an
                            authenticated live stream.
                          </p>
                          <p>
                            Data comes from one selected observation set.
                            Runtime simulations are labelled separately.
                          </p>
                          <div className="cost-detail">
                            <span>Healthy reports</span>
                            <strong>
                              {dashboard.summary.healthy} /{" "}
                              {dashboard.summary.reports}
                            </strong>
                          </div>
                          <p className="small-muted">
                            Healthy means known latency ≤15s, successful refresh
                            and a valid owner.
                          </p>
                        </>
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "reports" && (
                <section className="panel inventory">
                  <PanelHead
                    eyebrow="REPORT CATALOGUE"
                    title={`${reports.total} reports in view`}
                    right={
                      <button className="secondary" onClick={download}>
                        <ArrowDownToLine size={15} />
                        Export CSV
                      </button>
                    }
                  />
                  <div className="table-toolbar">
                    <div className="search">
                      <Search size={16} />
                      <input
                        aria-label="Search reports"
                        placeholder="Search reports, IDs or owners…"
                        value={q}
                        onChange={(e) => {
                          setQ(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <select
                      aria-label="Refresh status filter"
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All refresh statuses</option>
                      {["SUCCESS", "FAILED", "TIMED_OUT", "UNKNOWN"].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                    <label className="check-filter">
                      <input
                        type="checkbox"
                        checked={orphan}
                        onChange={(e) => {
                          setOrphan(e.target.checked);
                          setPage(1);
                        }}
                      />
                      Missing owners
                    </label>
                    <label className="check-filter">
                      <input
                        type="checkbox"
                        checked={slow}
                        onChange={(e) => {
                          setSlow(e.target.checked);
                          setPage(1);
                        }}
                      />
                      Slow loads
                    </label>
                  </div>
                  <div className="sort-row">
                    <span>Sort by</span>
                    <select
                      aria-label="Sort reports"
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="report_id">Report ID</option>
                      <option value="avg_load_time_sec">Load latency</option>
                      <option value="monthly_active_views">Views</option>
                      {canCost && (
                        <>
                          <option value="total_cost_usd">Total cost</option>
                          <option value="cost_per_view_usd">
                            Cost per view
                          </option>
                        </>
                      )}
                    </select>
                    <button
                      className="text-button"
                      onClick={() =>
                        setDirection(direction === "asc" ? "desc" : "asc")
                      }
                    >
                      {direction === "asc" ? "Ascending" : "Descending"}
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Report</th>
                          <th>Owner</th>
                          <th>Refresh</th>
                          <th className="numeric">Load time</th>
                          <th className="numeric">Views</th>
                          {canCost && <th className="numeric">Total cost</th>}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {reports.items.map((r) => (
                          <tr key={r.report_id}>
                            <td>
                              <button
                                className="report-link"
                                onClick={() => setDetail(r)}
                              >
                                {r.report_name}
                              </button>
                              <span className="cell-sub">
                                {r.report_id}
                                {r.telemetry_source === "SIMULATED_LIVE"
                                  ? " · simulated"
                                  : ""}
                              </span>
                            </td>
                            <td>
                              {r.owner_email ?? (
                                <span className="missing">Unassigned</span>
                              )}
                            </td>
                            <td>
                              <Badge status={r.last_refresh_status} />
                            </td>
                            <td
                              className={`numeric ${r.avg_load_time_sec > 15 ? "latency-warning" : ""}`}
                            >
                              {r.avg_load_time_sec ?? "—"}s
                            </td>
                            <td className="numeric">
                              {number(r.monthly_active_views)}
                            </td>
                            {canCost && (
                              <td className="numeric">
                                {money(r.total_cost_usd, 2)}
                              </td>
                            )}
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Inspect ${r.report_id}`}
                                onClick={() => setDetail(r)}
                              >
                                <ArrowUpRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!reports.items.length && (
                    <Empty>No reports match these filters.</Empty>
                  )}
                  <div className="pagination">
                    <span>
                      {reports.total
                        ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, reports.total)} of ${reports.total} reports`
                        : "0 reports"}
                    </span>
                    <div>
                      <button
                        aria-label="Previous page"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        Page {page} /{" "}
                        {Math.max(1, Math.ceil(reports.total / 10))}
                      </span>
                      <button
                        aria-label="Next page"
                        disabled={page * 10 >= reports.total}
                        onClick={() => setPage(page + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {tab === "alerts" && (
                <section className="panel">
                  <PanelHead
                    eyebrow="OPERATIONAL NOTIFICATIONS"
                    title="Alert queue"
                    right={
                      <div className="segmented">
                        {["active", "resolved", "all"].map((s) => (
                          <button
                            key={s}
                            className={s === alertState ? "selected" : ""}
                            onClick={() => setAlertState(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    }
                  />
                  <p className="panel-note">
                    Acknowledgement records review. A successful refresh or
                    latency recovery resolves the condition. Initial source
                    alerts are distinct from simulated live events. Up to 500
                    most recent alerts shown.
                  </p>
                  <div className="alert-list">
                    {alerts.map((a) => (
                      <div
                        key={a.id}
                        className={`alert-item ${a.resolved_at ? "resolved" : ""}`}
                      >
                        <span className="alert-symbol">
                          {a.type === "LATENCY" ? (
                            <Clock3 size={19} />
                          ) : (
                            <RefreshCw size={19} />
                          )}
                        </span>
                        <div className="alert-main">
                          <div>
                            <button
                              className="report-link"
                              onClick={() => {
                                const report = allReports.find(
                                  (r) => r.report_id === a.report_id,
                                );
                                if (report) setDetail(report);
                              }}
                            >
                              {a.report_id}
                            </button>
                            <span className={`severity ${a.severity}`}>
                              {a.severity}
                            </span>
                            <Badge
                              status={
                                a.resolved_at
                                  ? "RESOLVED"
                                  : a.ack_at
                                    ? "ACKNOWLEDGED"
                                    : "ACTIVE"
                              }
                            />
                          </div>
                          <p>{a.message}</p>
                          <span>
                            {a.source === "SOURCE_SNAPSHOT"
                              ? "Source observation"
                              : a.source === "SOURCE_REPLAY"
                                ? "Source replay"
                                : "Simulated live telemetry"}{" "}
                            · Detected {time(a.created_at)} · {a.seen_count}{" "}
                            sample(s)
                            {a.ack_by ? ` · Reviewed by ${a.ack_by}` : ""}
                          </span>
                        </div>
                        {!a.resolved_at && !a.ack_at && canAck && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              action(
                                `/alerts/${a.id}/ack`,
                                {},
                                "POST",
                                "Alert acknowledged",
                              )
                            }
                          >
                            Acknowledge
                          </button>
                        )}
                        {a.resolved_at && <Check size={19} />}
                      </div>
                    ))}
                    {!alerts.length && (
                      <Empty>No {alertState} alerts to display.</Empty>
                    )}
                  </div>
                </section>
              )}
              {tab === "costs" && costs && (
                <>
                  <div className="metrics">
                    <Metric
                      title="Known combined cost"
                      value={money(costs.summary.known_total_cost_usd)}
                      foot={`${costs.summary.complete_cost_reports} reports with complete costs`}
                      icon={BarChart3}
                    />
                    <Metric
                      title="Valid Snowflake credits"
                      value={number(costs.summary.valid_credits)}
                      foot={`Assumed ${money(costs.summary.credit_price_usd, 2)} per credit`}
                      icon={Database}
                    />
                    <Metric
                      title="Portfolio cost / view"
                      value={money(
                        costs.summary.portfolio_cost_per_view_usd,
                        2,
                      )}
                      foot={`${number(costs.summary.cost_denominator_views)} cost-complete views`}
                      icon={Activity}
                    />
                    <Metric
                      title="Hosting cost reviews"
                      value={number(costs.summary.cost_review_reports)}
                      foot="Heuristic: AWS > $1/view or zero views"
                      icon={AlertTriangle}
                      tone="warning"
                    />
                  </div>
                  <CostVerification data={costs.verification} />
                  <CostAnalysis data={costs.insights} reports={costs.items} />
                  <section className="panel">
                    <PanelHead
                      eyebrow="COST CONCENTRATION"
                      title="Top 8 reports by known total cost"
                      right={
                        <div className="chart-legend">
                          <span>
                            <i className="green" />
                            Snowflake
                          </span>
                          <span>
                            <i className="mint" />
                            AWS hosting
                          </span>
                        </div>
                      }
                    />
                    <CostChart
                      reports={costs.items
                        .filter((r) => r.total_cost_usd !== null)
                        .slice(0, 8)}
                    />
                    <p className="panel-note">
                      USD estimate = valid Snowflake credits × assumed credit
                      price + AWS hosting. Zero-view unit costs and
                      invalid-credit totals remain unavailable. This CSV
                      supports cost per view, not cost per unique user.
                    </p>
                  </section>
                  <section className="panel cost-table">
                    <PanelHead
                      eyebrow="UNIT ECONOMICS"
                      title="Report cost breakdown"
                    />
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Report</th>
                            <th className="numeric">Credits</th>
                            <th className="numeric">Snowflake USD</th>
                            <th className="numeric">AWS USD</th>
                            <th className="numeric">Total USD</th>
                            <th className="numeric">USD / view</th>
                          </tr>
                        </thead>
                        <tbody>
                          {costs.items.map((r) => (
                            <tr key={r.report_id}>
                              <td>
                                <button
                                  className="report-link"
                                  onClick={() => setDetail(r)}
                                >
                                  {r.report_id}
                                </button>
                                {r.flags.some((f) => f.includes("AWS")) && (
                                  <span className="cell-sub missing">
                                    Hosting cost review
                                  </span>
                                )}
                              </td>
                              <td className="numeric">
                                {r.snowflake_credits_consumed?.toFixed(2) ??
                                  "Invalid"}
                              </td>
                              <td className="numeric">
                                {money(r.snowflake_cost_usd, 2)}
                              </td>
                              <td className="numeric">
                                {money(r.aws_hosting_cost_usd, 2)}
                              </td>
                              <td className="numeric">
                                {money(r.total_cost_usd, 2)}
                              </td>
                              <td className="numeric">
                                {money(r.cost_per_view_usd, 2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {tab === "quality" && quality && (
                <>
                  <div className="quality-intro">
                    <ShieldCheck size={24} />
                    <div>
                      <h2>
                        Raw evidence preserved. Analytical defects isolated.
                      </h2>
                      <p>
                        Validation covers all 2,000 source observations.
                        Operational numbers use only the selected 100-report
                        set.
                      </p>
                    </div>
                  </div>
                  <div className="metrics">
                    <Metric
                      title="Orphan observations"
                      value={number(quality.dataset.flags.ORPHANED_REPORT)}
                      foot="Blank or invalid owner email"
                      icon={UserRound}
                    />
                    <Metric
                      title="Invalid credit observations"
                      value={number(
                        quality.dataset.flags
                          .INVALID_SNOWFLAKE_CREDITS_CONSUMED,
                      )}
                      foot="Excluded as null; never made positive"
                      icon={Database}
                      tone="warning"
                    />
                    <Metric
                      title="Ownership conflicts"
                      value={number(quality.dataset.ownership_conflicts)}
                      foot="Reports with different owners across sets"
                      icon={Layers}
                    />
                    <Metric
                      title="Zero-view observations"
                      value={number(quality.dataset.flags.ZERO_VIEWS)}
                      foot="Unit cost has no valid denominator"
                      icon={Activity}
                    />
                  </div>
                  <section className="panel">
                    <PanelHead
                      eyebrow="VALIDATION POLICY"
                      title="How the source is interpreted"
                    />
                    <div className="policy-grid">
                      <Policy
                        title="Repeated IDs"
                        text={quality.dataset.interpretation}
                      />
                      <Policy
                        title="Invalid credits"
                        text={quality.policy.negative_credits}
                      />
                      <Policy title="Ownership" text={quality.policy.owners} />
                      <Policy
                        title="Hosting cost review"
                        text={quality.policy.aws_review}
                      />
                      <Policy
                        title="Unknown refreshes"
                        text="UNKNOWN is a separate state needing review. It is neither a successful refresh nor a confirmed failure."
                      />
                      <Policy
                        title="Latency spikes"
                        text="Values above 15 seconds remain intact and create alerts. They are operational signals, not values to delete."
                      />
                    </div>
                  </section>
                  <section className="panel cost-table">
                    <PanelHead
                      eyebrow="SELECTED SET"
                      title={`${quality.current.length} reports with validation flags`}
                    />
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Report ID</th>
                            <th>CSV source row</th>
                            <th>Review flags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quality.current.map((r) => (
                            <tr key={r.report_id}>
                              <td>{r.report_id}</td>
                              <td>{r.source_row}</td>
                              <td>
                                <div className="flag-list">
                                  {r.flags.map((f) => (
                                    <span key={f}>
                                      {f.replaceAll("_", " ").toLowerCase()}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {tab === "audit" && (
                <>
                  <UserAccess
                    api={api}
                    action={action}
                    busy={busy}
                    revision={dashboard.event_cursor}
                    currentUser={user}
                  />
                  <section className="panel">
                    <PanelHead
                      eyebrow="ACCOUNTABILITY"
                      title="Recent workspace actions"
                    />
                    <p className="panel-note">
                      Latest 200 persisted entries. Records remain across server
                      restarts; the local demo does not claim tamper-proof
                      storage.
                    </p>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Actor</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audit.map((a) => (
                            <tr key={a.id}>
                              <td>{new Date(a.created_at).toLocaleString()}</td>
                              <td>{a.actor}</td>
                              <td>
                                {a.action.replaceAll("_", " ").toLowerCase()}
                              </td>
                              <td>{a.target}</td>
                              <td>
                                <code>{a.details}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!audit.length && <Empty>No actions recorded.</Empty>}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Pure Insights Command Centre</span>
            <span>
              Source observations + labelled live simulation · No live AWS or
              Snowflake connection
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Radio size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {detail && (
        <Detail
          report={detail}
          admin={admin}
          canOperate={canOperate}
          canCost={canCost}
          demo={dashboard?.demo_mode}
          busy={busy}
          action={action}
          close={() => setDetail(null)}
          price={dashboard?.summary.credit_price_usd}
        />
      )}
    </div>
  );
}
function Metric({ title, value, foot, icon: Icon, tone = "" }) {
  return (
    <section className={`metric ${tone}`}>
      <div>
        <span>{title}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <p>{foot}</p>
    </section>
  );
}
function PanelHead({ eyebrow, title, right }) {
  return (
    <div className="panel-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {right}
    </div>
  );
}
function StatusChart({ reports }) {
  const styles = {
    SUCCESS: "#3fbea3",
    FAILED: "#ff7023",
    TIMED_OUT: "#f6bc62",
    UNKNOWN: "#727986",
  };
  const values = Object.keys(styles).map((s) => [
    s,
    reports.filter((r) => r.last_refresh_status === s).length,
  ]);
  let used = 0;
  const gradient = values
    .map(([s, n]) => {
      const start = used;
      used += reports.length ? (n / reports.length) * 100 : 0;
      return `${styles[s]} ${start}% ${used}%`;
    })
    .join(",");
  return (
    <div className="status-chart">
      <div
        className="donut"
        style={{ background: `conic-gradient(${gradient})` }}
        role="img"
        aria-label={values.map(([s, n]) => `${s}: ${n}`).join(", ")}
      >
        <div>
          <strong>
            {reports.length
              ? Math.round((values[0][1] / reports.length) * 100)
              : 0}
            %
          </strong>
          <span>successful</span>
        </div>
      </div>
      <div className="status-legend">
        {values.map(([s, n]) => (
          <div key={s}>
            <i style={{ background: styles[s] }} />
            <span>
              {s === "TIMED_OUT"
                ? "Timed out"
                : s.charAt(0) + s.slice(1).toLowerCase()}
            </span>
            <strong>{n}</strong>
          </div>
        ))}
        <p>Refresh outcome for {reports.length} reports</p>
      </div>
    </div>
  );
}
function LatencyChart({ reports }) {
  const bins = [
    ["0–5s", 0, 5],
    ["5–15s", 5, 15],
    ["15–30s", 15, 30],
    ["30–45s", 30, 45],
    ["45s+", 45, Infinity],
  ];
  const values = bins.map(
    ([, a, b]) =>
      reports.filter(
        (r) =>
          r.avg_load_time_sec !== null &&
          (a === 0 ? r.avg_load_time_sec >= a : r.avg_load_time_sec > a) &&
          r.avg_load_time_sec <= b,
      ).length,
  );
  const max = Math.max(...values, 1);
  return (
    <div className="latency-chart">
      <div className="bars">
        {bins.map(([label], i) => (
          <div key={label} className="bar-column">
            <span>{values[i]}</span>
            <div
              className={`bar ${i >= 2 ? "slow" : ""}`}
              style={{ height: `${Math.max((values[i] / max) * 120, 2)}px` }}
            />
            <small>{label}</small>
          </div>
        ))}
      </div>
      <div className="chart-caption">
        <span>
          <i className="green" />
          Within threshold
        </span>
        <span>
          <i className="orange" />
          Above threshold
        </span>
      </div>
    </div>
  );
}
function CostChart({ reports }) {
  const max = Math.max(...reports.map((r) => r.total_cost_usd), 1);
  return (
    <div className="cost-bars">
      {reports.map((r) => (
        <div key={r.report_id}>
          <span>{r.report_id}</span>
          <div className="cost-bar-track">
            <i
              className="green"
              style={{ width: `${(r.snowflake_cost_usd / max) * 100}%` }}
            />
            <i
              className="mint"
              style={{ width: `${(r.aws_hosting_cost_usd / max) * 100}%` }}
            />
          </div>
          <strong>{money(r.total_cost_usd)}</strong>
        </div>
      ))}
    </div>
  );
}
function Policy({ title, text }) {
  return (
    <div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Detail({
  report: r,
  admin,
  canOperate,
  canCost,
  demo,
  busy,
  action,
  close,
  price,
}) {
  const [owner, setOwner] = useState(r.owner_email ?? ""),
    [latency, setLatency] = useState(r.avg_load_time_sec ?? 0),
    [status, setStatus] = useState(r.last_refresh_status),
    [localError, setLocalError] = useState("");
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handler);
    const previous = document.activeElement;
    const element = document.querySelector(".drawer");
    element?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  async function telemetry(l, s) {
    if (l === "" || !Number.isFinite(Number(l))) {
      setLocalError("Enter a numeric latency");
      return;
    }
    setLocalError("");
    const result = await action(
      `/reports/${r.report_id}/telemetry`,
      { avg_load_time_sec: Number(l), last_refresh_status: s },
      "POST",
      "Simulated telemetry published",
    );
    if (result) {
      setLatency(result.avg_load_time_sec);
      setStatus(result.last_refresh_status);
    }
  }
  return (
    <div className="drawer-backdrop" onClick={close}>
      <section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const nodes = [
              ...e.currentTarget.querySelectorAll(
                "button:not(:disabled),input,select",
              ),
            ];
            const first = nodes[0],
              last = nodes.at(-1);
            if (document.activeElement === e.currentTarget) {
              e.preventDefault();
              (e.shiftKey ? last : first)?.focus();
            } else if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="drawer-top">
          <span className="eyebrow">REPORT DETAIL / {r.report_id}</span>
          <button
            aria-label="Close report detail"
            className="icon-button"
            onClick={close}
          >
            <X size={21} />
          </button>
        </div>
        <h2 id="detail-title">{r.report_name}</h2>
        <div className="detail-badges">
          <Badge status={r.last_refresh_status} />
          <span className="subtle-tag">
            {r.telemetry_source === "SIMULATED_LIVE"
              ? "Simulated live"
              : "Source observation"}
          </span>
        </div>
        <dl className="detail-metrics">
          <div>
            <dt>Load latency</dt>
            <dd className={r.avg_load_time_sec > 15 ? "latency-warning" : ""}>
              {r.avg_load_time_sec}s
            </dd>
          </div>
          <div>
            <dt>Monthly active views</dt>
            <dd>{number(r.monthly_active_views)}</dd>
          </div>
          <div>
            <dt>Queries / 30 days</dt>
            <dd>{number(r.query_count_last_30d)}</dd>
          </div>
          <div>
            <dt>Peak concurrent users</dt>
            <dd>{number(r.concurrent_user_peak)}</dd>
          </div>
          {canCost && (
            <>
              <div>
                <dt>Combined cost</dt>
                <dd>{money(r.total_cost_usd, 2)}</dd>
              </div>
              <div>
                <dt>Cost / view</dt>
                <dd>{money(r.cost_per_view_usd, 2)}</dd>
              </div>
            </>
          )}
        </dl>
        <div className="detail-section">
          <h3>Ownership</h3>
          <p>
            {r.owner_email ??
              "No valid owner in the selected source observation."}
          </p>
          {admin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(
                  `/reports/${r.report_id}/owner`,
                  { owner_email: owner },
                  "PATCH",
                  "Owner assigned",
                );
              }}
            >
              <label>
                Assign owner email
                <input
                  type="email"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  required
                />
              </label>
              <button className="secondary" disabled={busy}>
                Save owner
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() =>
                  action(
                    `/reports/${r.report_id}/owner`,
                    { owner_email: "owner@pureinsights.demo" },
                    "PATCH",
                    "Assigned to demo owner",
                  )
                }
              >
                Assign to demo owner
              </button>
            </form>
          )}
          {r.ownership_source === "OPERATIONAL_ASSIGNMENT" && (
            <p>
              Operational assignment · original source owner:{" "}
              {r.source_owner_email ?? "Unassigned"}. Persists across source
              sets.
            </p>
          )}
        </div>
        <div className="detail-section">
          <h3>Source traceability</h3>
          <p>
            CSV row {r.source_row} · Observation set {r.observation}
          </p>
          <div className="flag-list">
            {r.flags.length ? (
              r.flags.map((f) => (
                <span key={f}>{f.replaceAll("_", " ").toLowerCase()}</span>
              ))
            ) : (
              <span>No validation flags</span>
            )}
          </div>
          {canCost && (
            <p className="small-muted">
              Cost estimate uses {money(price, 2)} per credit. Invalid values
              and undefined unit costs remain unavailable.
            </p>
          )}
        </div>
        <EvidencePanel report={r} api={api} canCost={canCost} />
        {canOperate && demo && (
          <div className="detail-section simulator">
            <span className="eyebrow">LIVE EVENT DEMONSTRATION</span>
            <h3>Telemetry simulator</h3>
            <p>
              Send a runtime sample through the backend. This is a labelled
              simulation, not live cloud telemetry.
            </p>
            <label>
              Load latency in seconds
              <input
                aria-label="Simulated load latency"
                type="number"
                min="0"
                max="3600"
                step="0.1"
                value={latency}
                onChange={(e) => setLatency(e.target.value)}
              />
            </label>
            <label>
              Refresh outcome
              <select
                aria-label="Simulated refresh outcome"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {["SUCCESS", "FAILED", "TIMED_OUT", "UNKNOWN"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {localError && (
              <p className="error" role="alert">
                {localError}
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => telemetry(latency, status)}
            >
              <Radio size={16} />
              Publish sample
            </button>
            <div className="simulator-shortcuts">
              <button disabled={busy} onClick={() => telemetry(22, "FAILED")}>
                Slow + failed
              </button>
              <button disabled={busy} onClick={() => telemetry(2.5, "SUCCESS")}>
                Recover report
              </button>
            </div>
            <p className="small-muted">
              Existing conditions do not create duplicate alerts. Recovery
              resolves them only on confirmed recovery. Load / reset clears
              simulated samples; operational owner assignments persist.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
