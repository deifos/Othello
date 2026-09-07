import { resolve } from "node:path";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");

const app = createApp({
  databasePath: process.env.DATABASE_PATH ?? resolve("data/leaderboard.sqlite"),
  distPath: resolve("dist"),
  allowedOrigin: process.env.ALLOWED_ORIGIN,
});

app.server.listen(port, "0.0.0.0", () => {
  console.log(`Practice rankings are ready at http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
