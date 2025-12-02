import * as path from "path";
import { Worker } from "worker_threads";
import { connectDatabase } from "../config/database";
import AirtableConnection from "../models/AirtableConnection";
import Ticket from "../models/Ticket";
import { decrypt, isEncrypted } from "../utils/encryption";

/**
 * BLAZING FAST PARALLEL REVISION HISTORY FETCH
 * Uses worker threads with axios (NO PUPPETEER)
 * Processes all tickets concurrently for maximum performance
 */

interface WorkerTask {
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
  revisions?: any[];
}

class ParallelRevisionFetcher {
  private maxWorkers: number;
  private activeWorkers: number = 0;
  private taskQueue: WorkerTask[] = [];
  private results: WorkerResult[] = [];
  private startTime: number = 0;

  constructor(maxWorkers: number = 8) {
    this.maxWorkers = maxWorkers;
    console.log(
      `\n🚀 Parallel Fetcher initialized with ${maxWorkers} workers\n`
    );
  }

  async fetchAll(): Promise<void> {
    this.startTime = Date.now();
    console.log("📊 Step 1: Fetching all tickets from MongoDB...");

    const tickets = await Ticket.find({});
    console.log(`✅ Found ${tickets.length} tickets\n`);

    if (tickets.length === 0) {
      console.log("ℹ️  No tickets to process");
      return;
    }

    console.log("🔑 Step 2: Fetching user connections and cookies...");
    const userIds = [...new Set(tickets.map((t) => t.userId))];
    const connections = await AirtableConnection.find({
      userId: { $in: userIds },
    });

    const connectionMap = new Map(
      connections.map((conn) => [conn.userId, conn])
    );
    console.log(`✅ Loaded connections for ${connections.length} users\n`);

    console.log("📝 Step 3: Building task queue...");
    for (const ticket of tickets) {
      const connection = connectionMap.get(ticket.userId);

      if (!connection?.cookies) {
        console.warn(`⚠️  Skipping ${ticket.airtableRecordId} - no cookies`);
        continue;
      }

      let cookiesString = connection.cookies;
      if (isEncrypted(cookiesString)) {
        cookiesString = decrypt(cookiesString);
      }

      this.taskQueue.push({
        recordId: ticket.airtableRecordId,
        baseId: ticket.baseId,
        cookies: cookiesString,
        applicationId: ticket.baseId,
        userId: ticket.userId,
      });
    }

    console.log(`✅ Created ${this.taskQueue.length} tasks\n`);
    console.log(
      `⚡ Step 4: Processing with ${this.maxWorkers} parallel workers...\n`
    );

    await this.processParallel();

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    this.printSummary(duration);
  }

  private async processParallel(): Promise<void> {
    return new Promise((resolve) => {
      const startWorkers = () => {
        while (
          this.activeWorkers < this.maxWorkers &&
          this.taskQueue.length > 0
        ) {
          const task = this.taskQueue.shift();
          if (task) {
            this.spawnWorker(task, startWorkers, resolve);
          }
        }
      };

      startWorkers();
    });
  }

  private spawnWorker(
    task: WorkerTask,
    startWorkers: () => void,
    onAllComplete: () => void
  ) {
    this.activeWorkers++;

    const workerPath = path.join(
      __dirname,
      "../workers/revisionHistoryFetchWorker.js"
    );

    const worker = new Worker(workerPath, {
      workerData: task,
    });

    worker.on("message", (result: WorkerResult) => {
      this.results.push(result);
      this.activeWorkers--;

      const status = result.success ? "✅" : "❌";
      const msg = result.success
        ? `${result.revisionsFound} revisions`
        : result.error;

      console.log(
        `${status} [${this.results.length}/${
          this.taskQueue.length + this.results.length
        }] ${task.recordId.substring(0, 15)}... - ${msg}`
      );

      if (this.taskQueue.length > 0) {
        startWorkers();
      } else if (this.activeWorkers === 0) {
        onAllComplete();
      }
    });

    worker.on("error", (error) => {
      this.activeWorkers--;
      console.error(`❌ Worker error: ${task.recordId} - ${error.message}`);

      this.results.push({
        success: false,
        recordId: task.recordId,
        revisionsFound: 0,
        error: error.message,
      });

      if (this.taskQueue.length > 0) {
        startWorkers();
      } else if (this.activeWorkers === 0) {
        onAllComplete();
      }
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`❌ Worker exited with code ${code}: ${task.recordId}`);
      }
    });
  }

  private printSummary(duration: string) {
    const successful = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const totalRevisions = this.results.reduce(
      (sum, r) => sum + r.revisionsFound,
      0
    );

    console.log("\n" + "=".repeat(60));
    console.log("🎉 PROCESSING COMPLETE");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Total Tasks: ${this.results.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📝 Total Revisions Found: ${totalRevisions}`);
    console.log(`⚡ Workers Used: ${this.maxWorkers}`);
    console.log(
      `🚀 Speed: ${(this.results.length / parseFloat(duration)).toFixed(
        2
      )} records/sec`
    );
    console.log("=".repeat(60) + "\n");

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
    console.log("\n" + "=".repeat(60));
    console.log("⚡ BLAZING FAST PARALLEL REVISION HISTORY FETCH");
    console.log("🚫 NO PUPPETEER - Pure axios with worker threads");
    console.log("=".repeat(60) + "\n");

    await connectDatabase();
    console.log("✅ Database connected\n");

    const fetcher = new ParallelRevisionFetcher(8); // 8 concurrent workers
    await fetcher.fetchAll();

    console.log("✅ All done! Closing database connection...");
    process.exit(0);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main();
