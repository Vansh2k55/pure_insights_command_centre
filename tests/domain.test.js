import test from "node:test";
import assert from "node:assert/strict";
import {
  loadDataset,
  datasetAudit,
  costs,
  summarize,
  publicReport,
  validateTelemetry,
  csvExport,
} from "../server/domain.js";
const rows = loadDataset(new URL("../data/reports.csv", import.meta.url));
test("source audit matches independently established counts and observation grain", () => {
  const a = datasetAudit(rows);
  assert.equal(a.rows, 2000);
  assert.equal(a.distinct_reports, 100);
  assert.equal(a.observation_sets, 20);
  assert.equal(a.flags.ORPHANED_REPORT, 245);
  assert.equal(a.flags.INVALID_SNOWFLAKE_CREDITS_CONSUMED, 24);
  assert.equal(a.flags.ZERO_VIEWS, 4);
  assert.equal(a.ownership_conflicts, 100);
  assert.equal(a.slow_observations, 1490);
  assert.deepEqual(a.refresh_statuses, {
    SUCCESS: 1336,
    FAILED: 382,
    TIMED_OUT: 182,
    UNKNOWN: 100,
  });
  for (let n = 1; n <= 20; n++) {
    const selected = rows.filter((r) => r.observation === n);
    assert.equal(selected.length, 100);
    assert.equal(new Set(selected.map((r) => r.report_id)).size, 100);
  }
});
test("invalid credits are null; original negative amount is preserved only in raw evidence", () => {
  const r = rows.find((r) =>
    r.flags.includes("INVALID_SNOWFLAKE_CREDITS_CONSUMED"),
  );
  assert.equal(r.snowflake_credits_consumed, null);
  assert.equal(costs(r, 3).total_cost_usd, null);
});
test("unit costs use matching population; zero denominators remain undefined", () => {
  const base = {
    ...rows[0],
    monthly_active_views: 10,
    snowflake_credits_consumed: 2,
    aws_hosting_cost_usd: 4,
  };
  assert.equal(costs(base, 3).cost_per_view_usd, 1);
  assert.equal(
    costs({ ...base, monthly_active_views: 0 }, 3).cost_per_view_usd,
    null,
  );
  const invalid = {
    ...base,
    monthly_active_views: 10000,
    snowflake_credits_consumed: null,
  };
  const s = summarize([base, invalid], "analyst", 3);
  assert.equal(s.portfolio_cost_per_view_usd, 1);
  assert.equal(s.cost_denominator_views, 10);
  assert.equal(s.complete_cost_reports, 1);
});
test("viewer projection excludes cost values, derived metrics and sensitive cost flags", () => {
  const r = publicReport(rows[0], "viewer", 3);
  assert.ok(!("snowflake_credits_consumed" in r));
  assert.ok(!("aws_hosting_cost_usd" in r));
  assert.ok(!("total_cost_usd" in r));
  assert.ok(!("known_total_cost_usd" in summarize(rows, "viewer", 3)));
  assert.ok(
    !csvExport([rows[0]], "viewer", 3).includes("snowflake_credits_consumed"),
  );
});
test("telemetry rejects missing, negative, unknown and unexpected fields", () => {
  for (const data of [
    {},
    { avg_load_time_sec: -1, last_refresh_status: "SUCCESS" },
    { avg_load_time_sec: "12", last_refresh_status: "SUCCESS" },
    { avg_load_time_sec: 12, last_refresh_status: "BAD" },
    { avg_load_time_sec: 12, last_refresh_status: "SUCCESS", role: "admin" },
  ])
    assert.ok(validateTelemetry(data));
  assert.equal(
    validateTelemetry({
      avg_load_time_sec: 15,
      last_refresh_status: "UNKNOWN",
    }),
    null,
  );
});
test("CSV export escapes formula injection and embedded quotes", () => {
  const csv = csvExport(
    [{ ...rows[0], report_name: '=HYPERLINK("bad")' }],
    "viewer",
    3,
  );
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
});
