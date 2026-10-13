# Architecture — v2

One Node.js 24 process serves a React/Vite production build, Express REST API and authenticated WebSocket stream. The original 2,000-row CSV is parsed once, normalized in memory and retained unchanged on disk. Twenty undated source scenarios provide deterministic operational demonstrations. SQLite stores users, session digests, assignments, overrides, incident episodes, replay settings, event history and audit records.

## Data flow

1. `server/domain.js` validates fields independently: bad credit data becomes null while the row's refresh, owner and latency remain usable. Every row retains source position and per-report occurrence ordinal.
2. `server/app.js` selects one scenario, merges persistent operational ownership and scenario-specific telemetry. Role/scope projection happens server-side before REST/CSV responses. Owner history is restricted by current report scope; historical cost fields remain redacted.
3. A write transaction mutates operational state, reconciles incident episodes, records audit and inserts events. Events broadcast after commit. Replayed source sets use the same reconciliation engine as manual telemetry.
4. `server/intelligence.js` assembles an explicitly artificial query/tag fixture in a separate in-memory SQLite database and executes `sql/06_local_verification.sql`. Its aggregate costs are compared against domain calculations. This is a separately implemented computational path, not an independent provider bill. Dataset controls also have an independent Python standard-library validator.
5. The React interface coalesces live refreshes, offers manual/automatic replay, source evidence and source-observation inspection. Dark/light theme is local UI preference. There are no external fonts, analytics scripts, cloud credentials or LLM calls.

## Module responsibilities

| Module          | Responsibility                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| domain.js       | CSV normalization, roles, summaries, cost calculations, input validation, safe CSV                            |
| store.js        | SQLite schema/migrations, seeded accounts, salted scrypt passwords, token hashes                              |
| app.js          | Authentication, authorization, current scope, routes, transactions, replay, incidents, stream recovery        |
| intelligence.js | SQL verification fixture, owner cost breakdown, sensitivity/proxy, evidence assistant                         |
| main.jsx        | Session/UI coordination, inventory, alert/cost/quality/audit screens, report drawer                           |
| Extensions.jsx  | Replay deck, health highlights, cost verification/explorer, source evidence, access editor                    |
| SQL 01–05       | Snowflake fixture, direct query attribution, reconciliation, acceptance checks, optional real-account pattern |
| SQL 06          | SQLite counterpart executed by the interactive cost lab                                                       |

## Persistence and recovery

The SQLite database uses WAL and foreign keys. Random sessions are stored as digests, expire after eight hours and survive process restart until revoked/expired. Explicit owner assignments are separate from simulated telemetry and survive both scenario switches and restart. Original source owners are preserved in CSV/history and `source_owner_email` when an assignment overlays a report.

Replay interval is retained; replay is always paused after restart. The selected source set and telemetry overrides are retained. Each replay tick moves to the next complete 100-report set, clears manual simulated samples, preserves owner assignments and reconciles incident episodes. Set 20 stops the timer. Manual scenario reset resolves active episodes with SCENARIO_RESET and reseeds them; it does not erase historical records.

Schema migration adds new incident fields and an active-user flag to existing databases. Policy migration reconciles the new UNKNOWN/severity policy once without counting it as a new sample. Legacy scenario-specific owner overrides retain their existing interpretation; new assignments use the dedicated table.

Latest 1,000 persisted events support reconnect. Retention gaps require a fresh scoped REST snapshot. Source observations remain undated: application detection/audit times cannot become reconstructed historical timestamps.

## Access and operational limits

REST evaluates the current active user for every call. Stream delivery/heartbeat revalidates the session and role; explicit account changes remove existing sessions. Owner scope updates immediately after ownership writes. The API has origin/header protection, bounded bodies, rate limits and redacted financial fields. WebSocket upgrades require allowed Origin/cookie; heartbeat, connection/payload caps and backpressure bound resource use.

This is a single-instance assessment implementation. SQLite transaction writes are synchronous and replay is an in-process timer. There is no enterprise SSO, cloud telemetry collector, multi-tenant isolation, tamper-proof audit store, email delivery or real cloud billing ingestion. Existing account management changes the five seeded accounts; new account provisioning is outside the demo. Authentication/source parsing errors fail closed or return explicit errors rather than pretending data is healthy.

For deployment, use an identity provider, service-authenticated telemetry ingestion, authoritative report inventory, measurement windows, durable shared database/message broker, external observability, backups and HTTPS. Read `DATA_DECISIONS.md` before replacing source scenarios with real observations.

## References

- [Node SQLite](https://nodejs.org/api/sqlite.html)
- [Express documentation](https://expressjs.com/)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Snowflake query attribution](https://docs.snowflake.com/en/sql-reference/account-usage/query_attribution_history)
