import { PaginationMetadata } from "../types";

/**
 * Handles Airtable API pagination metadata
 */
export function handleAirtablePagination<T extends { offset?: string }>(
  response: T
): PaginationMetadata {
  return {
    offset: response.offset,
    hasMore: Boolean(response.offset),
  };
}

/**
 * Builds a paginated response object
 */
export function buildPaginatedResponse<T>(
  data: T,
  offset?: string,
  hasMore: boolean = false
): T & PaginationMetadata {
  return {
    ...data,
    offset,
    hasMore,
  };
}

/**
 * Delays execution for a specified time
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const err = error as { response?: { status?: number } };
      const statusCode = err.response?.status;

      // Don't retry on client errors (except rate limit)
      if (
        statusCode &&
        statusCode >= 400 &&
        statusCode < 500 &&
        statusCode !== 429
      ) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delayMs = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Chunks an array into smaller arrays of specified size
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Rate limiter class
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeCount = 0;
  private readonly maxConcurrent: number;
  private readonly minInterval: number;
  private lastCallTime = 0;

  constructor(maxConcurrent: number = 5, requestsPerSecond: number = 5) {
    this.maxConcurrent = maxConcurrent;
    this.minInterval = 1000 / requestsPerSecond;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot();
    this.activeCount++;

    try {
      const now = Date.now();
      const timeSinceLastCall = now - this.lastCallTime;

      if (timeSinceLastCall < this.minInterval) {
        await delay(this.minInterval - timeSinceLastCall);
      }

      this.lastCallTime = Date.now();
      return await fn();
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  private waitForSlot(): Promise<void> {
    if (this.activeCount < this.maxConcurrent) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    }
  }
}

export default {
  handleAirtablePagination,
  buildPaginatedResponse,
  delay,
  retryWithBackoff,
  chunkArray,
  RateLimiter,
};
