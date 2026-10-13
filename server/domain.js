import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

export const STATUSES = ["SUCCESS", "FAILED", "TIMED_OUT", "UNKNOWN"];
export const LATENCY_THRESHOLD = 15;
export const ROLES = ["admin", "engineer", "analyst", "viewer", "owner"];
const numeric = [
  "monthly_active_views",
  "snowflake_credits_consumed",
  "avg_load_time_sec",
  "aws_hosting_cost_usd",
  "query_count_last_30d",
  "concurrent_user_peak",
];
const required = [
  "report_id",
  "report_name",
  "owner_email",
  "last_refresh_status",
  ...numeric,
];
export function loadDataset(path) {
  const input = parse(readFileSync(path, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  if (!input.length || required.some((k) => !(k in input[0])))
    throw new Error("Dataset has missing required columns");
  const ordinals = new Map();
  return input.map((raw, index) => {
    const id = raw.report_id.trim();
    if (!/^RPT_\d+$/.test(id))
      throw new Error(`Invalid report id at source row ${index + 2}`);
    const observation = (ordinals.get(id) || 0) + 1;
    ordinals.set(id, observation);
    const owner = raw.owner_email.trim().toLowerCase();
    const ownerValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner);
    const row = {
      ...raw,
      report_id: id,
      report_name: raw.report_name.trim(),
      owner_email: ownerValid ? owner : null,
      last_refresh_status: raw.last_refresh_status.trim().toUpperCase(),
      observation,
      source_row: index + 2,
      flags: [],
    };
    for (const k of numeric) {
      row[k] = raw[k].trim() === "" ? null : Number(raw[k]);
      if (
        row[k] === null ||
        !Number.isFinite(row[k]) ||
        row[k] < 0 ||
        ([
          "monthly_active_views",
          "query_count_last_30d",
          "concurrent_user_peak",
        ].includes(k) &&
          !Number.isInteger(row[k]))
      ) {
        row.flags.push(`INVALID_${k.toUpperCase()}`);
        row[k] = null;
      }
    }
    if (!ownerValid) row.flags.push("ORPHANED_REPORT");
    if (!STATUSES.includes(row.last_refresh_status)) {
      row.last_refresh_status = "UNKNOWN";
      row.flags.push("INVALID_REFRESH_STATUS");
    }
    if (row.last_refresh_status === "UNKNOWN")
      row.flags.push("UNKNOWN_REFRESH_STATUS");
    if (row.monthly_active_views === 0) row.flags.push("ZERO_VIEWS");
    // Review heuristic, not proof of an incorrect bill. Zero denominator remains undefined.
    if (row.monthly_active_views === 0 && row.aws_hosting_cost_usd > 0)
      row.flags.push("AWS_COST_WITHOUT_VIEWS");
    else if (
      row.monthly_active_views > 0 &&
      row.aws_hosting_cost_usd / row.monthly_active_views > 1
    )
      row.flags.push("HIGH_AWS_COST_PER_VIEW");
    return row;
  });
}
export function datasetAudit(rows) {
  const reportIds = [...new Set(rows.map((r) => r.report_id))];
  const counts = {};
  for (const r of rows)
    for (const flag of r.flags) counts[flag] = (counts[flag] || 0) + 1;
  const owners = reportIds.filter(
    (id) =>
      new Set(
        rows
          .filter((r) => r.report_id === id && r.owner_email)
          .map((r) => r.owner_email),
      ).size > 1,
  ).length;
  return {
    rows: rows.length,
    distinct_reports: reportIds.length,
    observation_sets: Math.max(...rows.map((r) => r.observation)),
    flags: counts,
    ownership_conflicts: owners,
    slow_observations: rows.filter((r) => r.avg_load_time_sec > 15).length,
    refresh_statuses: Object.fromEntries(
      STATUSES.map((s) => [
        s,
        rows.filter((r) => r.last_refresh_status === s).length,
      ]),
    ),
    interpretation:
      "Each set selects the nth occurrence per report in source order. Sets are undated scenarios, not months or a chronology.",
  };
}
export function costs(row, price) {
  const credits = row.snowflake_credits_consumed;
  const snow = credits === null ? null : credits * price;
  const total =
    snow === null || row.aws_hosting_cost_usd === null
      ? null
      : snow + row.aws_hosting_cost_usd;
  const views = row.monthly_active_views;
  return {
    snowflake_cost_usd: snow,
    total_cost_usd: total,
    credits_per_view: views > 0 && credits !== null ? credits / views : null,
    cost_per_view_usd: views > 0 && total !== null ? total / views : null,
    aws_cost_per_view_usd:
      views > 0 && row.aws_hosting_cost_usd !== null
        ? row.aws_hosting_cost_usd / views
        : null,
  };
}
export function publicReport(row, role, price) {
  const copy = { ...row, flags: [...row.flags] };
  if (!["admin", "analyst"].includes(role)) {
    delete copy.snowflake_credits_consumed;
    delete copy.aws_hosting_cost_usd;
    copy.flags = copy.flags.filter(
      (f) => !f.includes("CREDIT") && !f.includes("AWS"),
    );
  } else Object.assign(copy, costs(row, price));
  return copy;
}
export function summarize(rows, role, price) {
  const sum = {
    reports: rows.length,
    orphans: rows.filter((r) => !r.owner_email).length,
    slow: rows.filter((r) => r.avg_load_time_sec > 15).length,
    refresh_failures: rows.filter((r) =>
      ["FAILED", "TIMED_OUT"].includes(r.last_refresh_status),
    ).length,
    unknown_refresh: rows.filter((r) => r.last_refresh_status === "UNKNOWN")
      .length,
    successful_refreshes: rows.filter(
      (r) => r.last_refresh_status === "SUCCESS",
    ).length,
    healthy: rows.filter(
      (r) =>
        r.last_refresh_status === "SUCCESS" &&
        r.avg_load_time_sec !== null &&
        r.avg_load_time_sec <= 15 &&
        r.owner_email,
    ).length,
    views: rows.reduce((n, r) => n + (r.monthly_active_views ?? 0), 0),
  };
  if (["admin", "analyst"].includes(role)) {
    const complete = rows.filter(
      (r) => costs(r, price).total_cost_usd !== null,
    );
    const valid = rows.filter((r) => r.snowflake_credits_consumed !== null);
    const denominator = complete.reduce(
      (n, r) => n + (r.monthly_active_views ?? 0),
      0,
    );
    Object.assign(sum, {
      credit_price_usd: price,
      valid_credits: valid.reduce(
        (n, r) => n + r.snowflake_credits_consumed,
        0,
      ),
      known_total_cost_usd: complete.reduce(
        (n, r) => n + costs(r, price).total_cost_usd,
        0,
      ),
      invalid_credit_reports: rows.length - valid.length,
      complete_cost_reports: complete.length,
      portfolio_cost_per_view_usd:
        denominator > 0
          ? complete.reduce((n, r) => n + costs(r, price).total_cost_usd, 0) /
            denominator
          : null,
      cost_denominator_views: denominator,
      cost_review_reports: rows.filter((r) =>
        r.flags.some((f) => f.includes("AWS")),
      ).length,
    });
  }
  return sum;
}
export function validateTelemetry(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return "Expected a JSON object";
  if (
    Object.keys(body).some(
      (k) => !["avg_load_time_sec", "last_refresh_status"].includes(k),
    )
  )
    return "Unsupported telemetry field";
  if (
    typeof body.avg_load_time_sec !== "number" ||
    !Number.isFinite(body.avg_load_time_sec) ||
    body.avg_load_time_sec < 0 ||
    body.avg_load_time_sec > 3600
  )
    return "Latency must be a finite number from 0 to 3600 seconds";
  if (!STATUSES.includes(body.last_refresh_status))
    return "Refresh status must be SUCCESS, FAILED, TIMED_OUT or UNKNOWN";
  return null;
}
export function csvExport(rows, role, price) {
  const mapped = rows.map((r) => publicReport(r, role, price));
  const columns = [
    "report_id",
    "report_name",
    "owner_email",
    "last_refresh_status",
    "monthly_active_views",
    "avg_load_time_sec",
    "query_count_last_30d",
    "concurrent_user_peak",
    "observation",
    "source_row",
    "flags",
  ];
  if (["admin", "analyst"].includes(role))
    columns.push(
      "snowflake_credits_consumed",
      "aws_hosting_cost_usd",
      "snowflake_cost_usd",
      "total_cost_usd",
      "cost_per_view_usd",
    );
  const cell = (value) => {
    let s = Array.isArray(value) ? value.join(";") : String(value ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    columns.join(",") +
    "\r\n" +
    mapped.map((row) => columns.map((k) => cell(row[k])).join(",")).join("\r\n")
  );
}
