# Demonstration and interview handover

Rehearse with a fresh database before your interview. Use README's startup commands. Keep demo replay paused whenever showing exact set-1 controls. A reset retains explicit operational owner assignments, so source-only ownership counts can differ after you assign owners.

## Opening explanation

“This is a React and Express operations portal for Pure Insights. The source has 100 reports with 20 undated observations each. I use one observation per report as a scenario; I don't invent months or treat 2,000 rows as 2,000 dashboards. It monitors refresh/latency and unowned reports, sends authenticated WebSocket alerts, and attributes simulated query credits with explicit cost gaps.”

## Guided demo

1. Sign in as Admin. Identify the health policy: confirmed SUCCESS, known latency ≤15s and a valid operational owner. The health percentage is a report proportion, not uptime/SLA. Median/P95 use current report latency values with nearest-rank percentile.
2. Start replay, pause and step. All clients refresh from committed backend events. The feed is source replay, not live Snowflake/AWS. It stops at set 20 and pauses after process restart.
3. Load set 1; inspect RPT_203. Assign to demo owner. Observe operational assignment/source-owner trace and preserved twenty-row source history. Sign in as Owner later to show one-report scope. Returning to another source set does not undo that explicit assignment.
4. Inspect RPT_200. Recover, then “Slow + failed.” Two different condition episodes appear. Set latency to 35 to demonstrate warning→critical without new duplicate latency ID. Acknowledge, recover and show resolved history. Changing failure to UNKNOWN creates a data gap but retains the unresolved refresh episode.
5. Open Cost intelligence. Show the eight executed local SQL checks, complete-cost coverage, matching denominator and $3 assumption. Compare chargeback/scatter/sensitivity/proxy. Do not call the proxy actual attribution. Highlight the invented untagged query and metering residual, which are not charged automatically to reports.
6. Open Data validation. Negative credits do not remove operational observations. The original 2,000 rows are intact, including all 1,490 slow observations. All 100 IDs have source owner conflicts; an assignment doesn't resolve their historical truth.
7. Show Engineer operational write access with costs redacted; Viewer read-only; Analyst costs/acknowledgement; Owner scope. As Admin, change another account's role or active flag; existing sessions/streams are revoked. Review the persisted audit.

## Explain your decisions

| Question                            | Answer                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the dataset live?                | No. The dataset is fixed; replay and manual simulation demonstrate real-time transport. Genuine ingestion is a future collector integration.                                 |
| Why not infer consecutive months?   | No date or measurement window is provided. Statistical behaviour cannot establish chronology or non-overlap. Source-order scenarios are an explicit conservative assumption. |
| Why retain negative-credit rows?    | A financial defect doesn't invalidate a known latency or failed refresh. Null the invalid field and preserve other operational evidence.                                     |
| Why cost/view instead of cost/user? | Only active views are supplied. Unique active users cannot be derived.                                                                                                       |
| Why ratio of sums?                  | Portfolio spend must divide by matching portfolio usage; averaging report ratios would weight low-traffic reports equally and distort the result.                            |
| Is metering residual idle compute?  | Not necessarily. In real logs it can include gaps, short queries, freshness and boundary effects. Here it is explicitly invented fixture overhead.                           |
| Is SQL verification independent?    | It is an independently implemented SQL computation plus source-only Python controls. Fixture conservation is an internal identity, not evidence of an actual bill.           |
| Have you run native Snowflake?      | No account was available. Snowflake syntax and adapted fixture semantics were checked locally; native engine/account permissions remain a handover step.                     |
| Why no LLM?                         | The brief needs validation/RBAC/alerts/SQL, not model training. Deterministic evidence provides inspectable recommendations without invented causes or an API dependency.    |
| Why SQLite?                         | Durable local state with simple Windows/macOS setup and no separate DB service. A shared database/broker would be required for multiple server instances.                    |
| What survives restart?              | Sessions until expiry/revocation, owners, source set, samples, incidents, events and audit. Replay resumes paused.                                                           |
| How do roles apply to the stream?   | Session/role revalidation and current owner scope filter each delivery. Unrelated owner payloads are replaced by cursor-only controls.                                       |
| What proves recovery?               | SUCCESS for refresh and a known latency ≤15s for latency. Acknowledgement/UNKNOWN/null latency do not establish recovery.                                                    |

## Code navigation

Start at server/domain.js for field validation and matched cost population; server/app.js for transactions/reconciliation/auth/scope; server/intelligence.js plus sql/06 for executed verification; SQL 03 for Snowflake tag attribution; tests/upgrades.test.js for scope/replay/severity/cost controls. Open docs/openapi.json and docs/asyncapi.json for machine-readable contracts.

## Submission readiness

Run npm ci, npm test, npm run build and npm start on your laptop. Rehearse the demo and understand these assumptions. Upload source to your own GitHub repository as the brief requests; do not upload runtime credentials/databases/dependencies. Keep native Snowflake, Docker and hosted CI limits visible. A good demo is reproducible and honest about the evidence, rather than claiming every possible defect has been eliminated.
