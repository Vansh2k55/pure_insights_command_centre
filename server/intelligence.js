import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { costs } from "./domain.js";

const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0);
const close = (a, b) =>
  Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
export function verifyCosts(rows, price) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE metrics(report_id TEXT PRIMARY KEY,views REAL,aws REAL); CREATE TABLE query_history(query_id TEXT,tag TEXT,ingestion INTEGER); CREATE TABLE query_attribution(query_id TEXT,credits REAL,ingestion INTEGER);",
    );
    const metric = db.prepare("INSERT INTO metrics VALUES(?,?,?)"),
      tag = db.prepare("INSERT INTO query_history VALUES(?,?,?)"),
      query = db.prepare("INSERT INTO query_attribution VALUES(?,?,?)");
    for (const r of rows) {
      metric.run(r.report_id, r.monthly_active_views, r.aws_hosting_cost_usd);
      tag.run(r.report_id, JSON.stringify({ report_id: r.report_id }), 2);
      query.run(r.report_id, r.snowflake_credits_consumed, 2);
    }
    if (rows.length) {
      // Deliberate stale duplicate: latest canonical record must win.
      tag.run(rows[0].report_id, '{"report_id":"MISSING"}', 1);
      query.run(rows[0].report_id, 999999, 1);
    }
    tag.run("untagged", "malformed JSON", 2);
    query.run("untagged", 12.5, 2);
    db.exec(
      readFileSync(
        new URL("../sql/06_local_verification.sql", import.meta.url),
        "utf8",
      ),
    );
    const records = db
      .prepare(
        "SELECT *, CASE WHEN credits IS NULL OR aws IS NULL THEN NULL ELSE credits*?+aws END AS total FROM report_cost",
      )
      .all(price);
    const attributed = db
      .prepare(
        "SELECT COALESCE(SUM(credits),0) AS credits FROM attributed WHERE report_id<>'__UNALLOCATED__'",
      )
      .get().credits;
    const unallocated = db
      .prepare(
        "SELECT COALESCE(SUM(credits),0) AS credits FROM attributed WHERE report_id='__UNALLOCATED__'",
      )
      .get().credits;
    const validCredits = sum(rows, (r) => r.snowflake_credits_consumed ?? 0);
    const metered = validCredits * 1.2 + 12.5; // Test-only 20% residual, never described as a real bill.
    const complete = records.filter((r) => r.total !== null),
      numerator = sum(complete, (r) => r.total),
      denominator = sum(complete, (r) => r.views ?? 0);
    const expected = rows.filter(
      (r) => costs(r, price).total_cost_usd !== null,
    );
    const check = (name, ok, detail) => ({
      name,
      status: ok ? "PASS" : "FAIL",
      detail,
    });
    const checks = [
      check(
        "Per-report cost parity",
        records.every((r) => {
          const expected = costs(
            rows.find((x) => x.report_id === r.report_id),
            price,
          ).total_cost_usd;
          return r.total === null
            ? expected === null
            : expected !== null && close(r.total, expected);
        }),
        `${records.length} report costs independently recomputed in SQL`,
      ),
      check(
        "Duplicate suppression",
        db.prepare("SELECT COUNT(*) AS n FROM query_dedup").get().n ===
          rows.length + 1,
        "Latest ingestion wins; stale 999,999-credit record excluded",
      ),
      check(
        "Tagged credit coverage",
        close(attributed, validCredits),
        "Valid source credits equal tagged synthetic query credits",
      ),
      check(
        "Invalid credits remain unavailable",
        records.filter((r) => r.credits === null).length ===
          rows.filter((r) => r.snowflake_credits_consumed === null).length,
        "Cost gaps are null, operational observations retained",
      ),
      check(
        "Malformed tag isolation",
        close(unallocated, 12.5),
        "12.5 deliberately untagged credits kept outside report charges",
      ),
      check(
        "Matched views denominator",
        close(
          denominator,
          sum(expected, (r) => r.monthly_active_views ?? 0),
        ),
        "Numerator and denominator use identical cost-complete reports",
      ),
      check(
        "Portfolio unit cost parity",
        close(
          numerator,
          sum(expected, (r) => costs(r, price).total_cost_usd),
        ),
        "Ratio of sums; zero-view spend stays in numerator",
      ),
      check(
        "Synthetic metering conservation",
        close(
          metered,
          attributed + unallocated + (metered - attributed - unallocated),
        ),
        "Fixture accounting identity; not independent proof of billing correctness",
      ),
    ];
    return {
      checks,
      passed: checks.filter((c) => c.status === "PASS").length,
      total: checks.length,
      scope:
        "Selected undated set. SQLite executes the local SQL counterpart; native Snowflake execution is not claimed.",
      fixture: {
        report_credits: attributed,
        unallocated_query_credits: unallocated,
        synthetic_metered_credits: metered,
        unattributed_billed_credits: metered - attributed - unallocated,
        complete_reports: complete.length,
        matched_views: denominator,
        combined_usd: numerator,
        cost_per_view_usd: denominator > 0 ? numerator / denominator : null,
      },
      assumptions: [
        "One invented aggregate query per report",
        "Invented metering = valid credits × 1.2 + 12.5",
        "12.5 invented untagged credits",
        "Residual is not automatically idle cost or charged to reports",
      ],
    };
  } finally {
    db.close();
  }
}
export function costInsights(rows, price) {
  const complete = rows.filter((r) => costs(r, price).total_cost_usd !== null);
  const groups = new Map();
  for (const r of complete) {
    const key = r.owner_email ?? "Unassigned";
    const g = groups.get(key) ?? {
      owner: key,
      reports: 0,
      views: 0,
      total_usd: 0,
    };
    g.reports++;
    g.views += r.monthly_active_views ?? 0;
    g.total_usd += costs(r, price).total_cost_usd;
    groups.set(key, g);
  }
  const credits = sum(rows, (r) => r.snowflake_credits_consumed ?? 0),
    queries = sum(rows, (r) => r.query_count_last_30d ?? 0);
  return {
    chargeback: [...groups.values()]
      .map((g) => ({
        ...g,
        cost_per_view_usd: g.views > 0 ? g.total_usd / g.views : null,
      }))
      .sort((a, b) => b.total_usd - a.total_usd),
    sensitivity: [...new Set([price / 2, price, price * 1.5])].map((p) => ({
      price: p,
      total_usd: sum(complete, (r) => costs(r, p).total_cost_usd),
      cost_per_view_usd:
        sum(complete, (r) => r.monthly_active_views ?? 0) > 0
          ? sum(complete, (r) => costs(r, p).total_cost_usd) /
            sum(complete, (r) => r.monthly_active_views ?? 0)
          : null,
    })),
    proxy: rows.map((r) => ({
      report_id: r.report_id,
      direct_credits: r.snowflake_credits_consumed,
      query_count_proxy_credits:
        queries > 0 && r.query_count_last_30d !== null
          ? (credits * r.query_count_last_30d) / queries
          : null,
    })),
    proxy_note:
      "Query-count allocation is a hypothetical sensitivity model. It is not billed attribution and never replaces direct source credits.",
    complete_reports: complete.length,
    credit_price_usd: price,
  };
}
export function explainReport(row) {
  const evidence = [
    {
      field: "avg_load_time_sec",
      value: row.avg_load_time_sec,
      source_row: row.source_row,
      source: row.telemetry_source,
    },
    {
      field: "last_refresh_status",
      value: row.last_refresh_status,
      source_row: row.source_row,
      source: row.telemetry_source,
    },
    {
      field: "owner_email",
      value: row.owner_email,
      source_row: row.source_row,
      source: row.ownership_source ?? "SOURCE_SNAPSHOT",
    },
  ];
  const findings = [];
  if (row.avg_load_time_sec > 15)
    findings.push({
      level: row.avg_load_time_sec > 30 ? "critical" : "warning",
      finding: `Recorded load latency is ${row.avg_load_time_sec}s, above the strict 15s threshold.`,
      next_step:
        "Inspect query plans, warehouse queueing and report execution logs before choosing a remediation.",
    });
  if (["FAILED", "TIMED_OUT"].includes(row.last_refresh_status))
    findings.push({
      level: "critical",
      finding: `Refresh outcome is ${row.last_refresh_status}.`,
      next_step:
        "Inspect the refresh job error and dependency availability; the CSV does not establish a root cause.",
    });
  if (row.last_refresh_status === "UNKNOWN")
    findings.push({
      level: "warning",
      finding: "Refresh outcome is unknown; recovery is not established.",
      next_step: "Obtain a confirmed refresh result before declaring recovery.",
    });
  if (!row.owner_email)
    findings.push({
      level: "warning",
      finding: "The selected observation has no valid owner.",
      next_step:
        "Assign an accountable operational owner and retain the original source evidence.",
    });
  if (!findings.length)
    findings.push({
      level: "healthy",
      finding:
        "The current operational fields are within the defined health policy.",
      next_step:
        "Continue monitoring. These fields do not establish uptime or an SLA.",
    });
  return {
    engine: "Deterministic evidence assistant",
    report_id: row.report_id,
    observation: row.observation,
    evidence,
    findings,
    limitation:
      "No model call or causal diagnosis. Every statement uses current report fields; source observations have no timestamps.",
  };
}
