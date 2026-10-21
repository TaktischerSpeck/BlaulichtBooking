import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../src/database.js";
import { BookingService } from "../src/bookings.js";
if (workerData) {
  const db = openDatabase(workerData.path),
    s = new BookingService(db, workerData.config);
  const barrier = new Int32Array(workerData.barrier);
  if (Atomics.load(barrier, 0) === 0) Atomics.wait(barrier, 0, 0, 10000);
  try {
    parentPort.postMessage({
      status: s.decide(workerData.raw, {
        decision: "approve",
        vehicleIds: ["v1"],
      }).status,
    });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  } finally {
    db.close();
  }
}
