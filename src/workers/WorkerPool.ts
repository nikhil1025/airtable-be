import path from "path";
import { Worker } from "worker_threads";
import { logger } from "../utils/errors";
import fs from "fs";

/**
 * Worker Pool - Manages pool of worker threads for parallel processing
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{
    task: any;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private activeWorkers = 0;

  constructor(private workerFile: string, private poolSize: number = 4) {
    this.initializePool();
  }

  private initializePool(): void {
    // Determine if we're running in development (ts-node) or production (compiled)
    let workerPath = path.resolve(__dirname, this.workerFile);
    
    // If .js file doesn't exist, try .ts (development mode with ts-node)
    if (!fs.existsSync(workerPath) && workerPath.endsWith('.js')) {
      const tsPath = workerPath.replace(/\.js$/, '.ts');
      if (fs.existsSync(tsPath)) {
        workerPath = tsPath;
        logger.info("Using TypeScript worker file for development", { workerPath });
      }
    }

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerPath, {
        execArgv: workerPath.endsWith('.ts') ? ['-r', 'ts-node/register'] : [],
      });
      this.workers.push(worker);

      worker.on("error", (error) => {
        logger.error("Worker thread error", error);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          logger.warn("Worker thread exited with error", { code });
        }
      });
    }

    logger.info("Worker pool initialized", {
      workerFile: workerPath,
      poolSize: this.poolSize,
    });
  }

  async execute<T>(task: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const availableWorker = this.workers.find(
        (w) => !w.listenerCount("message")
      );

      if (availableWorker && this.activeWorkers < this.poolSize) {
        this.runTask(availableWorker, task, resolve, reject);
      } else {
        this.queue.push({ task, resolve, reject });
      }
    });
  }

  private runTask(
    worker: Worker,
    task: any,
    resolve: (value: any) => void,
    reject: (error: any) => void
  ): void {
    this.activeWorkers++;

    const messageHandler = (result: any) => {
      worker.removeListener("message", messageHandler);
      worker.removeListener("error", errorHandler);
      this.activeWorkers--;

      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error));
      }

      // Process next queued task
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.runTask(worker, next.task, next.resolve, next.reject);
      }
    };

    const errorHandler = (error: Error) => {
      worker.removeListener("message", messageHandler);
      worker.removeListener("error", errorHandler);
      this.activeWorkers--;
      reject(error);
    };

    worker.once("message", messageHandler);
    worker.once("error", errorHandler);
    worker.postMessage(task);
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    logger.info("Worker pool terminated");
  }
}

export default WorkerPool;
