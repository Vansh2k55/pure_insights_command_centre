"""Parse Snowflake SQL and execute portable fixture semantics in an in-memory DuckDB.

This is NOT a Snowflake-engine integration test. Two explicit dialect adaptations:
INSERT OVERWRITE -> INSERT into empty fixture tables; JSON variant-to-varchar ->
json_extract_string, which returns unquoted scalar strings like Snowflake.
"""
from pathlib import Path
import re
import duckdb
import sqlglot
from sqlglot import expressions as exp

root = Path(__file__).resolve().parents[1]
db = duckdb.connect()
checks = 0
for path in sorted((root / 'sql').glob('*.sql')):
    if path.name.startswith('06_'):
        sqlglot.parse(path.read_text(), read='sqlite', error_level='RAISE')
        print(f'{path.name}: SQLite syntax parsed; execution covered by Node integration tests')
        continue
    statements = sqlglot.parse(path.read_text(), read='snowflake', error_level='RAISE')
    print(f'{path.name}: {len(statements)} Snowflake statements parsed')
    if path.name.startswith('05_'):
        continue  # External account permissions and live service are unavailable.
    for statement in statements:
        if isinstance(statement, exp.Create) and statement.args.get('kind') not in ('TABLE', 'VIEW'):
            continue
        if not isinstance(statement, (exp.Create, exp.Insert, exp.Select)):
            continue
        sql = statement.sql(dialect='duckdb')
        sql = sql.replace('INSERT OVERWRITE INTO', 'INSERT INTO').replace('INSERT OVERWRITE TABLE', 'INSERT INTO')
        sql = re.sub(r"CAST\(CASE WHEN JSON_VALID\(H\.QUERY_TAG\) THEN CAST\(H\.QUERY_TAG AS JSON\) ELSE NULL END -> '\$\.report_id' AS TEXT\)",
                     "JSON_EXTRACT_STRING(TRY_CAST(H.QUERY_TAG AS JSON), '$.report_id')", sql)
        result = db.execute(sql)
        if path.name.startswith('04_'):
            value = result.fetchone()[0]
            assert value is True, f'Acceptance check failed: {sql}'
            checks += 1
print(f'{checks} SQL acceptance checks passed in DuckDB; native Snowflake execution remains unverified.')
db.close()
