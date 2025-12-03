import { logger } from "../utils/errors";

export interface BatchProcessOptions {
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

export class BatchProcessor {
  private poolSize: number;

  constructor(poolSize: number) {
    this.poolSize = poolSize;
    logger.info("BatchProcessor initialized", { poolSize });
  }

  async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: BatchProcessOptions = {}
  ): Promise<R[]> {
    const { concurrency = this.poolSize, onProgress } = options;
    
    if (items.length === 0) {
      return [];
    }

    logger.info("Starting batch processing", {
      itemCount: items.length,
      concurrency,
      poolSize: this.poolSize,
    });

    const results: R[] = new Array(items.length);
    const errors: Array<{ index: number; error: any }> = [];
    let completed = 0;

    // Process items in chunks based on concurrency limit
    const chunks = this.chunkArray(items, concurrency);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (item, chunkIndex) => {
        const globalIndex = chunks.indexOf(chunk) * concurrency + chunkIndex;
        
        try {
          const result = await processor(item);
          results[globalIndex] = result;
          completed++;
          
          if (onProgress) {
            onProgress(completed, items.length);
          }
          
          return { index: globalIndex, result };
        } catch (error) {
          errors.push({ index: globalIndex, error });
          completed++;
          
          if (onProgress) {
            onProgress(completed, items.length);
          }
          
          logger.error("Batch processing item failed", error, {
            index: globalIndex,
            item: this.safeStringify(item),
          });
          
          // Return null for failed items
          return { index: globalIndex, result: null as any };
        }
      });

      // Wait for current chunk to complete before starting next chunk
      await Promise.all(chunkPromises);
    }

    if (errors.length > 0) {
      logger.warn("Batch processing completed with errors", {
        totalItems: items.length,
        successful: items.length - errors.length,
        failed: errors.length,
        errorSummary: errors.map(e => ({
          index: e.index,
          error: e.error instanceof Error ? e.error.message : String(e.error)
        }))
      });
    } else {
      logger.info("Batch processing completed successfully", {
        totalItems: items.length,
        concurrency,
      });
    }

    return results;
  }

  async processParallel<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = this.poolSize
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }

    logger.info("Starting parallel processing", {
      itemCount: items.length,
      concurrency,
    });

    const results: R[] = [];
    const semaphore = new Semaphore(concurrency);

    const promises = items.map(async (item, index) => {
      await semaphore.acquire();
      
      try {
        const result = await processor(item);
        results[index] = result;
        return result;
      } catch (error) {
        logger.error("Parallel processing item failed", error, {
          index,
          item: this.safeStringify(item),
        });
        throw error;
      } finally {
        semaphore.release();
      }
    });

    const settledResults = await Promise.allSettled(promises);
    
    const successful = settledResults.filter(r => r.status === 'fulfilled').length;
    const failed = settledResults.filter(r => r.status === 'rejected').length;

    logger.info("Parallel processing completed", {
      totalItems: items.length,
      successful,
      failed,
      concurrency,
    });

    return results.filter(result => result !== undefined);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (error) {
      return String(obj);
    }
  }
}
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waiting.push(resolve);
      }
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      this.permits--;
      resolve();
    }
  }
}