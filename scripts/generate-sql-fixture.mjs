import { writeFileSync } from "node:fs";
import { loadDataset } from "../server/domain.js";
const rows = loadDataset(
  new URL("../data/reports.csv", import.meta.url),
).filter((r) => r.observation === 1);
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const metric = rows.map(
  (r) =>
    `(${quote(r.report_id)},${r.monthly_active_views},${r.aws_hosting_cost_usd},${r.source_row})`,
);
const queries = [],
  tags = [];
let sum = 0;
for (const r of rows) {
  const id = `DEMO_${r.report_id}`;
  const credit = r.snowflake_credits_consumed ?? -1;
  sum += Math.max(credit, 0);
  queries.push(
    `(${quote(id)},'DEMO_WH','2026-01-01 12:00:00',${credit},'2026-01-02 00:00:00')`,
  );
  tags.push(
    `(${quote(id)},${quote(JSON.stringify({ report_id: r.report_id }))},'2026-01-02 00:00:00')`,
  );
}
// Duplicate query with an older ingested timestamp must NOT double report costs.
queries.push(
  "('DEMO_RPT_200','DEMO_WH','2026-01-01 12:00:00',857.88,'2026-01-01 23:00:00')",
);
tags.push(
  "('DEMO_RPT_200','{\"report_id\":\"RPT_999\"}','2026-01-01 23:00:00')",
);
queries.push(
  "('DEMO_UNTAGGED','DEMO_WH','2026-01-01 12:00:00',12.5,'2026-01-02 00:00:00')",
);
tags.push("('DEMO_UNTAGGED','not-json','2026-01-02 00:00:00')");
const sql = `-- GENERATED deterministic fixture from CSV observation set 1. Rebuild: node scripts/generate-sql-fixture.mjs\n-- Jan 1 2026 is an invented DEMO accounting day, never a source timestamp.\n-- One synthetic query per report carries its aggregate credits; query counts are NOT reconstructed.\n-- Invalid report credit uses a negative sentinel to demonstrate quarantine.\n-- Warehouse billing includes synthetic 20% residual compute and 12.5 untagged credits.\nUSE DATABASE PURE_INSIGHTS_CASE_STUDY;\nUSE SCHEMA MONITORING;\nALTER SESSION SET TIMEZONE = 'UTC';\nINSERT OVERWRITE INTO REPORT_METRICS VALUES\n${metric.join(",\n")};\nINSERT OVERWRITE INTO MOCK_QUERY_HISTORY VALUES\n${tags.join(",\n")};\nINSERT OVERWRITE INTO MOCK_QUERY_ATTRIBUTION_HISTORY VALUES\n${queries.join(",\n")};\nINSERT OVERWRITE INTO MOCK_WAREHOUSE_METERING_HISTORY VALUES\n('DEMO_WH','2026-01-01 00:00:00','2026-01-02 00:00:00',${(sum * 1.2 + 12.5).toFixed(8)});\n`;
writeFileSync(new URL("../sql/02_fixture.sql", import.meta.url), sql);
