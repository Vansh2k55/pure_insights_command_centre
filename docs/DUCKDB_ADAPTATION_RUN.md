# Executed DuckDB-adaptation SQL run

**Executed locally on Windows on October 14, 2026.** This is a reproducible compatibility and fixture-semantics check; it is **not** native Snowflake execution.

## Command

```sh
python -m pip install -r tests/requirements-sql.txt
python tests/sql_validation.py
```

The runner parses Snowflake scripts with `sqlglot` in the Snowflake dialect, then executes the portable fixture portion in in-memory DuckDB. Only `CREATE TABLE`/`VIEW`, `INSERT`, and `SELECT` statements enter that execution path; database/schema/session statements are parsed but not run. Two deliberate SQL-dialect adaptations are documented in the test source:

- `INSERT OVERWRITE` becomes insertion into new, empty fixture tables.
- Snowflake JSON scalar extraction becomes DuckDB `json_extract_string`.

Within that executable subset, scripts are not silently rewritten beyond those adapters. `05_real_account_usage_adapter.sql` is parsed only because it requires an authorized account and live `ACCOUNT_USAGE` access. `06_local_verification.sql` is parsed as SQLite and is executed separately by Node integration tests.

## Recorded result

| Script | Dialect check | Statements parsed | Execution result |
| --- | --- | ---: | --- |
| `01_schema.sql` | Snowflake | 10 | Fixture schema executed in DuckDB adaptation |
| `02_fixture.sql` | Snowflake | 7 | Deterministic fixture executed in DuckDB adaptation |
| `03_cost_attribution.sql` | Snowflake | 13 | Attribution/reconciliation views executed in DuckDB adaptation |
| `04_acceptance_checks.sql` | Snowflake | 12 | **10/10 boolean acceptance checks passed** |
| `05_real_account_usage_adapter.sql` | Snowflake | 9 | Parsed only; not executed |
| `06_local_verification.sql` | SQLite | — | Parsed; execution covered by Node integration tests |

The successful controls cover report count, negative-credit quarantine, incomplete-cost handling, direct credits, combined cost, unallocated query credits, metering residual, conservation, over-attribution review and zero-view handling.

## Boundary

This record demonstrates parser compatibility and adapted fixture semantics only. It does not verify Snowflake permissions, native arithmetic and window behavior, `ACCOUNT_USAGE` freshness, or real billing data. The repository makes no claim of native Snowflake execution. For fixture design and production-adapter limits, see the [SQL guide](SQL_GUIDE.md).
