# Snowflake cost allocation guide

The brief asks for SQL against **simulated** ACCOUNT_USAGE logs. The CSV supplies report-level credits but no query logs, warehouses, query tags or dates. This suite makes that gap explicit, constructs a repeatable fixture, attributes valid compute to reports, and exposes unattributed billing rather than fabricating complete allocation.

## Execution order

Use a Snowflake worksheet with a role permitted to create the isolated assessment database and a running warehouse. Run these files in order:

1. `sql/01_schema.sql` creates the dedicated database, schema and mock tables.
2. `sql/02_fixture.sql` loads the deterministic observation-set-1 fixture. INSERT OVERWRITE replaces only these demo tables so the fixture is reproducible.
3. `sql/03_cost_attribution.sql` creates validation, deduplication, attribution, report-cost and reconciliation views.
4. `sql/04_acceptance_checks.sql` returns ten boolean checks. Each should be true for the supplied fixture.

The local application works without running any Snowflake script. No Snowflake engine execution was performed while producing this package. Syntax was parsed as Snowflake SQL, and fixture semantics passed in DuckDB using two explicit dialect adapters in `tests/sql_validation.py`.

## What the fixture represents

`node scripts/generate-sql-fixture.mjs` rebuilds file 02 from the unmodified CSV. It selects the first occurrence of each report, using the same scenario as the UI. One synthetic query per report carries its aggregate supplied credit value; this does not claim to reconstruct thousands of actual queries. An invalid source credit is represented by a negative sentinel to test quarantine. January 1, 2026 is an invented accounting day, not a source-data date.

The fixture also includes an older duplicate query/tag record, a malformed/untagged query consuming 12.5 credits, and synthetic warehouse metering with 20% additional compute. The latest query/tag ingestion wins. These additions test realistic allocation gaps; they are not inferred from the supplied CSV.

## Allocation rules

| Input                         | Policy                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Query attribution records     | One canonical record per query_id, ordered by ingestion timestamp and deterministic tie-break |
| Negative/null query credits   | Quarantine; exclude from direct-credit sums; associated report cost is incomplete             |
| Valid report query tag        | Allocate direct credits to its known report_id                                                |
| Missing/malformed/unknown tag | Explicit `__UNALLOCATED__` bucket                                                             |
| Warehouse billed compute      | Reconcile to direct report compute + unallocated query compute + remaining billed compute     |
| Remaining billed compute      | Display separately; do not silently distribute it to report views                             |
| Overattribution               | Preserve signed residual and flag review; never clamp it to hide a mismatch                   |
| USD conversion                | Explicit $3/credit assumption in this assessment fixture                                      |
| Cost/view                     | Divide report complete cost by matching views using NULLIF; zero views remain null            |

The residual is called **unattributed billed compute**, not proven idle time: actual residuals can include idle usage, short queries absent from attribution, refresh delays or period-boundary effects. The controlled fixture intentionally creates it as a 20% overhead. Report per-view totals exclude that residual and the unallocated query bucket. They estimate direct report credits plus the supplied report AWS costs; they are not a fully loaded invoice allocation.

## Expected fixture controls

| Quantity                                    | Expected    |
| ------------------------------------------- | ----------- |
| Known report direct credits                 | 54,674.26   |
| Untagged query credits                      | 12.50       |
| Unattributed billed compute                 | 10,934.852  |
| Warehouse billed compute                    | 65,621.612  |
| Reports                                     | 100         |
| Cost-incomplete report                      | 1           |
| Combined complete report costs at $3/credit | $188,417.87 |

Query acceleration, cloud-services credits, storage, data transfer and serverless costs are outside the fixture's warehouse-compute scope. They should be separate cost classes in a real implementation. AWS hosting figures are supplied per report and are not attributed through Snowflake SQL.

## Real-account adapter

`sql/05_real_account_usage_adapter.sql` is optional and not run by the app. It reads official `SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY` and `WAREHOUSE_METERING_HISTORY` into a documented query pattern. It uses valid JSON report tags, keeps missing tags visible, treats query acceleration separately, and uses a complete 30-day window with a conservative lag cutoff. The role requires appropriate Snowflake database-role access.

Production report-view counts must use exactly the same billing window. Standard warehouse attribution has visibility delays, can omit very short queries, and is not a real-time alert feed. Adaptive Warehouses use a different query-metering view. Before deployment, verify the account type, permissions, view freshness, query-boundary handling and authoritative unique report inventory. Do not infer the missing source measurement window from the demo date.

## Interactive SQL verification lab

The Cost intelligence screen executes `sql/06_local_verification.sql` in Node's in-memory SQLite engine against the selected source set. It creates one aggregate synthetic query per report, an intentionally stale duplicate and a malformed-tag 12.5-credit query. The native Snowflake fixture remains scripts 01–04; script 06 is expressly a SQLite counterpart, not a sixth Snowflake worksheet.

Eight checks compare report costs/coverage, canonical query count, tagged credits, invalid-credit nulls, unallocated tags, matched views, portfolio totals and fixture conservation. Node tests repeat these calculations for all twenty sets at prices 0, 3 and 4.5. The UI honours CREDIT_PRICE_USD; the static Snowflake example assumes $3. Change its explicit conversion constant and expected controls together if exploring another price.

The residual is synthetic and excluded from direct report charges. The conservation identity alone is circular fixture bookkeeping; the other parity/coverage checks and independent raw-CSV controls establish separate computational checks. Neither proves a real provider invoice. The independent standard-library validator is `python scripts/validate-independent.py`.

## Official references

- [QUERY_ATTRIBUTION_HISTORY](https://docs.snowflake.com/en/sql-reference/account-usage/query_attribution_history): direct query warehouse credits, separate query acceleration, exclusions and latency.
- [WAREHOUSE_METERING_HISTORY](https://docs.snowflake.com/en/sql-reference/account-usage/warehouse_metering_history): warehouse-level billed compute.
- [Attributing cost](https://docs.snowflake.com/en/user-guide/cost-attributing): query tagging and cost attribution methods.

Documentation was checked on October 13, 2026. Live account verification remains a separate handover step.
