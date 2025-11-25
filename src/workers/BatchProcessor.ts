import path from "path";
import { Worker } from "worker_threads";
import { logger } from "../utils/errors";

interface BatchTask {
  id: string;
  data: any;
}

interface BatchResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Batch Processor - Processes large batches in parallel using worker threads
 */
export class BatchProcessor {
  private readonly poolSize: number;

  constructor(poolSize: number = 8) {
    this.poolSize = poolSize;
  }

  async processBatch<T, R>(
    items: T[],
    processFn: (item: T) => Promise<R>,
    options: {
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<R[]> {
    const concurrency = options.concurrency || this.poolSize;
    const results: R[] = [];
    let completed = 0;

    // Process in chunks
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((item) => processFn(item))
      );

      results.push(...chunkResults);
      completed += chunk.length;

      if (options.onProgress) {
        options.onProgress(completed, items.length);
      }
    }

    return results;
  }

  async processWithWorkers(
    tasks: BatchTask[],
    workerFile: string
  ): Promise<BatchResult[]> {
    const workerPath = path.resolve(__dirname, workerFile);
    const results: BatchResult[] = [];
    const workers: Worker[] = [];

    // Create worker pool
    for (let i = 0; i < Math.min(this.poolSize, tasks.length); i++) {
      workers.push(new Worker(workerPath));
    }

    logger.info("Processing batch with workers", {
      tasks: tasks.length,
      workers: workers.length,
    });

    try {
      // Distribute tasks to workers
      const promises = tasks.map((task, index) => {
        const worker = workers[index % workers.length];

        return new Promise<BatchResult>((resolve) => {
          worker.once("message", (result) => {
            resolve({
              id: task.id,
              success: result.success,
              data: result.data,
              error: result.error,
            });
          });

          worker.postMessage(task);
        });
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);

      logger.info("Batch processing completed", {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      });

      return results;
    } finally {
      // Terminate workers
      await Promise.all(workers.map((w) => w.terminate()));
    }
  }
}

export default BatchProcessor;
