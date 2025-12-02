import * as path from "path";
import { Worker } from "worker_threads";
import { connectDatabase } from "../config/database";
import AirtableConnection from "../models/AirtableConnection";
import Ticket from "../models/Ticket";
import { decrypt, isEncrypted } from "../utils/encryption";

/**
 * OPTIMIZED BATCH PROCESSING WITH WORKER THREADS
 * - Each worker connects to MongoDB ONCE
 * - Tasks divided evenly across workers
 * - Batch bulkWrite operations per worker
 * - NO PUPPETEER - Pure axios
 */

interface TaskItem {
  recordId: string;
  baseId: string;
  cookies: string;
  applicationId: string;
  userId: string;
}

interface WorkerResult {
  success: boolean;
  recordId: string;
  revisionsFound: number;
  error?: string;
}

interface ProgressMessage {
  type: "progress";
  workerId: number;
  processed: number;
  total: number;
  recordId: string;
  revisionsFound: number;
}

interface CompleteMessage {
  type: "complete";
  workerId: number;
  results: WorkerResult[];
  totalRevisions: number;
}

class BatchRevisionFetcher {
  private maxWorkers: number;
  private allTasks: TaskItem[] = [];
  private results: WorkerResult[] = [];
  private startTime: number = 0;
  private processedCount: number = 0;

  constructor(maxWorkers: number = 8) {
    this.maxWorkers = maxWorkers;
    console.log(`\n🚀 Batch Processor with ${maxWorkers} workers\n`);
  }

  async fetchAll(): Promise<void> {
    this.startTime = Date.now();
    console.log("📊 Step 1: Loading tickets from MongoDB...");

    const tickets = await Ticket.find({});
    console.log(`✅ Found ${tickets.length} tickets\n`);

    if (tickets.length === 0) {
      console.log("ℹ️  No tickets to process");
      return;
    }

    console.log("🔑 Step 2: Loading connections...");
    const userIds = [...new Set(tickets.map((t) => t.userId))];
    const connections = await AirtableConnection.find({
      userId: { $in: userIds },
    });

    const connectionMap = new Map(
      connections.map((conn) => [conn.userId, conn])
    );
    console.log(`✅ Loaded ${connections.length} connections\n`);

    console.log("📝 Step 3: Building task list...");
    for (const ticket of tickets) {
      const connection = connectionMap.get(ticket.userId);

      if (!connection?.cookies) continue;

      let cookiesString = connection.cookies;
      if (isEncrypted(cookiesString)) {
        cookiesString = decrypt(cookiesString);
      }

      this.allTasks.push({
        recordId: ticket.airtableRecordId,
        baseId: ticket.baseId,
        cookies: cookiesString,
        applicationId: ticket.baseId,
        userId: ticket.userId,
      });
    }

    console.log(`✅ ${this.allTasks.length} tasks ready\n`);
    console.log(
      `⚡ Step 4: Dividing ${this.allTasks.length} tasks across ${this.maxWorkers} workers...\n`
    );

    await this.processBatches();

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    this.printSummary(duration);
  }

  private async processBatches(): Promise<void> {
    // Divide tasks evenly
    const batches: TaskItem[][] = [];
    const tasksPerWorker = Math.ceil(this.allTasks.length / this.maxWorkers);

    for (let i = 0; i < this.maxWorkers; i++) {
      const start = i * tasksPerWorker;
      const end = Math.min(start + tasksPerWorker, this.allTasks.length);
      const batch = this.allTasks.slice(start, end);

      if (batch.length > 0) {
        batches.push(batch);
        console.log(`   Worker ${i + 1}: ${batch.length} tasks`);
      }
    }

    console.log(`\n🔥 Starting ${batches.length} workers...\n`);

    // Spawn all workers in parallel
    const workerPromises = batches.map((batch, index) =>
      this.spawnBatchWorker(index + 1, batch)
    );

    await Promise.all(workerPromises);
  }

  private async spawnBatchWorker(
    workerId: number,
    batch: TaskItem[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(
        __dirname,
        "../workers/revisionHistoryFetchWorker.js"
      );

      const worker = new Worker(workerPath, {
        workerData: {
          workerId,
          tasks: batch,
        },
      });

      worker.on("message", (message: ProgressMessage | CompleteMessage) => {
        if (message.type === "progress") {
          this.processedCount++;
          const status = message.revisionsFound > 0 ? "✅" : "⚪";
          console.log(
            `${status} [${this.processedCount}/${this.allTasks.length}] W${
              message.workerId
            } - ${message.recordId.substring(0, 18)}... → ${
              message.revisionsFound
            } revisions`
          );
        } else if (message.type === "complete") {
          this.results.push(...message.results);
          console.log(
            `\n✨ Worker ${message.workerId} DONE: ${message.totalRevisions} total revisions\n`
          );
          resolve();
        }
      });

      worker.on("error", (error) => {
        console.error(`❌ Worker ${workerId} error:`, error.message);
        reject(error);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(`❌ Worker ${workerId} exited with code ${code}`);
        }
      });
    });
  }

  private printSummary(duration: string) {
    const successful = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const totalRevisions = this.results.reduce(
      (sum, r) => sum + r.revisionsFound,
      0
    );

    console.log("\n" + "=".repeat(70));
    console.log("🎉 BATCH PROCESSING COMPLETE");
    console.log("=".repeat(70));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Total Records: ${this.results.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📝 Total Revisions: ${totalRevisions}`);
    console.log(`⚡ Workers: ${this.maxWorkers}`);
    console.log(
      `🔄 MongoDB Connections: ${this.maxWorkers} (one per worker, reused)`
    );
    console.log(`🗄️  Database Writes: ${this.maxWorkers} bulkWrite operations`);
    console.log(
      `🚀 Speed: ${(this.results.length / parseFloat(duration)).toFixed(
        2
      )} records/sec`
    );
    console.log("=".repeat(70) + "\n");

    if (failed > 0) {
      console.log("❌ Failed Records:");
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`   - ${r.recordId}: ${r.error}`);
        });
      console.log();
    }

    if (totalRevisions > 0) {
      console.log("📋 Records with Revisions:");
      this.results
        .filter((r) => r.success && r.revisionsFound > 0)
        .forEach((r) => {
          console.log(`   - ${r.recordId}: ${r.revisionsFound} revisions`);
        });
      console.log();
    }
  }
}

async function main() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("⚡ OPTIMIZED BATCH PROCESSING");
    console.log("🚫 NO PUPPETEER - Pure axios");
    console.log("🔄 One MongoDB connection per worker (reused for all tasks)");
    console.log("📦 Batch bulkWrite operations");
    console.log("=".repeat(70) + "\n");

    await connectDatabase();
    console.log("✅ Main thread connected to MongoDB\n");

    const fetcher = new BatchRevisionFetcher(8);
    await fetcher.fetchAll();

    console.log("✅ Complete! Exiting...");
    process.exit(0);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main();
