import { chromium, expect } from "@playwright/test";
import { createApplication } from "../server/app.js";
import { mkdirSync } from "node:fs";
const port = Number(process.env.BROWSER_TEST_PORT ?? 3107),
  origin = `http://localhost:${port}`;
const browserOrigin = `http://${process.env.BROWSER_TEST_HOST ?? "localhost"}:${port}`;
const service = createApplication({ dbPath: ":memory:", origin });
await new Promise((r) => service.server.listen(port, "127.0.0.1", r));
mkdirSync("test-results", { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? ["--no-sandbox", "--disable-dev-shm-usage"]
      : [],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(browserOrigin);
  await expect(
    page.getByRole("heading", { name: "Welcome to operations." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/login.png" });
  await page.getByRole("button", { name: "Open command centre" }).click();
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  await expect(page.getByText("Live stream connected")).toBeVisible();
  await expect(page.getByText("Observation set 1 of 20")).toBeVisible();
  await page.screenshot({ path: "test-results/overview.png", fullPage: true });
  for (const [button, title] of [
    ["Cost intelligence", "Cost intelligence"],
    ["Data validation", "Data validation"],
    ["Audit trail", "Audit trail"],
    ["Alert centre", "Alert centre"],
  ]) {
    await page
      .getByRole("button", { name: button, exact: button !== "Alert centre" })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: `test-results/${title.toLowerCase().replaceAll(" ", "-")}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Report inventory", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search reports" }).fill("RPT_203");
  await expect(page.getByText("1 reports in view")).toBeVisible();
  await page.getByRole("button", { name: "Inspect RPT_203" }).click();
  await page
    .getByRole("textbox", { name: "Assign owner email" })
    .fill("operations@company.com");
  await page.getByRole("button", { name: "Save owner", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("operations@company.com", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pure-insights-scenario-1.csv");
  await page.getByRole("textbox", { name: "Search reports" }).fill("RPT_200");
  await expect(page.getByText("1 reports in view")).toBeVisible();
  await page.getByRole("button", { name: "Inspect RPT_200" }).click();
  await page
    .getByRole("button", { name: "Recover report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("2.5s", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Slow + failed", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("22s", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Simulated live", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/telemetry.png", fullPage: true });
  // Hold a live refresh in flight, close the drawer, then release the response.
  // This reproduces the stale-closure race instead of relying on incidental timing.
  let releaseRefresh, refreshStarted;
  const gate = new Promise((r) => {
    releaseRefresh = r;
  });
  const started = new Promise((r) => {
    refreshStarted = r;
  });
  await page.route("**/api/reports?limit=100", async (route) => {
    refreshStarted();
    await gate;
    await route.continue();
  });
  await page.request.post(browserOrigin + "/api/reports/RPT_200/telemetry", {
    headers: { "X-App-Request": "pure-insights" },
    data: { avg_load_time_sec: 22, last_refresh_status: "FAILED" },
  });
  await started;
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  releaseRefresh();
  await page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/reports?limit=100") &&
      response.status() === 200,
  );
  await page.unroute("**/api/reports?limit=100");
  await page.getByRole("button", { name: "Alert centre" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Report inventory", exact: true })
    .click();
  await page.getByRole("button", { name: "Inspect RPT_200" }).click();

  await page
    .getByRole("button", { name: "Recover report", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Alert centre" }).click();
  await page.getByRole("button", { name: "resolved", exact: true }).click();
  await expect(
    page.locator(".alert-main").filter({ hasText: "RPT_200" }),
  ).not.toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Observation set", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "Load / reset" }).click();
  await expect(page.getByText("Observation set 2 of 20")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to operations." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "viewer", exact: true }).click();
  await page.getByRole("button", { name: "Open command centre" }).click();
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cost intelligence", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load / reset" })).toHaveCount(
    0,
  );
  const costResponse = await page.request.get(browserOrigin + "/api/costs");
  expect(costResponse.status()).toBe(403);
  await page
    .getByRole("button", { name: "Report inventory", exact: true })
    .click();
  await page.getByRole("button", { name: "Inspect RPT_200" }).click();
  await expect(
    page.getByRole("button", { name: "Publish sample" }),
  ).toHaveCount(0);
  await expect(page.getByText("Combined cost", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to operations." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: "analyst", exact: true }).click();
  await page.getByRole("button", { name: "Open command centre" }).click();
  await expect(
    page.getByRole("button", { name: "Cost intelligence", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Audit trail", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Alert centre" }).click();
  const acknowledge = page
    .getByRole("button", { name: "Acknowledge", exact: true })
    .first();
  await acknowledge.click();
  await expect(
    page.getByText("Alert acknowledged", { exact: true }),
  ).toBeVisible();
  // New cost explorer, replay controls and owner/engineer journeys.
  await page
    .getByRole("button", { name: "Cost intelligence", exact: true })
    .click();
  await expect(page.getByText("8 / 8 checks", { exact: true })).toBeVisible();
  for (const mode of ["scatter", "sensitivity", "proxy", "chargeback"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.screenshot({
      path: `test-results/cost-${mode}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  expect(await page.locator("html").getAttribute("data-theme")).toBe("light");
  await page.screenshot({
    path: "test-results/light-costs.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "admin", exact: true }).click();
  await page.getByRole("button", { name: "Open command centre" }).click();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.getByText("Observation set 3 of 20")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Replay speed" })
    .selectOption("1000");
  await page.getByRole("button", { name: "Start replay", exact: true }).click();
  await expect(
    page.getByText("Source replay running", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Dataset replay" })
      .getByText("Replay paused", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Report inventory", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search reports" }).fill("RPT_200");
  await page.getByRole("button", { name: "Inspect RPT_200" }).click();
  await page
    .getByRole("button", { name: "Assign to demo owner", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("owner@pureinsights.demo", { exact: true }),
  ).toBeVisible();
  await page.getByText("All 20 source observations", { exact: true }).click();
  await expect(
    page.getByText(
      "Source order only. Twenty undated observations, not a time series.",
    ),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/evidence.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Audit trail", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace accounts" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "owner", exact: true }).click();
  await page.getByRole("button", { name: "Open command centre" }).click();
  await expect(
    page.locator(".metric").first().getByText("1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Report inventory", exact: true })
    .click();
  await expect(page.getByText("1 reports in view")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cost intelligence", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/owner-scope.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "engineer", exact: true }).click();
  await page.getByRole("button", { name: "Open command centre" }).click();
  await page
    .getByRole("button", { name: "Report inventory", exact: true })
    .click();
  await page.getByRole("button", { name: "Inspect RPT_200" }).click();
  await expect(
    page.getByRole("button", { name: "Publish sample", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save owner", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Combined cost", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  console.log(
    "Browser checks passed: login, all six views, search, owner assignment, export, live alert/recovery, scenario reset, viewer and analyst RBAC, mobile layout, cost verification/explorer, dark/light themes, replay, owner scope, engineer operation, evidence/history, delayed-refresh drawer closure, no page errors.",
  );
} finally {
  await browser?.close();
  await service.close();
}
