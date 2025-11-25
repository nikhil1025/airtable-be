import cluster from "cluster";
import os from "os";
import { logger } from "./utils/errors";

const numCPUs = os.cpus().length;

/**
 * Cluster Manager - Spawns worker processes for each CPU core
 * Provides automatic restart on worker crashes
 */
export class ClusterManager {
  private workers: Map<number, any> = new Map();

  start(workerFile: string): void {
    if (cluster.isPrimary) {
      logger.info("🚀 Cluster Manager starting", {
        pid: process.pid,
        cpuCores: numCPUs,
        mode: "cluster",
      });

      // Fork workers for each CPU
      for (let i = 0; i < numCPUs; i++) {
        this.forkWorker();
      }

      // Handle worker exit - restart crashed workers
      cluster.on("exit", (worker, code, signal) => {
        logger.warn("Worker died, restarting...", {
          workerId: worker.id,
          pid: worker.process.pid,
          code,
          signal,
        });

        this.workers.delete(worker.id);
        this.forkWorker();
      });

      // Graceful shutdown
      process.on("SIGTERM", () => this.shutdown());
      process.on("SIGINT", () => this.shutdown());
    } else {
      // Worker process - load the actual server
      require(workerFile);
      logger.info("Worker started", {
        workerId: cluster.worker?.id,
        pid: process.pid,
      });
    }
  }

  private forkWorker(): void {
    const worker = cluster.fork();
    this.workers.set(worker.id, worker);

    logger.info("Worker forked", {
      workerId: worker.id,
      pid: worker.process.pid,
    });
  }

  private async shutdown(): Promise<void> {
    logger.info("Shutting down cluster gracefully...");

    for (const [id, worker] of this.workers) {
      worker.kill("SIGTERM");
      this.workers.delete(id);
    }

    process.exit(0);
  }
}

export default ClusterManager;
