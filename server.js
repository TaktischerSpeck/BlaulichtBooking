import { createServer } from "node:http";
import { getConfig } from "./src/config.js";
import { runtimeEnv } from "./src/runtime-settings.js";
import { openDatabase, bootstrap } from "./src/database.js";
import { BookingService } from "./src/bookings.js";
import { Integrations } from "./src/integrations.js";
import { createApp } from "./src/app.js";
import { createSetupApp } from "./src/setup.js";

let handler, db, jobs, maintenance;
function activate(config, database) {
  db = database;
  const service = new BookingService(db, config);
  const integrations = new Integrations(service);
  integrations.maintenance();
  handler = createApp(service, integrations);
  jobs = setInterval(
    () =>
      integrations
        .processJobs()
        .catch(() => console.error("Background processing failed")),
    5000,
  );
  maintenance = setInterval(() => {
    try {
      integrations.maintenance();
    } catch {
      console.error("Maintenance failed");
    }
  }, 60000);
}
const env = runtimeEnv();
if (env.APP_KEY) {
  const config = getConfig(env);
  const database = openDatabase(config.database);
  bootstrap(database, config);
  activate(config, database);
} else handler = createSetupApp(env, activate);

const server = createServer((req, res) => handler(req, res));
server.listen(Number(env.PORT || 3000), env.HOST || "127.0.0.1", () =>
  console.log("BlaulichtBooking started."),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(jobs);
    clearInterval(maintenance);
    server.close(() => {
      db?.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  });
