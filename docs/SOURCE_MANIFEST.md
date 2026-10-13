# Source dataset integrity

The provided CSV is preserved as `data/reports.csv` without modification.

Original upload name: `Case_Study_3_Technical Data AI Validation Intern - Monetization.csv`.

SHA-256: `bee8b5a451167aab11add9c6c2fc959f37d0c93b6ebc2560a93254849c8f4d50`.

The dataset has 2,000 data rows and ten columns. Byte comparison against the upload passed. Normalization and validation happen in memory, with original source-row references; persistent runtime changes are kept in SQLite rather than written into the source file.
