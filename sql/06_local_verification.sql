-- SQLite counterpart for the interactive, explicitly synthetic verification fixture.
-- One synthetic aggregate query per report; this is not recovered query-level history.
CREATE VIEW query_dedup AS
SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY query_id ORDER BY ingestion DESC, credits DESC) AS rn FROM query_attribution) WHERE rn=1;
CREATE VIEW tag_dedup AS
SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY query_id ORDER BY ingestion DESC, tag DESC) AS rn FROM query_history) WHERE rn=1;
CREATE VIEW attributed AS
SELECT a.query_id, a.credits, COALESCE(m.report_id,'__UNALLOCATED__') AS report_id
FROM query_dedup a LEFT JOIN tag_dedup h ON h.query_id=a.query_id
LEFT JOIN metrics m ON m.report_id=CASE WHEN json_valid(h.tag) THEN json_extract(h.tag,'$.report_id') END
WHERE a.credits>=0;
CREATE VIEW report_cost AS
SELECT m.report_id,m.views,m.aws,
 CASE WHEN EXISTS (SELECT 1 FROM query_dedup a JOIN tag_dedup h USING(query_id)
 WHERE (a.credits IS NULL OR a.credits<0) AND CASE WHEN json_valid(h.tag) THEN json_extract(h.tag,'$.report_id') END=m.report_id)
 THEN NULL ELSE COALESCE(SUM(a.credits),0) END AS credits
FROM metrics m LEFT JOIN attributed a ON a.report_id=m.report_id GROUP BY m.report_id;
