-- Optional production integration example. Requires an authorized role with Snowflake USAGE_VIEWER
-- or GOVERNANCE_VIEWER access to ACCOUNT_USAGE. This file is not invoked by the local application.
-- Do not run until you choose an isolated destination and confirm the complete billing window.
-- Account Usage query attribution can lag up to 8h; leave a conservative 24h cutoff here.
USE DATABASE PURE_INSIGHTS_CASE_STUDY;
USE SCHEMA MONITORING;
ALTER SESSION SET TIMEZONE = 'UTC';
SET WINDOW_END = DATE_TRUNC('DAY', DATEADD('DAY', -1, CURRENT_TIMESTAMP()));
SET WINDOW_START = DATEADD('DAY', -30, $WINDOW_END);

-- Portal query instrumentation example, applied before each report query and reset afterwards:
-- ALTER SESSION SET QUERY_TAG = '{"report_id":"RPT_200","component":"pure_insights"}';
-- SELECT ...;
-- ALTER SESSION UNSET QUERY_TAG;
-- Prefer a per-request connection/session policy to prevent tags leaking between pooled requests.

CREATE OR REPLACE VIEW V_REAL_TAGGED_QUERY_CREDITS AS
SELECT QUERY_ID, WAREHOUSE_NAME, START_TIME,
       TRY_PARSE_JSON(QUERY_TAG):report_id::VARCHAR AS TAG_REPORT_ID,
       CREDITS_ATTRIBUTED_COMPUTE,
       COALESCE(CREDITS_USED_QUERY_ACCELERATION,0) AS QUERY_ACCELERATION_CREDITS
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY;

WITH QUERY_COSTS AS (
  SELECT COALESCE(M.REPORT_ID,'__UNALLOCATED__') AS REPORT_ID,
         SUM(Q.CREDITS_ATTRIBUTED_COMPUTE) AS WAREHOUSE_COMPUTE_CREDITS,
         SUM(Q.QUERY_ACCELERATION_CREDITS) AS QUERY_ACCELERATION_CREDITS
  FROM V_REAL_TAGGED_QUERY_CREDITS Q
  LEFT JOIN REPORT_METRICS M ON Q.TAG_REPORT_ID=M.REPORT_ID
  WHERE Q.START_TIME >= $WINDOW_START AND Q.START_TIME < $WINDOW_END
    AND Q.CREDITS_ATTRIBUTED_COMPUTE >= 0
  GROUP BY 1
)
SELECT * FROM QUERY_COSTS;

-- Metered warehouse compute and attributed warehouse compute have matching scopes.
-- Query Acceleration is separate and is NOT subtracted from warehouse compute metering.
WITH M AS (
  SELECT WAREHOUSE_NAME,SUM(CREDITS_USED_COMPUTE) AS BILLED_COMPUTE
  FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
  WHERE START_TIME >= $WINDOW_START AND START_TIME < $WINDOW_END GROUP BY 1
), Q AS (
  SELECT WAREHOUSE_NAME,SUM(CREDITS_ATTRIBUTED_COMPUTE) AS ATTRIBUTED_COMPUTE
  FROM V_REAL_TAGGED_QUERY_CREDITS
  WHERE START_TIME >= $WINDOW_START AND START_TIME < $WINDOW_END
    AND CREDITS_ATTRIBUTED_COMPUTE >= 0 GROUP BY 1
)
SELECT COALESCE(M.WAREHOUSE_NAME,Q.WAREHOUSE_NAME) AS WAREHOUSE_NAME,
       COALESCE(M.BILLED_COMPUTE,0) AS BILLED_COMPUTE,
       COALESCE(Q.ATTRIBUTED_COMPUTE,0) AS ATTRIBUTED_COMPUTE,
       COALESCE(M.BILLED_COMPUTE,0)-COALESCE(Q.ATTRIBUTED_COMPUTE,0) AS UNATTRIBUTED_BILLED_COMPUTE
FROM M FULL OUTER JOIN Q ON M.WAREHOUSE_NAME=Q.WAREHOUSE_NAME;
-- Query attribution excludes idle time, storage, cloud services, data transfer and other serverless
-- costs. Short queries can be absent. Cross-boundary queries can cause residual discrepancies.
-- Adaptive Warehouses need QUERY_METERING_HISTORY instead; this adapter targets standard warehouses.
-- Replace REPORT_METRICS with authoritative period-matched report views/owners before production use.
