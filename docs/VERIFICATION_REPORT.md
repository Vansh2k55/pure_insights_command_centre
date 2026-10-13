# Executed verification — version 2.0.0

Prepared October 14, 2026. Results identify what was actually executed; test counts are not a claim of exhaustive correctness.

| Check                               | Executed coverage                                                                                                                                                                                                                                     | Result                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Node domain/API/integration tests   | 33 tests: source grain, input validation, redaction, CSV safety, authentication/origins, incident policy, persistence, scope, replay, session revocation, event retention, full role/route permissions, WebSocket boundaries, immutable projections, cost/proxy boundaries, deterministic evidence provenance and all-scenario API cost verification | Passed |
| Independent SQL path                | All 20 sets × credit prices 0, 3, 4.5; per-report SQL/domain parity, invalid-credit nulls, stale duplicates, malformed tags, matching views and portfolio totals                                                                                      | Passed                                    |
| Role/scope security                 | Admin/engineer/analyst/viewer/owner; owner list/detail/history/evidence/CSV/metrics/alerts; unrelated owner WebSocket delivery/replay filtered; live access change revocation                                                                         | Passed                                    |
| Incident lifecycle                  | Strict 15s boundary, warning/critical changes without duplicate IDs, ack idempotence, confirmed recovery, UNKNOWN retaining prior refresh failure, new episodes                                                                                       | Passed                                    |
| Replay and restart                  | Start/pause/step, valid speed bounds, set-20 stop, explicit owner retention, process-restart pause and incident identity/sample-count retention                                                                                                       | Passed                                    |
| Stream recovery                     | Authenticated cookie/origin, missed-event replay, logout/role-change revocation, 1,000-event retention and future/expired cursor resync                                                                                                               | Passed                                    |
| Browser integration                 | Login/five roles, all six screens, search, owner edit/demo assignment, download, simulation/recovery, replay controls, evidence/history, cost explorer, account screen, dark/light themes and deterministic delayed-refresh drawer-closure regression | Passed                                    |
| Browser layout                      | 1440px desktop and 390px mobile, no document overflow in mobile journey; screenshot inspection of desktop/mobile/light mode                                                                                                                           | Passed                                    |
| Browser JavaScript                  | Full integration journey with page-error collection                                                                                                                                                                                                   | No page errors                            |
| Independent source validator        | Python standard-library CSV/hash/Decimal controls for 2,000 rows, 100 IDs ×20, 24 negative credits, 1,490 slow observations and status distribution. It independently checks golden operational/cost controls for every source set: orphan, latency, refresh, health, views, complete-cost coverage, matching views and combined cost. | Passed                                    |
| Snowflake syntax                    | Five Snowflake scripts parsed in Snowflake dialect; SQLite counterpart parsed in its own dialect                                                                                                                                                      | Passed                                    |
| Adapted Snowflake fixture execution | Ten boolean checks in DuckDB with disclosed insert/JSON adaptations; statement counts and exact scope are in [the executed run record](DUCKDB_ADAPTATION_RUN.md)                                                                                     | Passed                                    |
| Native Snowflake fixture execution | Scripts 01–04 ran in the dedicated assessment database; all ten acceptance rows returned `true`, and native fixture metrics matched app set-1 controls. [Native run record](snowflake-run.md) preserves scope and limits. | Passed |
| Optional ACCOUNT_USAGE adapter | Script 05 ran in the same dedicated database using its completed 30-day window; result rows were not logged and are not compared to the undated source fixture. [Native run record](snowflake-run.md) | Passed |
| Production build                    | React/Vite compilation                                                                                                                                                                                                                                | Passed                                    |
| Dependency audit                    | Locked production/development dependency graph at verification time                                                                                                                                                                                   | 0 reported vulnerabilities                |
| Source preservation                 | SHA-256 matches original upload byte-for-byte                                                                                                                                                                                                         | Passed                                    |
| Fresh submission extraction         | npm ci, test, build and isolated browser run from packaged source                                                                                                                                                                                     | Passed after final packaging verification |

The UI cost lab executes eight checks per source set. The synthetic metering identity is an internal accounting invariant, not independent proof of a provider invoice. The SQL-versus-domain calculation and Python source controls are separate implementations; the interpretation of undated rows and price assumptions still requires human review.

## Environment boundaries

The native run verified Snowflake execution of the isolated fixture, its acceptance checks and the optional ACCOUNT_USAGE adapter under the configured local role. It does **not** establish the completeness, freshness or business meaning of live account-usage data, live AWS/Snowflake ingestion, or a provider invoice. The UI lab remains an expressly separate SQLite counterpart, and the DuckDB run remains a portability check.

Docker/Compose and hosted GitHub Actions were supplied, but those environments were not executed here. The local Chromium browser run used an available compatible executable because the standard download endpoint was unavailable. README describes the ordinary Playwright browser installation for your laptop/CI. Local testing was on Linux with Node 24; native Windows/macOS startup remains a laptop rehearsal step.

The package was not published to GitHub. Genuine AWS/Snowflake ingestion, service-account telemetry, enterprise identity, external notifications, new-user provisioning and multi-instance deployment are future integrations. The project is an original local assessment application, with labelled replay/simulation and deterministic evidence support.

## Reproduce

Use README's application/test commands. `npm test` contains 33 substantive tests; the browser script is a complete multi-role journey. `python scripts/validate-independent.py` needs no third-party modules and checks source controls against `tests/scenario_controls.json`. The native Snowflake procedure and its exact recorded result are in [Native Snowflake run](snowflake-run.md); the adapted SQL runner uses tests/requirements-sql.txt and is recorded in [DuckDB-adaptation run](DUCKDB_ADAPTATION_RUN.md). Runtime databases, dependencies, build output and QA screenshots are excluded from the ZIP.

## Verification coverage map

| Risk or requirement | Evidence location |
| --- | --- |
| Source grain, invalid credits, matching cost/view population and safe CSV | `tests/domain.test.js`, `scripts/validate-independent.py` |
| Authentication, origin/header controls and malformed input | `tests/api.test.js`, `tests/security.test.js`, `tests/local-origin.test.js` |
| Five-role projection, owner object scope and financial redaction | `tests/api.test.js`, `tests/upgrades.test.js`, `docs/openapi.json` |
| Alert thresholds, deduplication, acknowledgement and recovery | `tests/api.test.js`, `tests/upgrades.test.js`, `docs/API_WEBSOCKET_SPEC.md` |
| Replay, persistence, restart and retained-event recovery | `tests/api.test.js`, `tests/upgrades.test.js` |
| Query attribution, tag isolation, invalid credits and conservation | `tests/upgrades.test.js`, `tests/sql_validation.py`, `sql/03_cost_attribution.sql`, `sql/04_acceptance_checks.sql` |
| Projection immutability, deterministic evidence limits and financial-endpoint contract | `tests/evidence_contracts.test.js` |
| API verification across all 20 undated source scenarios | `tests/evidence_contracts.test.js`, `scripts/validate-independent.py` |
| User-facing multi-role workflow and delayed-drawer regression | `tests/browser.mjs` |
