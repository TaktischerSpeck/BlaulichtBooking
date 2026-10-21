import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function walk(folder) {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isDirectory()) walk(path);
    else if (path.endsWith(".js"))
      execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
  }
}
for (const folder of ["src", "public", "scripts", "tests"]) walk(folder);
execFileSync(process.execPath, ["--check", "server.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "app.cjs"], { stdio: "inherit" });
console.log(
  "All JavaScript syntax checks passed. The browser assets are buildless.",
);
