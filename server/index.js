import { createApplication } from "./app.js";
const service = createApplication();
const port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1";
service.server.listen(port, host, () =>
  console.log(
    `Pure Insights ready at http://${host}:${port} (${process.env.DEMO_MODE === "false" ? "configured" : "demo"} mode)`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await service.close();
    process.exit(0);
  });
