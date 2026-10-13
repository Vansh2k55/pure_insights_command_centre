# Upgrade notes — version 2

The interface uses visual inspiration from Tridib's dark/orange presentation and compact navigation. Code and documentation were independently implemented; peer repository code/assets were not copied. Comparisons informed choices rather than imposing another project's assumptions.

| Area           | Original version                        | Version 2                                                                                                                      |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Presentation   | Light dashboard/sidebar                 | Dark/orange compact navigation, light theme, health/latency highlights, responsive layout                                      |
| Real-time demo | Manual samples + source selector        | Controlled automatic replay, pause/step/speed, end-stop; persistent source state with paused restart                           |
| Permissions    | Admin/analyst/viewer                    | Adds engineer and currently scoped owner, redaction across history/CSV/summary, existing-account access editor with revocation |
| Ownership      | Source-set override                     | Explicit operational assignments persist independently of telemetry and source resets; source owners/history preserved         |
| Alerts         | Failure/latency, dedup, ack, recovery   | Severity changes, sample counts, unknown-data gaps, confirmed recovery, resolution reason, stronger stream resource caps       |
| Costs          | Report totals/unit costs + separate SQL | Executed interactive SQL lab, coverage/reconciliation, chargeback/scatter/sensitivity, clearly separate allocation proxy       |
| Evidence       | Current source row                      | Inspectable deterministic assistant and all twenty original observations with role projection                                  |
| Handover       | Prose REST/stream guide                 | Adds OpenAPI/AsyncAPI and independent standard-library source validator; broader browser and integration checks                |

Preserved strengths: original source bytes, no invented calendar history, no row-wide deletion for a financial defect, matching cost/view denominator, opaque revocable cookie sessions, persisted incidents/audit and no cloud-key requirement.

This remains a single-instance synthetic assessment application. A native Snowflake account, genuine telemetry collector and enterprise identity/broker infrastructure are not claimed. The accompanying verification report identifies executed checks and remaining environment limits.
