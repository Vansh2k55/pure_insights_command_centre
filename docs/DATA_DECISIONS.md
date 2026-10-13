# Data interpretation and validation

The source is the supplied `Case_Study_3_Technical Data AI Validation Intern - Monetization.csv`, preserved byte-for-byte as `data/reports.csv`. The README names a different example dataset; this implementation uses the actual uploaded file with matching schema. Data is synthetic. No external enrichment was used.

## Record grain

The CSV contains 2,000 observations of 100 report IDs, with exactly 20 occurrences per ID. There are no entirely identical rows. All report IDs have multiple non-null owner values across their observations. The file has no date/period, query-level IDs, warehouse identity, unique-user identifiers or allocation tags.

An occurrence ordinal per report is generated from original file order. Observation set n chooses the nth row per report and therefore contains exactly 100 records. The ordinal is a **scenario selector**, not a timestamp, month or assertion of recency. The default is set 1. Source row numbers include the CSV header, so the first record is row 2. No source observation is dropped merely because its report ID recurs. Aggregating the 20 repeated monthly summaries would create an unsupported financial/usage total, so no such total is displayed.

In a production migration, authoritative report inventory and effective-dated owner/usage records must replace this assumption. Ask the data owner for measurement timestamps, report version IDs and reporting windows before constructing historical trends.

## Rules and measured findings

| Rule                         | Full-source finding                                                        | Treatment                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Missing/sentinel owner       | 128 blanks + 117 ORPHANED_REPORT = 245                                     | Trim/lowercase valid emails; invalid owners become null; keep orphan flag and source reference       |
| Negative Snowflake credits   | 24 observations                                                            | Analytical null, excluded from cost math; preserve raw CSV and row references                        |
| High latency                 | 1,490 observations >15s                                                    | Preserve values and alert; spikes are operational evidence                                           |
| Refresh outcomes             | 1,336 success, 382 failed, 182 timed out, 100 unknown                      | Known enum; failed/timed out alert; unknown creates a DATA_GAP alert and does not establish recovery |
| Zero views                   | 4 observations                                                             | Unit costs null, not zero or infinity                                                                |
| AWS cost/view review         | 304 observations >$1 AWS/view, plus 4 positive-cost zero-view observations | Explicit heuristic review flag; no automatic bill correction                                         |
| Conflicting report ownership | All 100 distinct IDs                                                       | Document uncertainty; selected scenario owner is not authoritative                                   |
| Exact duplicate rows         | 0                                                                          | Retain every observation; SQL fixture separately demonstrates query-log deduplication                |

All six numeric fields must be finite and nonnegative. Count fields must also be integers. Missing or invalid values become analytical nulls with a field-specific flag. Invalid credit rows remain in report health/usage views and cost tables with incomplete cost values. The app never uses absolute value, zero substitution or silent deletion to disguise negative credits. The raw CSV is the audit source.

The AWS flag uses a disclosed $1/view review threshold. It is not statistically inferred, contract-based, or proof that usage or billing is wrong. Shared hosting can create high unit costs at low traffic. Do not claim causal relationships from this synthetic dataset.

## Cost definitions

- Snowflake USD estimate = valid credits × assumed USD/credit (default 3).
- Combined USD estimate = known Snowflake estimate + valid AWS hosting USD.
- Report USD/view = complete combined cost / views, only when views >0.
- Portfolio USD/view = sum of complete report costs / sum of views from those same complete-cost reports.
- Invalid-credit reports contribute to usage counts but not the cost-complete population. Known AWS spend is still visible per report; it does not make the combined total complete.
- The source supports views, not distinct active users. No per-unique-user metric is invented.

Use full precision internally and round only for display. Credit price is an explicit assumption because the brief does not specify a negotiated rate. Cost and view windows are assumed to match within each selected synthetic row; the source does not prove this.

## Default scenario controls

| Metric                                      | Set 1                                     |
| ------------------------------------------- | ----------------------------------------- |
| Reports                                     | 100                                       |
| Views                                       | 78,478                                    |
| Failed/timed-out refreshes                  | 33                                        |
| Slow reports                                | 77                                        |
| Missing owners                              | 17                                        |
| Unknown statuses                            | 3                                         |
| Healthy reports                             | 10                                        |
| Active condition episodes at initialization | 113 = 77 latency + 33 refresh + 3 unknown |
| Valid credits                               | 54,674.26                                 |
| Reports with complete combined costs        | 99                                        |
| Views in complete-cost population           | 78,239                                    |
| Known combined cost at $3/credit            | $188,417.87                               |
| Portfolio combined USD/view                 | $2.4082346400                             |
| Hosting cost review flags                   | 16                                        |

Healthy means valid owner, known latency ≤15 and refresh SUCCESS. This does not assert financial-data quality or complete system reliability.

## Runtime changes and provenance

Explicit operational owner assignments live in a separate SQLite table. They persist across source sets and restart and record the actor, original source owner and assignment time. They establish accountability in the demo application, not the historical truth of a conflicting source CSV. The unmodified source history remains available. New source scenarios cannot silently undo an explicit assignment.

Admin and engineer can simulate latency/status in demo mode. These scenario-specific overrides receive SIMULATED_LIVE provenance and persist after restart, but are cleared by a manual source reset or replay advance. Replay itself is labelled SOURCE_REPLAY and is paused after restart. It stops after the twentieth undated set. It never pretends the source observations have real collection timestamps.

Alert detection timestamps are local application times. They cannot reconstruct the CSV measurement date. Reports carry their original source-row and occurrence ordinal after runtime edits, plus provenance labels. UNKNOWN never resolves a confirmed refresh failure; only a successful refresh does. A known latency at or below 15 seconds resolves its latency episode.

## Analysis and explanation limits

Owner chargeback uses cost-complete reports from the selected set and the operational owner currently displayed. Credit-price sensitivity changes only the hypothetical price; it holds the population, source credits and AWS costs fixed. Query-count proportional allocation is a **separate sensitivity proxy**, never a replacement for direct source credits. It cannot establish an invoice discrepancy or true query resource consumption.

The evidence assistant applies deterministic rules to current operational fields. It quotes the field values and source/provenance and proposes checks for a human operator. It has no LLM dependency and does not infer a causal diagnosis from correlation or fabricate cloud logs.

The interactive SQL lab creates a new synthetic query fixture per selected set. It demonstrates deduplication, malformed-tag isolation, missing-credit coverage and matching denominators. The metering identity is explicitly an internal fixture conservation check, not independent proof of provider billing correctness. See SQL_GUIDE.md for separate Snowflake execution limits.
