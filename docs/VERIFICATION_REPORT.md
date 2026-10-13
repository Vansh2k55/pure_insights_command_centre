# Executed verification — version 2.0.0

Prepared October 13, 2026. Results identify what was actually executed; test counts are not a claim of exhaustive correctness.

| Check                               | Executed coverage                                                                                                                                                                                                                                     | Result                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Node domain/API/integration tests   | 26 tests: source grain, input validation, redaction, CSV safety, authentication/origins, incident policy, persistence, scope, replay, session revocation and event retention                                                                          | Passed                                    |
| Independent SQL path                | All 20 sets × credit prices 0, 3, 4.5; per-report SQL/domain parity, invalid-credit nulls, stale duplicates, malformed tags, matching views and portfolio totals                                                                                      | Passed                                    |
| Role/scope security                 | Admin/engineer/analyst/viewer/owner; owner list/detail/history/evidence/CSV/metrics/alerts; unrelated owner WebSocket delivery/replay filtered; live access change revocation                                                                         | Passed                                    |
| Incident lifecycle                  | Strict 15s boundary, warning/critical changes without duplicate IDs, ack idempotence, confirmed recovery, UNKNOWN retaining prior refresh failure, new episodes                                                                                       | Passed                                    |
| Replay and restart                  | Start/pause/step, valid speed bounds, set-20 stop, explicit owner retention, process-restart pause and incident identity/sample-count retention                                                                                                       | Passed                                    |
| Stream recovery                     | Authenticated cookie/origin, missed-event replay, logout/role-change revocation, 1,000-event retention and future/expired cursor resync                                                                                                               | Passed                                    |
| Browser integration                 | Login/five roles, all six screens, search, owner edit/demo assignment, download, simulation/recovery, replay controls, evidence/history, cost explorer, account screen, dark/light themes and deterministic delayed-refresh drawer-closure regression | Passed                                    |
| Browser layout                      | 1440px desktop and 390px mobile, no document overflow in mobile journey; screenshot inspection of desktop/mobile/light mode                                                                                                                           | Passed                                    |
| Browser JavaScript                  | Full integration journey with page-error collection                                                                                                                                                                                                   | No page errors                            |
| Independent source validator        | Python standard-library CSV/hash/Decimal controls for 2,000 rows, 100 IDs ×20, 24 negative credits, 1,490 slow observations, status distribution and per-set operational/cost computations; set 1 independently asserts orphan, latency, refresh, health, views and cost controls | Passed                                    |
| Snowflake syntax                    | Five Snowflake scripts parsed in Snowflake dialect; SQLite counterpart parsed in its own dialect                                                                                                                                                      | Passed                                    |
| Adapted Snowflake fixture execution | Ten boolean checks in DuckDB with disclosed insert/JSON adaptations                                                                                                                                                                                   | Passed                                    |
| Production build                    | React/Vite compilation                                                                                                                                                                                                                                | Passed                                    |
| Dependency audit                    | Locked production/development dependency graph at verification time                                                                                                                                                                                   | 0 reported vulnerabilities                |
| Source preservation                 | SHA-256 matches original upload byte-for-byte                                                                                                                                                                                                         | Passed                                    |
| Fresh submission extraction         | npm ci, test, build and isolated browser run from packaged source                                                                                                                                                                                     | Passed after final packaging verification |

The UI cost lab executes eight checks per source set. The synthetic metering identity is an internal accounting invariant, not independent proof of a provider invoice. The SQL-versus-domain calculation and Python source controls are separate implementations; the interpretation of undated rows and price assumptions still requires human review.

## Environment boundaries

No native Snowflake account was available. Account privileges, native engine behaviour and actual ACCOUNT_USAGE freshness are **not verified**. Local fixture execution uses DuckDB adapters, and the UI lab uses an expressly separate SQLite counterpart. The optional real-account SQL pattern was parsed, not executed against a customer account.

Docker/Compose and hosted GitHub Actions were supplied, but those environments were not executed here. The local Chromium browser run used an available compatible executable because the standard download endpoint was unavailable. README describes the ordinary Playwright browser installation for your laptop/CI. Local testing was on Linux with Node 24; native Windows/macOS startup remains a laptop rehearsal step.

The package was not published to GitHub. Genuine AWS/Snowflake ingestion, service-account telemetry, enterprise identity, external notifications, new-user provisioning and multi-instance deployment are future integrations. The project is an original local assessment application, with labelled replay/simulation and deterministic evidence support.

## Reproduce

Use README's application/test commands. `npm test` contains 26 substantive tests; the browser script is a complete multi-role journey. `python scripts/validate-independent.py` needs no third-party modules. The optional SQL runner uses tests/requirements-sql.txt. Runtime databases, dependencies, build output and QA screenshots are excluded from the ZIP.

## Verification coverage map

| Risk or requirement | Evidence location |
| --- | --- |
| Source grain, invalid credits, matching cost/view population and safe CSV | `tests/domain.test.js`, `scripts/validate-independent.py` |
| Authentication, origin/header controls and malformed input | `tests/api.test.js`, `tests/security.test.js`, `tests/local-origin.test.js` |
| Five-role projection, owner object scope and financial redaction | `tests/api.test.js`, `tests/upgrades.test.js`, `docs/openapi.json` |
| Alert thresholds, deduplication, acknowledgement and recovery | `tests/api.test.js`, `tests/upgrades.test.js`, `docs/API_WEBSOCKET_SPEC.md` |
| Replay, persistence, restart and retained-event recovery | `tests/api.test.js`, `tests/upgrades.test.js` |
| Query attribution, tag isolation, invalid credits and conservation | `tests/upgrades.test.js`, `tests/sql_validation.py`, `sql/03_cost_attribution.sql`, `sql/04_acceptance_checks.sql` |
| User-facing multi-role workflow and delayed-drawer regression | `tests/browser.mjs` |
