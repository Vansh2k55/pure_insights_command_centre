# Pure Insights Command Centre — v2

A complete React + Express submission for Case Study 3: Technical Data AI Validation — Monetization. Monitor report health and ownership, inspect persistent incidents, demonstrate live notifications, and verify report cost calculations against simulated query logs. The original dataset is preserved unchanged. No cloud account, API key, Python runtime or Docker is needed to run the application.

## Start on Windows, macOS or Linux

Install **Node.js 24 LTS**. Extract the ZIP, open a terminal inside `pure-insights`, and run:

```sh
npm ci
npm run build
npm start
```

Open **http://localhost:3000**. Keep the terminal open; Ctrl+C stops the app. Windows PowerShell/VS Code terminal works. If PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm`. The same configured local port also accepts `127.0.0.1` and IPv6 loopback; other hosts/ports require an exact APP_ORIGIN.

**Demo password: `InsightsDemo2026!`**. The login screen has account shortcuts.

| Account                    | Role / access                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| admin@pureinsights.demo    | Administration, owners, replay, telemetry, financial analysis, audit and access management  |
| engineer@pureinsights.demo | Operational monitoring, telemetry simulation and acknowledgement; financial data redacted   |
| analyst@pureinsights.demo  | Financial analysis, validation and acknowledgement; no operational writes                   |
| viewer@pureinsights.demo   | Read-only workspace health; financial data redacted                                         |
| owner@pureinsights.demo    | Only currently assigned reports, their history/evidence and alerts; financial data redacted |

The owner account starts with no assigned reports. As Admin, inspect a report and click **Assign to demo owner**, then sign in as Owner to demonstrate restricted access. Account role changes and disabling revoke existing sessions immediately. Access management changes these existing demo accounts; it does not provision arbitrary new users.

First run creates `runtime/insights.sqlite`. Sessions, explicit owner assignments, source selection, simulated samples, incidents and audit history persist. Replay always starts paused after a server restart. All demo credentials are public assessment accounts, not deployment credentials.

## What the submission demonstrates

| Brief requirement                   | Implementation                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React dashboard + Node/Express RBAC | Six responsive views; five server-enforced roles; owner scope; complete cost redaction in lists, detail, history, summary and CSV                                             |
| System health and orphaned reports  | Refresh/latency distributions, median/P95, defined health score, priority watch, owner assignment with source provenance                                                      |
| WebSocket or SSE alerts             | Cookie-authenticated WebSocket; strictly >15s latency; refresh failure; UNKNOWN data gaps; severity, deduplication, acknowledgement, confirmed recovery, replay and reconnect |
| Simulated Snowflake attribution SQL | Tagged direct credits, canonical query records, invalid-credit quarantine, unallocated queries, signed warehouse reconciliation and matched per-view costs                    |
| Verifiable cost dashboard           | Eight executed local SQL checks, owner chargeback, spend/view scatter, price sensitivity and explicitly hypothetical query-count proxy                                        |
| Technical handover                  | OpenAPI, AsyncAPI, architecture, data decisions, SQL guide, demonstration/interview guide, executed verification report and CI workflow                                       |

Dark/orange presentation and compact navigation use visual inspiration from a peer interface; implementation is original. Dark/light themes require no external assets. A deterministic evidence assistant explains current fields and useful next checks. It does not call an LLM or pretend to establish causal diagnoses.

## Six-minute demonstration

1. Sign in as Admin. Set 1 shows 100 reports, 33 failed/timed-out refreshes, 77 slow loads, 17 missing owners and 3 unknown outcomes. There are 113 active condition episodes: multiple conditions can affect one report.
2. Start replay at 3s/set, observe WebSocket-driven changes, then pause. Explain that this replays **undated source scenarios**, not live cloud measurements or calendar months. Step advances once; set 20 stops automatically.
3. Load set 1. Inspect `RPT_203`, assign a demo owner, and inspect its preserved source history. The operational assignment persists across source sets; the source CSV/history remains unchanged.
4. Inspect `RPT_200`. Recover it, then click **Slow + failed**. Observe two alerts. Publish latency 35s to see a critical latency update without a duplicate incident. Acknowledge, then recover and inspect resolved episodes. UNKNOWN never establishes refresh recovery.
5. Open Cost intelligence. Explain $3/credit as an assumption, 99/100 complete-cost reports and the matching 78,239-view denominator. Show the SQL lab, chargeback, scatter, sensitivity and disclosed proxy. Discuss unallocated/residual compute rather than silently billing it to reports.
6. Sign in as Owner, Viewer and Engineer to demonstrate scope and financial redaction. The server enforces this even if someone calls the API directly. As Admin, inspect audit/access management.

Manual **Load / reset** pauses replay, clears simulated samples, ends current incidents with SCENARIO_RESET and seeds the selected source scenario. It retains explicit owner assignments, audit and historical incidents. Replay advances preserve incident episodes and reconcile changed conditions. Source set detection times are application times, not inferred measurement timestamps.

## Verify

```sh
npm test
npm run validate
npm audit --audit-level=moderate
npm run build
npx playwright install chromium
npm run test:browser
```

The browser test uses an isolated in-memory app on localhost:3107. Its screenshots are ignored QA output. Linux CI installs browser dependencies with `npx playwright install --with-deps chromium`. BROWSER_TEST_PORT and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH can override the test port/browser.

Optional independent source and Snowflake-fixture tests use Python 3.11+:

```sh
python scripts/validate-independent.py
python -m pip install -r tests/requirements-sql.txt
python tests/sql_validation.py
```

The first command uses only the Python standard library. Python packages are needed only for the optional SQL test, so there is no root `requirements.txt`. The interactive SQL lab already runs with Node alone. The Snowflake test parses all five Snowflake scripts and executes ten fixture checks in DuckDB with explicit adapters; **native Snowflake execution remains unverified**. See [verification report](docs/VERIFICATION_REPORT.md).

## Source interpretation

The CSV contains **2,000 rows, 100 report IDs and 20 occurrences per ID**. It has no dates, warehouses, query IDs or distinct user counts. Each set selects one occurrence per report in original file order. We do not turn those sets into invented months or sum repeated monthly summaries.

Twenty-four negative-credit observations become analytical nulls. Their valid health, latency, ownership and usage fields remain available. Invalid costs stay unavailable; they are not replaced with zero or absolute values. All 100 reports have conflicting source owners across observations. An explicit operational assignment establishes accountability inside this demo without asserting historical source truth.

Cost per view is a ratio of sums over the same cost-complete reports. It is not cost per unique user. The Snowflake fixture explicitly invents a day and aggregate query records; the interactive SQLite counterpart labels its metering and untagged/residual credits as synthetic. Neither is a live provider bill. Read [data decisions](docs/DATA_DECISIONS.md) and [SQL guide](docs/SQL_GUIDE.md).

## Development and optional configuration

```sh
npm run dev
```

Open http://localhost:5173. The development helper starts the API and Vite proxy for REST/WebSocket traffic. Stop an existing production process before using development mode.

`.env.example` is an optional template. `npm start` does not load `.env` automatically. To use it, copy the template, edit values, then run:

```sh
node --env-file=.env server/index.js
```

| Variable         | Default                 | Purpose                                                                         |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------- |
| PORT / HOST      | 3000 / 127.0.0.1        | Local server address                                                            |
| APP_ORIGIN       | http://localhost:3000   | Exact configured browser origin; same-port loopback aliases permitted           |
| DB_PATH          | runtime/insights.sqlite | Persisted SQLite state                                                          |
| DEMO_MODE        | true                    | Demo accounts/hints, simulated telemetry, source selection and replay           |
| DEMO_PASSWORD    | InsightsDemo2026!       | Seed password when each account is first created; does not reset existing users |
| CREDIT_PRICE_USD | 3                       | Explicit nonnegative price assumption; interactive SQL uses the same value      |
| COOKIE_SECURE    | false locally           | Set true behind HTTPS                                                           |

For non-demo mode, supply a strong DEMO_PASSWORD before first creation and set DEMO_MODE=false. This disables simulated ingestion and public credential hints; it does not create a cloud connection. New telemetry/identity integration is a separate deployment step.

Docker is optional: `docker compose up --build`. It supplies Node 24 and a persisted volume. Docker/hosted CI are supplied configurations, not environments executed in this package's verification.

## Submission and upgrade

The brief asks for a **GitHub repository**. Upload this extracted project, retain package-lock.json, and share the repository link. Exclude node_modules, .env, runtime databases, client/dist and test-results. The archive includes source, specs, SQL, tests and CI; it does not publish a repository automatically.

When replacing the previous version, use a fresh extraction. To preserve existing demo state, stop the old process and copy its `runtime` folder into the new project. Existing schemas migrate on startup. Re-run npm ci and npm run build, restart, then hard-refresh the browser. Do not mix only selected v2 files with the old version.

See [demo/interview guide](docs/DEMO_AND_INTERVIEW.md), [REST/stream specification](docs/API_WEBSOCKET_SPEC.md), [architecture](docs/ARCHITECTURE.md), [upgrade notes](docs/IMPROVEMENTS.md) and [source integrity](docs/SOURCE_MANIFEST.md).
