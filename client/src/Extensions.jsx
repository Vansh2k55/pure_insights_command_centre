import React, { useEffect, useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
const n = (x, d = 0) =>
  x == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(x);
const usd = (x) =>
  x == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(x);

export function ReplayControls({ state, admin, busy, action }) {
  const [interval, setInterval] = useState(5000);
  return (
    <section className="replay-deck" aria-label="Dataset replay">
      <div className="replay-heading">
        <span className={`signal-dot ${state?.running ? "pulsing" : ""}`} />
        <strong>
          {state?.running ? "Source replay running" : "Replay paused"}
        </strong>
        <span>SIMULATED FEED</span>
      </div>
      <div
        className="replay-track"
        aria-label={`Set ${state?.snapshot ?? 1} of 20`}
      >
        <i style={{ width: `${((state?.snapshot ?? 1) / 20) * 100}%` }} />
      </div>
      <p>
        Replays undated sets in source order. Stops at set 20. This is a
        demonstration, not live cloud data.
      </p>
      {admin && (
        <div className="replay-actions">
          <select
            aria-label="Replay speed"
            value={interval}
            disabled={state?.running}
            onChange={(e) => setInterval(Number(e.target.value))}
          >
            {[1000, 3000, 5000, 10000].map((v) => (
              <option key={v} value={v}>
                {v / 1000}s / set
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={busy || (!state?.running && state?.snapshot === 20)}
            onClick={() =>
              action(
                "/replay",
                {
                  action: state?.running ? "pause" : "start",
                  interval_ms: interval,
                },
                "POST",
                state?.running ? "Replay paused" : "Replay started",
              )
            }
          >
            {state?.running ? <Pause size={15} /> : <Play size={15} />}{" "}
            {state?.running ? "Pause replay" : "Start replay"}
          </button>
          <button
            className="secondary"
            disabled={busy || state?.snapshot === 20}
            onClick={() =>
              action(
                "/replay",
                { action: "step" },
                "POST",
                "Advanced one source set",
              )
            }
          >
            <SkipForward size={15} />
            Step
          </button>
        </div>
      )}
    </section>
  );
}
export function HealthHighlights({ reports, summary, onInspect }) {
  const sorted = reports
    .filter((r) => r.avg_load_time_sec !== null)
    .map((r) => r.avg_load_time_sec)
    .sort((a, b) => a - b);
  const percentile = (p) =>
    sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
  return (
    <div className="health-highlights">
      <section className="health-hero">
        <span className="eyebrow">WORKSPACE HEALTH</span>
        <div>
          <strong>
            {summary.reports
              ? Math.round((summary.healthy / summary.reports) * 100)
              : 0}
            <small>%</small>
          </strong>
          <p>
            Reports with a confirmed successful refresh,
            <br />
            latency ≤15s and an accountable owner.
          </p>
        </div>
        <div className="health-meter">
          <i
            style={{
              width: `${summary.reports ? (summary.healthy / summary.reports) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="health-stats">
          <span>
            Median latency <b>{n(percentile(0.5), 2)}s</b>
          </span>
          <span>
            P95 latency <b>{n(percentile(0.95), 2)}s</b>
          </span>
          <span>
            Active scope <b>{summary.reports} reports</b>
          </span>
        </div>
      </section>
      <section className="health-watch">
        <span className="eyebrow">PRIORITY WATCH</span>
        <h2>Slowest report loads</h2>
        {[...reports]
          .sort(
            (a, b) => (b.avg_load_time_sec ?? -1) - (a.avg_load_time_sec ?? -1),
          )
          .slice(0, 3)
          .map((r) => (
            <button key={r.report_id} onClick={() => onInspect(r)}>
              <div>
                <strong>{r.report_name}</strong>
                <small>
                  {r.report_id} · CSV row {r.source_row}
                </small>
              </div>
              <b>{n(r.avg_load_time_sec, 2)}s</b>
              <ArrowUpRight size={16} />
            </button>
          ))}
        {!reports.length && <p>No reports are assigned to this account.</p>}
      </section>
    </div>
  );
}
export function CostVerification({ data }) {
  if (!data) return null;
  return (
    <section className="panel verification-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EXECUTED SQL · SYNTHETIC FIXTURE</span>
          <h2>Cost verification lab</h2>
        </div>
        <span className="verification-count">
          <ShieldCheck size={17} />
          {data.passed} / {data.total} checks
        </span>
      </div>
      <p className="panel-note">{data.scope}</p>
      <div className="verification-grid">
        {data.checks.map((c) => (
          <div key={c.name}>
            {c.status === "PASS" ? (
              <CheckCircle2 size={17} />
            ) : (
              <AlertTriangle size={17} />
            )}
            <div>
              <strong>{c.name}</strong>
              <p>{c.detail}</p>
            </div>
            <span>{c.status}</span>
          </div>
        ))}
      </div>
      <div className="reconciliation">
        <span>
          Report credits <b>{n(data.fixture.report_credits, 2)}</b>
        </span>
        <span>
          Unallocated queries{" "}
          <b>{n(data.fixture.unallocated_query_credits, 2)}</b>
        </span>
        <span>
          Unattributed metering{" "}
          <b>{n(data.fixture.unattributed_billed_credits, 2)}</b>
        </span>
        <span>
          Synthetic metered credits{" "}
          <b>{n(data.fixture.synthetic_metered_credits, 2)}</b>
        </span>
      </div>
      <details>
        <summary>Fixture assumptions and verification limits</summary>
        {data.assumptions.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </details>
    </section>
  );
}
export function CostAnalysis({ data, reports }) {
  const [mode, setMode] = useState("chargeback");
  if (!data) return null;
  const valid = reports.filter((r) => r.total_cost_usd !== null),
    maxViews = Math.max(...valid.map((r) => r.monthly_active_views), 1),
    maxCost = Math.max(...valid.map((r) => r.total_cost_usd), 1);
  return (
    <section className="panel analysis-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ECONOMICS EXPLORER</span>
          <h2>Allocation and sensitivity</h2>
        </div>
        <div className="segmented">
          {["chargeback", "scatter", "sensitivity", "proxy"].map((x) => (
            <button
              key={x}
              className={mode === x ? "selected" : ""}
              onClick={() => setMode(x)}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
      {mode === "chargeback" && (
        <>
          <p className="panel-note">
            Selected operational owner; cost-complete reports only. Missing
            costs remain outside chargeback. Ownership is not validated by the
            CSV.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Reports</th>
                  <th>Matched views</th>
                  <th>Combined cost</th>
                  <th>Cost / view</th>
                </tr>
              </thead>
              <tbody>
                {data.chargeback.map((g) => (
                  <tr key={g.owner}>
                    <td>{g.owner}</td>
                    <td>{g.reports}</td>
                    <td>{n(g.views)}</td>
                    <td>{usd(g.total_usd)}</td>
                    <td>{usd(g.cost_per_view_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {mode === "scatter" && (
        <>
          <p className="panel-note">
            Each dot is one cost-complete report. Compare spend with active
            views; hover a point for its exact evidence. The report table below
            supplies the same values.
          </p>
          <div className="scatter">
            <svg
              viewBox="0 0 760 300"
              role="img"
              aria-label="Report combined cost versus monthly active views"
            >
              <line x1="65" y1="245" x2="720" y2="245" />
              <line x1="65" y1="25" x2="65" y2="245" />
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <line
                    className="gridline"
                    x1="65"
                    y1={245 - f * 210}
                    x2="720"
                    y2={245 - f * 210}
                  />
                  <text x="52" y={250 - f * 210} textAnchor="end">
                    ${n(f * maxCost)}
                  </text>
                  <text x={65 + f * 645} y="268" textAnchor="middle">
                    {n(f * maxViews)}
                  </text>
                </g>
              ))}
              {valid.map((r) => (
                <circle
                  key={r.report_id}
                  cx={65 + (r.monthly_active_views / maxViews) * 645}
                  cy={245 - (r.total_cost_usd / maxCost) * 210}
                  r="4.5"
                >
                  <title>
                    {r.report_id}: {n(r.monthly_active_views)} views ·{" "}
                    {usd(r.total_cost_usd)}
                  </title>
                </circle>
              ))}
              <text x="385" y="293" textAnchor="middle">
                Monthly active views (not unique users)
              </text>
            </svg>
          </div>
        </>
      )}
      {mode === "sensitivity" && (
        <>
          <p className="panel-note">
            Hypothetical credit prices, not provider quotations. Same
            cost-complete population and hosting cost in every case.
          </p>
          <div className="sensitivity-cards">
            {data.sensitivity.map((p) => (
              <div key={p.price}>
                <span>${p.price.toFixed(2)} / credit</span>
                <strong>{usd(p.total_usd)}</strong>
                <p>{usd(p.cost_per_view_usd)} / matched view</p>
              </div>
            ))}
          </div>
        </>
      )}
      {mode === "proxy" && (
        <>
          <p className="panel-note">
            {data.proxy_note} Missing direct credits remain unavailable even
            when the proxy returns an estimate.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Direct source credits</th>
                  <th>Query-count proxy</th>
                </tr>
              </thead>
              <tbody>
                {data.proxy.map((r) => (
                  <tr key={r.report_id}>
                    <td>{r.report_id}</td>
                    <td>{n(r.direct_credits, 2)}</td>
                    <td>{n(r.query_count_proxy_credits, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
export function EvidencePanel({ report, api, canCost }) {
  const [data, setData] = useState(null),
    [history, setHistory] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([
      api(`/reports/${report.report_id}/explanation`),
      api(`/reports/${report.report_id}/history`),
    ])
      .then(([d, h]) => {
        if (active) {
          setData(d);
          setHistory(h);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [
    report.report_id,
    report.source_row,
    report.avg_load_time_sec,
    report.last_refresh_status,
    report.owner_email,
  ]);
  return (
    <div className="detail-section evidence-panel">
      <h3>
        <Sparkles size={17} /> Evidence assistant
      </h3>
      <p>
        Deterministic, source-grounded triage. No AI model or inferred root
        cause.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.findings.map((f, i) => (
        <div key={i} className="finding">
          <span className={`severity ${f.level}`}>{f.level}</span>
          <strong>{f.finding}</strong>
          <p>{f.next_step}</p>
        </div>
      ))}
      {data && (
        <details>
          <summary>Inspect the evidence</summary>
          {data.evidence.map((e) => (
            <p key={e.field}>
              <code>{e.field}</code>: {String(e.value ?? "Unavailable")} ·{" "}
              {e.source} · original CSV row {e.source_row}
            </p>
          ))}
        </details>
      )}
      {history && (
        <details>
          <summary>All {history.items.length} source observations</summary>
          <p>
            {history.scope} Runtime overrides and owner assignments do not
            rewrite this history.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Set / row</th>
                  <th>Refresh</th>
                  <th>Latency</th>
                  <th>Source owner</th>
                  {canCost && <th>Cost / view</th>}
                </tr>
              </thead>
              <tbody>
                {history.items.map((r) => (
                  <tr key={r.source_row}>
                    <td>
                      {r.observation} / {r.source_row}
                    </td>
                    <td>{r.last_refresh_status}</td>
                    <td>{n(r.avg_load_time_sec, 2)}s</td>
                    <td>{r.owner_email ?? "Unassigned"}</td>
                    {canCost && <td>{usd(r.cost_per_view_usd)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
export function UserAccess({ api, action, busy, revision, currentUser }) {
  const [users, setUsers] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("/users")
      .then((r) => {
        if (active) setUsers(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <section className="panel access-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SERVER-ENFORCED ACCESS</span>
          <h2>Workspace accounts</h2>
        </div>
      </div>
      <p className="panel-note">
        Role changes and account disabling revoke existing sessions immediately.
        Administrator self-changes are blocked. The owner role sees assigned
        reports only.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>{u.email}</td>
                <td>
                  <select
                    aria-label={`Role for ${u.email}`}
                    value={u.role}
                    disabled={busy || u.email === currentUser.email}
                    onChange={(e) =>
                      action(
                        `/users/${encodeURIComponent(u.email)}`,
                        { role: e.target.value, active: !!u.active },
                        "PATCH",
                        "Account access updated",
                      )
                    }
                  >
                    {["admin", "engineer", "analyst", "viewer", "owner"].map(
                      (r) => (
                        <option key={r}>{r}</option>
                      ),
                    )}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Active ${u.email}`}
                    checked={!!u.active}
                    disabled={busy || u.email === currentUser.email}
                    onChange={(e) =>
                      action(
                        `/users/${encodeURIComponent(u.email)}`,
                        { role: u.role, active: e.target.checked },
                        "PATCH",
                        "Account access updated",
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
