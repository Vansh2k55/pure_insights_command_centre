# REST and WebSocket specification — v2

Machine-readable REST contract: `docs/openapi.json`. Event contract: `docs/asyncapi.json`.

## Authentication and request protection

Login issues an eight-hour random opaque session in `pi_session`, HttpOnly, SameSite=Strict, optional Secure. Only the token digest is stored. Every REST request joins the session to the current active user; WebSocket sends and heartbeats revalidate it. Logout, account disabling and role changes revoke sessions. No tokens are stored in browser localStorage. The colour-theme preference alone is saved there.

All writes, including login/logout, require `X-App-Request: pure-insights`. A present browser Origin must match APP_ORIGIN or a same-protocol, same-port loopback alias. WebSocket upgrades require an allowed Origin and valid session. No wildcard origins. JSON bodies are capped at 16 KiB, the API at 600 requests/IP/minute and login at 25/IP/15 minutes. Cookie requests must remain same-origin. Local HTTP is for the assessment; deployed sessions require HTTPS.

## Permissions

| Operation                                                               | Admin | Engineer | Analyst | Viewer | Owner            |
| ----------------------------------------------------------------------- | ----- | -------- | ------- | ------ | ---------------- |
| Health, inventory, detail, source observations, evidence assistant, CSV | All   | All      | All     | All    | Assigned reports |
| Raw/derived financial fields, cost insights, SQL verification, quality  | Yes   | No       | Yes     | No     | No               |
| Read alert episodes                                                     | All   | All      | All     | All    | Assigned reports |
| Acknowledge active alerts                                               | Yes   | Yes      | Yes     | No     | Assigned reports |
| Simulate latency/status                                                 | Yes   | Yes      | No      | No     | No               |
| Assign operational owner                                                | Yes   | No       | No      | No     | No               |
| Change source set or control replay                                     | Yes   | No       | No      | No     | No               |
| Audit and existing account access                                       | Yes   | No       | No      | No     | No               |

Owner scope is based on current operational assignment, falling back to the selected source email. An out-of-scope report/alert returns 404. Cost redaction applies to list, detail, history, summary, sort options and export. Raw-credit/AWS flags are also redacted. No financial values are carried in events.

## Routes

All routes are prefixed `/api`.

| Method | Path                                     | Inputs / result                                                                                                                                    |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`, `/config`                     | Public service health / demo account hints. Custom password is never exposed.                                                                      |
| POST   | `/auth/login`                            | `{email,password}` → `{email,role}` + cookie.                                                                                                      |
| GET    | `/auth/me`                               | Current `{email,role}`.                                                                                                                            |
| POST   | `/auth/logout`                           | Revokes cookie/session/streams; 204.                                                                                                               |
| GET    | `/dashboard`                             | Scoped summary, snapshot, replay status, active alerts, global event cursor, interpretation.                                                       |
| GET    | `/reports`                               | q, status, orphan=true, slow=true, page≥1, limit=1–100, sort, direction=asc/desc. Defaults page 1, limit 12.                                       |
| GET    | `/reports/export`                        | Same filters; full filtered CSV, independent of pagination. Formula injection escaped.                                                             |
| GET    | `/reports/{id}`                          | Current normalized operational report with allowed fields.                                                                                         |
| GET    | `/reports/{id}/history`                  | Twenty original source observations; no inferred dates or runtime modifications.                                                                   |
| GET    | `/reports/{id}/explanation`              | Deterministic findings, next steps, current-field evidence and provenance. No LLM call or causal diagnosis.                                        |
| PATCH  | `/reports/{id}/owner`                    | `{owner_email}` valid email, ≤254 characters. Durable cross-set operational assignment; raw CSV intact.                                            |
| POST   | `/reports/{id}/telemetry`                | Exactly `{avg_load_time_sec,last_refresh_status}`; finite latency 0–3600, enum SUCCESS/FAILED/TIMED_OUT/UNKNOWN. Demo mode only.                   |
| GET    | `/alerts`                                | state=active/resolved/all; newest 500 within permitted scope.                                                                                      |
| POST   | `/alerts/{id}/ack`                       | `{}`; idempotent on active episode; 409 if resolved.                                                                                               |
| GET    | `/costs`                                 | Current financial reports, matching-population summary, insights and executed local SQL verification.                                              |
| GET    | `/costs/verification`, `/costs/insights` | Independent views of the same verification / analysis data.                                                                                        |
| GET    | `/quality`                               | Whole-source audit, current flags, explicit policies.                                                                                              |
| POST   | `/scenario`                              | `{snapshot}` integer 1–20. Pauses replay, clears simulated samples, marks current episodes SCENARIO_RESET, seeds selected set. Ownership persists. |
| GET    | `/replay`                                | `{running,interval_ms,snapshot,end,policy}`.                                                                                                       |
| POST   | `/replay`                                | `{action:"start"                                                                                                                                   | "pause" | "step",interval_ms?:1000..30000}`. Stops at 20; no cyclic wrap. |
| GET    | `/audit`                                 | Latest 200 persisted records.                                                                                                                      |
| GET    | `/users`                                 | Existing accounts, role and active state; no password/session digest.                                                                              |
| PATCH  | `/users/{email}`                         | Exactly `{role,active}`; five role enum and boolean. Revokes all account sessions. Self-change returns 409.                                        |

Report sort: report_id, report_name, monthly_active_views, avg_load_time_sec; admin/analyst additionally total_cost_usd and cost_per_view_usd. Nulls stay last in either direction. Unsupported sort/direction/page/limit returns 400. Search is case-insensitive across report ID/name/owner, capped at 200 characters.

Errors use `{error:string}`: 400 invalid input/JSON; 401 unauthenticated; 403 origin/header/role/demo restriction; 404 missing or out-of-scope resource; 409 state conflict; 413 oversized JSON; 429 rate limit; 500 generic server failure.

## Incident policy

Latency strictly >15 seconds is warning; >30 seconds is critical. FAILED and TIMED_OUT refreshes are critical. UNKNOWN creates a warning DATA_GAP episode and **does not resolve a prior refresh failure**. Only SUCCESS proves refresh recovery. Known latency ≤15 proves latency recovery; null does not. Acknowledgement records review and does not close the incident.

At most one active episode per report/type, enforced by a partial unique SQLite index. Repeated failing samples update message/severity/last_seen and increment sample count; severity changes emit `alert.updated`, without creating a new episode. Recovery timestamps the episode and emits `alert.resolved`. A subsequent failure gets a new ID. Demo source detection timestamps are application times, not CSV measurement dates. Replay preserves episodes while comparing the next source scenario; manual reset deliberately ends the previous scenario's episodes.

## WebSocket

Connect to `ws://localhost:3000/ws?since=<last_id>`; use wss behind HTTPS. Authentication uses the session cookie. Send no messages: incoming messages close with 1008. Up to 5 concurrent streams/session and 100 overall; incoming max 1 KiB, outgoing buffered data over 1 MiB disconnects for client recovery. Ping/pong and session checks run every 15 seconds. Writes and event insertion commit together before broadcast.

Persistent event envelope:

```json
{
  "id": 123,
  "type": "alert.created",
  "payload": {
    "id": 140,
    "report_id": "RPT_200",
    "type": "LATENCY",
    "message": "Load latency 22s exceeds 15s",
    "severity": "warning",
    "source": "SIMULATED_LIVE"
  },
  "created_at": "2026-10-13T12:00:00.000Z"
}
```

Events: alert.created, alert.updated, alert.resolved, alert.acknowledged, telemetry.updated, ownership.updated, scenario.changed, replay.changed, users.changed. Payloads contain only operational/control fields. Source variants: SOURCE_SNAPSHOT, SOURCE_REPLAY, SIMULATED_LIVE. Owner streams filter against **current** ownership even during historical replay. Ownership changes send owners an empty `scope.changed` to force REST refresh, without exposing the removed report. Unrelated owner events become `{id,type:"cursor",payload:{},created_at}`; the global cursor/activity timing is visible but unrelated identities/content are not.

Latest 1,000 events are retained. Valid nonnegative integer `since` replays later retained events in ID order. Cursor older than retention or beyond the latest ID receives control `resync.required`; fetch dashboard and permitted data, adopt its cursor. `connected` is a control message with role and snapshot, without an event ID. Browser refreshes on connect and reconnects with exponential backoff 1–10 seconds; 1008 returns to login. Delivery may be repeated after reconnect, so IDs are the deduplication key. This is a local persistent event log, not an exactly-once distributed message system.
