import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["server/index.js"], {
    stdio: "inherit",
    env: { ...process.env, APP_ORIGIN: "http://localhost:5173" },
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--config", "client/vite.config.js"],
    { stdio: "inherit" },
  ),
];
function stop() {
  for (const child of children) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children)
  child.on("exit", () => {
    stop();
    process.exit();
  });
