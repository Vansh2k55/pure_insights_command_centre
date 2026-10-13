# Native Snowflake fixture run

Executed on **October 14, 2026** from a local Windows workstation using the credential values in the ignored `.env` file. No credentials, account identifiers or live account-usage result rows are recorded here.

| Environment item | Recorded value |
| --- | --- |
| Region | `AWS_AP_SOUTHEAST_7` |
| Edition | Not retrieved during this run; no edition claim is made. |
| Role / warehouse | Values configured locally; the run used only the configured warehouse. |
| Destination | Dedicated `PURE_INSIGHTS_CASE_STUDY` fixture database only. |

## Scope and preparation

`git check-ignore .env` confirmed that `.env` is ignored before connecting. The runner first issued `SHOW DATABASES`. The dedicated fixture database existed only because an earlier partial run had created it; its contents were confirmed disposable by the operator. With explicit operator approval, the runner dropped **only** that dedicated database and then restarted `01_schema.sql` from statement 1. No other database, role, user or warehouse was changed.

The source CSV contains **2,001 physical lines**: one header and 2,000 source observations. Scripts `01`–`04` do not use `PUT` or `COPY INTO`: `02_fixture.sql` is a generated, inline fixture for source observation set 1 (100 reports). Consequently, no files were staged. The 100 loaded `REPORT_METRICS` rows are the appropriate CSV comparison; the other fixture tables intentionally add synthetic query/tag and metering evidence.

## Scripts executed

| Order | Script | Native result |
| ---: | --- | --- |
| 1 | `sql/01_schema.sql` | Passed; 9 executable statements. |
| 2 | `sql/02_fixture.sql` | Passed; 7 executable statements. |
| 3 | `sql/03_cost_attribution.sql` | Passed; 13 executable statements. |
| 4 | `sql/04_acceptance_checks.sql` | Passed; all 10 boolean checks returned `true`. |
| 5 | `sql/05_real_account_usage_adapter.sql` | Passed; 8 executable statements. Live result rows were intentionally not logged because they are account data outside the fixture. |
| 6 | `sql/06_local_verification.sql` | Not a Snowflake script. Its separate SQLite execution remains covered by the Node integration suite. |

The adapter's built-in 30-day, completed-window logic was used. Its output is not comparable to the supplied undated CSV or the deterministic fixture, and it does not establish live ingestion.

## Loaded row counts

| Native table | Rows | Interpretation |
| --- | ---: | --- |
| `REPORT_METRICS` | 100 | One row for each report in source observation set 1. |
| `MOCK_QUERY_HISTORY` | 102 | 100 report records plus a deliberately stale/mismatched record and a malformed-tag record. |
| `MOCK_QUERY_ATTRIBUTION_HISTORY` | 102 | Mirrors the deliberate history edge cases. |
| `MOCK_WAREHOUSE_METERING_HISTORY` | 1 | One synthetic warehouse billing record. |

## Acceptance checks

Every returned row from `04_acceptance_checks.sql` is below.

| Check | Result |
| --- | --- |
| `HAS_100_REPORTS` | `true` |
| `QUARANTINES_NEGATIVE_REPORT_QUERY` | `true` |
| `HAS_ONE_INCOMPLETE_REPORT` | `true` |
| `REPORT_CREDIT_CONTROL_MATCH` | `true` |
| `COMBINED_COST_CONTROL_MATCH` | `true` |
| `MISSING_TAGS_VISIBLE` | `true` |
| `RESIDUAL_VISIBLE` | `true` |
| `TOTAL_RECONCILES` | `true` |
| `NO_HIDDEN_OVER_ATTRIBUTION` | `true` |
| `ZERO_VIEW_UNIT_COST_IS_NULL` | `true` |

## Native fixture versus application set 1

The local independent validator and app test suite both passed after the native run. Values below use the same source-set-1 fixture and $3/credit assumption.

| Metric | Native Snowflake | App / independent validator | Comparison |
| --- | ---: | ---: | --- |
| Reports | 100 | 100 | Match |
| Cost-complete / incomplete reports | 99 / 1 | 99 / 1 | Match |
| Direct report credits | 54,674.26 | 54,674.26 | Match |
| Matching views | 78,239 | 78,239 | Match |
| Known combined cost (USD) | 188,417.87 | 188,417.87 | Match |
| Cost per matching view (USD) | 2.4082346400132926 | 2.4082346400132926 | Match |
| Untagged query credits | 12.50 | No source-data equivalent | Deliberate synthetic fixture item |
| Unattributed billed compute | 10,934.852 | No source-data equivalent | Deliberate synthetic fixture item |

## Code changes made for this run

| Change | Reason |
| --- | --- |
| Added `scripts/run_snowflake_fixture.py` | Loads local credentials without printing them; executes the dedicated fixture and records non-sensitive controls. |
| Comment-only fragment filter in `split_sql` | The previous local runner sent a trailing comment as an empty SQL statement. The filter ignores fragments containing only comments/whitespace; no SQL validation was changed. |
| Added `scripts/test_snowflake_runner.py` | Standard-library test covering the comment-only trailing-fragment regression. |
| Added explicit runner flags for replacement and the optional account-usage adapter | Keeps destructive replacement narrowly scoped to the dedicated fixture database and prevents accidental adapter execution. |

No repository SQL statement, fixture value, acceptance check or validation condition was weakened or changed. The initial empty-statement failure was a local runner parsing defect, not a Snowflake dialect failure.

## Reproduction

With an ignored `.env` containing the required Snowflake connection values and permission to use the configured warehouse:

```sh
python -m pip install -r scripts/requirements-snowflake.txt
python scripts/test_snowflake_runner.py
python scripts/run_snowflake_fixture.py --replace-existing-fixture
python scripts/run_snowflake_fixture.py --include-account-usage-adapter
node --test tests/*.test.js
python scripts/validate-independent.py
python tests/sql_validation.py
```

The replacement flag drops only `PURE_INSIGHTS_CASE_STUDY`; do not use it if that database contains anything you need. The separate DuckDB-adaptation evidence remains available in [DUCKDB_ADAPTATION_RUN.md](DUCKDB_ADAPTATION_RUN.md).
