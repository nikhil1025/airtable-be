/**
 * Clustered Server Entry Point
 * Uses Node.js cluster module to spawn worker processes for each CPU core
 * This provides horizontal scaling and better resource utilization
 */

import cluster from "cluster";
import os from "os";
import { CookieScraperService } from "./services/CookieScraperService";
import { logger } from "./utils/errors";

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;

  logger.info("Starting cluster", {
    primaryPID: process.pid,
    cpuCores: numCPUs,
  });

  // Fork workers for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    logger.info("Worker forked", {
      workerPID: worker.process.pid,
      coreIndex: i,
    });
  }

  // Handle worker crashes
  cluster.on("exit", (worker, code, signal) => {
    logger.error("Worker died", {
      workerPID: worker.process.pid,
      code,
      signal,
    });

    // Auto-restart crashed worker
    const newWorker = cluster.fork();
    logger.info("Worker restarted", {
      oldPID: worker.process.pid,
      newPID: newWorker.process.pid,
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Primary process shutting down...");

    // Disconnect all workers
    for (const id in cluster.workers) {
      cluster.workers[id]?.disconnect();
    }

    // Shutdown worker pool
    await CookieScraperService.shutdownWorkerPool();

    setTimeout(() => {
      logger.info("Forcing shutdown");
      process.exit(0);
    }, 10000); // Force exit after 10 seconds
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  // Worker process - load the actual server
  require("./server");
  logger.info("Worker process started", {
    workerPID: process.pid,
    workerID: cluster.worker?.id,
  });
}
