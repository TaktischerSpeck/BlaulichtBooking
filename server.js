import { getConfig } from "./src/config.js";
import { openDatabase, bootstrap } from "./src/database.js";
import { BookingService } from "./src/bookings.js";
import { Integrations } from "./src/integrations.js";
import { createApp } from "./src/app.js";

const config = getConfig();
const db = openDatabase(config.database);
bootstrap(db, config);
const service = new BookingService(db, config);
const integrations = new Integrations(service);
const app = createApp(service, integrations);
integrations.maintenance();
const server = app.listen(config.port, config.host, () =>
  console.log(`BlaulichtBooking listening on ${config.host}:${config.port}`),
);
const jobs = setInterval(
  () =>
    integrations
      .processJobs()
      .catch(() => console.error("Background processing failed")),
  5000,
);
const maintenance = setInterval(() => {
  try {
    integrations.maintenance();
  } catch {
    console.error("Maintenance failed");
  }
}, 60000);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(jobs);
    clearInterval(maintenance);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  });
