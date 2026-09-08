import { execFileSync } from "node:child_process";
import { build } from "vite";

execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-b"], { stdio: "inherit" });
// Process values take precedence over ignored local Vite environment files.
process.env.VITE_PARTYKIT_HOST = "same-origin";
process.env.VITE_LEADERBOARD_URL = "";
await build();
