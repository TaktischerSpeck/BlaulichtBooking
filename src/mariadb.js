import {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
} from "node:worker_threads";

// Preserve the existing synchronous transaction boundary for both backends.
// Network I/O runs in a dedicated worker, using one connection per app process.
export class MariaDatabase {
  constructor(options) {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.worker = new Worker(new URL("./mariadb-worker.js", import.meta.url), {
      workerData: { options, port: port2 },
      transferList: [port2],
    });
    this.worker.on("error", () => {
      this.closed = true;
    });
    this.worker.unref();
    this.port.unref();
    this.kind = "mariadb";
    try {
      this.call("initialize");
    } catch (error) {
      this.close();
      throw error;
    }
  }
  call(action, sql, params = []) {
    if (this.closed)
      throw new Error(
        "Database connection unavailable. Restart the application.",
      );
    const signal = new Int32Array(new SharedArrayBuffer(4));
    this.port.postMessage({ action, sql, params, signal });
    const result = Atomics.wait(signal, 0, 0, 45000);
    if (result === "timed-out") {
      this.close();
      throw new Error("Database operation timed out. Restart the application.");
    }
    const response = receiveMessageOnPort(this.port)?.message;
    if (!response) throw new Error("Database worker returned no response.");
    if (response.error)
      throw Object.assign(new Error(response.error.message), {
        code: response.error.code,
      });
    return response.result;
  }
  prepare(sql) {
    return {
      get: (...params) => this.call("get", sql, params),
      all: (...params) => this.call("all", sql, params),
      run: (...params) => this.call("run", sql, params),
    };
  }
  exec(sql) {
    return this.call("exec", sql);
  }
  close() {
    if (this.disposed) return;
    this.disposed = true;
    // Worker termination also releases connection-scoped database locks.
    this.worker.terminate();
    this.port.close();
    this.closed = true;
  }
}
