// CommonJS startup bridge for Passenger/Plesk installations.
import("./server.js").catch(() => {
  console.error(
    "Application startup failed. Check the environment and database configuration.",
  );
  process.exit(1);
});
