"""Run the isolated Snowflake fixture (01-04) using local .env credentials.

The script never prints connection settings or tokens. It refuses to replace an
existing dedicated fixture database unless the explicit, narrowly scoped flag is
provided.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import snowflake.connector
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = ROOT / "sql"
DATABASE = "PURE_INSIGHTS_CASE_STUDY"
SCRIPTS = ["01_schema.sql", "02_fixture.sql", "03_cost_attribution.sql", "04_acceptance_checks.sql"]
ACCOUNT_USAGE_ADAPTER = "05_real_account_usage_adapter.sql"
TABLES = ["REPORT_METRICS", "MOCK_QUERY_HISTORY", "MOCK_QUERY_ATTRIBUTION_HISTORY", "MOCK_WAREHOUSE_METERING_HISTORY"]


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required local configuration: {name}")
    return value


def redact(error: BaseException | str, token: str) -> str:
    return str(error).replace(token, "[redacted]")


def has_executable_sql(fragment: str) -> bool:
    """Return whether a fragment contains SQL after comments are removed."""
    without_blocks = re.sub(r"/\*.*?\*/", "", fragment, flags=re.DOTALL)
    without_comments = re.sub(r"(?m)--[^\n]*", "", without_blocks)
    return bool(without_comments.strip())


def split_sql(source: str) -> list[str]:
    statements, start = [], 0
    quote = None
    line_comment = block_comment = False
    index = 0
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if line_comment:
            line_comment = char != "\n"
        elif block_comment:
            if char == "*" and next_char == "/":
                block_comment = False
                index += 1
        elif quote:
            if char == quote and next_char == quote:
                index += 1
            elif char == quote:
                quote = None
        elif char == "-" and next_char == "-":
            line_comment = True
            index += 1
        elif char == "/" and next_char == "*":
            block_comment = True
            index += 1
        elif char in ("'", '"'):
            quote = char
        elif char == ";":
            statement = source[start:index].strip()
            if has_executable_sql(statement):
                statements.append(statement)
            start = index + 1
        index += 1
    trailing = source[start:].strip()
    if has_executable_sql(trailing):
        statements.append(trailing)
    return statements


def label(statement: str) -> str:
    statement = re.sub(r"(?m)^\s*--.*$", "", statement).strip()
    return re.sub(r"\s+", " ", statement)[:80]


def execute_script(connection, filename: str, checks: bool = False) -> list[dict[str, object]]:
    statements = split_sql((SQL_DIR / filename).read_text(encoding="utf-8"))
    print(json.dumps({"script": filename, "statements": len(statements), "status": "running"}))
    rows: list[dict[str, object]] = []
    with connection.cursor() as cursor:
        for index, statement in enumerate(statements, start=1):
            try:
                cursor.execute(statement)
                if checks and re.search(r"\bSELECT\b", statement, re.IGNORECASE):
                    for result in cursor.fetchall():
                        row = {column[0]: value for column, value in zip(cursor.description, result)}
                        rows.append(row)
                        print(json.dumps({"acceptance_check": row}, default=str, sort_keys=True))
            except Exception as error:
                raise RuntimeError(f"{filename}, statement {index} ({label(statement)}): {error}") from error
    print(json.dumps({"script": filename, "status": "passed"}))
    return rows


def main() -> int:
    replace_existing = "--replace-existing-fixture" in sys.argv[1:]
    include_account_usage_adapter = "--include-account-usage-adapter" in sys.argv[1:]
    unexpected_arguments = set(sys.argv[1:]) - {"--replace-existing-fixture", "--include-account-usage-adapter"}
    if unexpected_arguments:
        print(f"Unsupported argument(s): {', '.join(sorted(unexpected_arguments))}", file=sys.stderr)
        return 2
    load_dotenv(ROOT / ".env", override=False)
    token = required("SNOWFLAKE_TOKEN")
    config = {
        "account": required("SNOWFLAKE_ACCOUNT"),
        "user": required("SNOWFLAKE_USER"),
        "role": required("SNOWFLAKE_ROLE"),
        "warehouse": required("SNOWFLAKE_WAREHOUSE"),
        "authenticator": "PROGRAMMATIC_ACCESS_TOKEN",
        "token": token,
        "application": "PURE_INSIGHTS_CASE_STUDY_VERIFICATION",
    }
    try:
        connection = snowflake.connector.connect(**config)
    except Exception as error:
        print(f"Snowflake login failed: {redact(error, token)}", file=sys.stderr)
        return 2
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT CURRENT_REGION() AS REGION")
            print(json.dumps({"snowflake_region": cursor.fetchone()[0]}))
            cursor.execute("SHOW DATABASES")
            columns = [column[0].lower() for column in cursor.description]
            existing = {dict(zip(columns, row)).get("name", "").upper() for row in cursor.fetchall()}
        if DATABASE in existing:
            if not replace_existing:
                if not include_account_usage_adapter:
                    print(f"STOP: {DATABASE} already exists. No fixture SQL was run.", file=sys.stderr)
                    return 3
            else:
                with connection.cursor() as cursor:
                    cursor.execute(f"DROP DATABASE {DATABASE}")
                print(json.dumps({"database": DATABASE, "action": "dropped dedicated fixture database"}))

        if include_account_usage_adapter and not replace_existing:
            execute_script(connection, ACCOUNT_USAGE_ADAPTER)
            print(json.dumps({"script": ACCOUNT_USAGE_ADAPTER, "result_rows": "not logged; live account usage is outside fixture controls"}))
            return 0

        for filename in SCRIPTS[:3]:
            execute_script(connection, filename)
        print(json.dumps({"data_load": "inline SQL fixture; no PUT/COPY or CSV upload is used"}))
        with connection.cursor() as cursor:
            for table in TABLES:
                cursor.execute(f"SELECT COUNT(*) AS ROW_COUNT FROM {DATABASE}.MONITORING.{table}")
                print(json.dumps({"table": table, "row_count": cursor.fetchone()[0]}))
        checks = execute_script(connection, SCRIPTS[3], checks=True)
        if len(checks) != 10:
            raise RuntimeError(f"Expected 10 acceptance rows; received {len(checks)}")
        if not all(value is True for row in checks for value in row.values()):
            raise RuntimeError("At least one acceptance check returned false")
        with connection.cursor() as cursor:
            cursor.execute(
                f"""SELECT
                  (SELECT COUNT(*) FROM {DATABASE}.MONITORING.V_REPORT_COST_PER_VIEW) AS REPORTS,
                  (SELECT COUNT(*) FROM {DATABASE}.MONITORING.V_REPORT_COST_PER_VIEW WHERE TOTAL_COST_USD IS NULL) AS INCOMPLETE_REPORTS,
                  (SELECT SUM(DIRECT_COMPUTE_CREDITS) FROM {DATABASE}.MONITORING.V_REPORT_CREDITS WHERE REPORT_ID <> '__UNALLOCATED__') AS DIRECT_CREDITS,
                  (SELECT SUM(TOTAL_COST_USD) FROM {DATABASE}.MONITORING.V_REPORT_COST_PER_VIEW) AS COMBINED_USD,
                  (SELECT SUM(MONTHLY_ACTIVE_VIEWS) FROM {DATABASE}.MONITORING.V_REPORT_COST_PER_VIEW WHERE TOTAL_COST_USD IS NOT NULL) AS MATCHED_VIEWS,
                  (SELECT SUM(UNALLOCATED_QUERY_CREDITS) FROM {DATABASE}.MONITORING.V_WAREHOUSE_RECONCILIATION) AS UNALLOCATED_CREDITS,
                  (SELECT SUM(UNATTRIBUTED_BILLED_CREDITS) FROM {DATABASE}.MONITORING.V_WAREHOUSE_RECONCILIATION) AS RESIDUAL_CREDITS"""
            )
            metric = {column[0]: value for column, value in zip(cursor.description, cursor.fetchone())}
            print(json.dumps({"fixture_metrics": metric}, default=str, sort_keys=True))
        if include_account_usage_adapter:
            execute_script(connection, ACCOUNT_USAGE_ADAPTER)
            print(json.dumps({"script": ACCOUNT_USAGE_ADAPTER, "result_rows": "not logged; live account usage is outside fixture controls"}))
        return 0
    except Exception as error:
        print(f"Snowflake execution failed: {redact(error, token)}", file=sys.stderr)
        return 4
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
