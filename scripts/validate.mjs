import { loadDataset, datasetAudit, summarize } from "../server/domain.js";
const rows = loadDataset(new URL("../data/reports.csv", import.meta.url));
console.log(
  JSON.stringify(
    {
      dataset: datasetAudit(rows),
      scenario_1: summarize(
        rows.filter((r) => r.observation === 1),
        "analyst",
        3,
      ),
    },
    null,
    2,
  ),
);
