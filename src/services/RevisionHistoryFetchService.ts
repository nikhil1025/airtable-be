import * as path from "path";
import { Worker } from "worker_threads";
import { AirtableConnection, RevisionHistory, Ticket } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";
import { logger } from "../utils/errors";

/**
 * REVISION HISTORY FETCH SERVICE (AXIOS-BASED BATCH PROCESSING)
 *
 * This service fetches revision histories for all tickets of a user using worker threads
 * with axios HTTP requests (NO PUPPETEER), stores them in MongoDB, and returns the results.
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Divides tasks evenly across worker threads
 * - Each worker connects to MongoDB ONCE and reuses the connection
 * - Batch bulkWrite operations per worker (not per record)
 * - Pure axios HTTP requests for maximum speed
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

export class RevisionHistoryFetchService {
  private userId: string;
  private maxWorkers: number;

  constructor(userId: string, maxWorkers: number = 8) {
    this.userId = userId;
    this.maxWorkers = maxWorkers;
    logger.info("RevisionHistoryFetchService initialized", {
      userId,
      maxWorkers,
    });
  }

  /**
   * Fetch and store revision histories for all tickets of the user
   * Uses batch processing with worker threads
   */
  async fetchAndStoreRevisionHistories(): Promise<any[]> {
    const startTime = Date.now();

    try {
      console.log(`\n${"=".repeat(70)}`);
      console.log(`⚡ REVISION HISTORY FETCH SERVICE (AXIOS-BASED)`);
      console.log(`${"=".repeat(70)}`);
      console.log(`👤 User ID: ${this.userId}`);
      console.log(`⚙️  Workers: ${this.maxWorkers}`);
      console.log(`🚫 NO PUPPETEER - Pure axios HTTP requests`);
      console.log(`🔄 Batch processing with MongoDB connection reuse`);
      console.log(`⏰ Started: ${new Date().toISOString()}`);
      console.log(`${"=".repeat(70)}\n`);

      // Step 1: Clear existing revision histories for this user
      console.log("🗑️  Step 1: Clearing existing revision histories...");
      const deleteResult = await RevisionHistory.deleteMany({
        userId: this.userId,
      });
      console.log(`✅ Cleared ${deleteResult.deletedCount} existing records\n`);

      // Step 2: Fetch tickets
      console.log("📊 Step 2: Loading tickets from MongoDB...");
      const tickets = await Ticket.find({ userId: this.userId }).select(
        "airtableRecordId baseId tableId"
      );

      if (tickets.length === 0) {
        console.log("ℹ️  No tickets found for user");
        return [];
      }

      console.log(`✅ Found ${tickets.length} tickets\n`);

      // Step 3: Get cookies
      console.log("🔑 Step 3: Loading authentication cookies...");
      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection || !connection.cookies) {
        throw new Error("No cookies found for user - please login first");
      }

      let cookiesString = connection.cookies;
      if (isEncrypted(cookiesString)) {
        console.log("🔓 Decrypting cookies...");
        cookiesString = decrypt(cookiesString);
      }

      console.log(`✅ Cookies loaded and ready\n`);

      // Step 4: Build task list
      console.log("📝 Step 4: Building task list...");
      const allTasks: TaskItem[] = tickets.map((ticket) => ({
        recordId: ticket.airtableRecordId,
        baseId: ticket.baseId,
        cookies: cookiesString,
        applicationId: ticket.baseId,
        userId: this.userId,
      }));

      console.log(`✅ ${allTasks.length} tasks ready\n`);

      // Step 5: Process with workers
      console.log(
        `⚡ Step 5: Dividing ${allTasks.length} tasks across ${this.maxWorkers} workers...\n`
      );

      const results = await this.processBatches(allTasks);

      // Step 6: Summary
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const totalRevisions = results.reduce(
        (sum, r) => sum + r.revisionsFound,
        0
      );

      console.log(`\n${"=".repeat(70)}`);
      console.log(`🎉 FETCH COMPLETED`);
      console.log(`${"=".repeat(70)}`);
      console.log(`⏱️  Duration: ${duration}s`);
      console.log(`📊 Total Records: ${results.length}`);
      console.log(`✅ Successful: ${successful}`);
      console.log(`❌ Failed: ${failed}`);
      console.log(`📝 Total Revisions: ${totalRevisions}`);
      console.log(`⚡ Workers: ${this.maxWorkers}`);
      console.log(
        `🔄 MongoDB Connections: ${this.maxWorkers} (one per worker, reused)`
      );
      console.log(
        `🚀 Speed: ${(results.length / parseFloat(duration)).toFixed(
          2
        )} records/sec`
      );
      console.log(`⏰ Completed: ${new Date().toISOString()}`);
      console.log(`${"=".repeat(70)}\n`);

      // Fetch all stored revisions for return
      const allRevisions = await RevisionHistory.find({ userId: this.userId })
        .sort({ createdDate: -1 })
        .lean();

      return allRevisions;
    } catch (error) {
      logger.error("RevisionHistoryFetchService error", {
        error,
        userId: this.userId,
      });
      throw error;
    }
  }

  /**
   * Process tasks in batches using worker threads
   */
  private async processBatches(allTasks: TaskItem[]): Promise<WorkerResult[]> {
    // Divide tasks evenly across workers
    const batches: TaskItem[][] = [];
    const tasksPerWorker = Math.ceil(allTasks.length / this.maxWorkers);

    for (let i = 0; i < this.maxWorkers; i++) {
      const start = i * tasksPerWorker;
      const end = Math.min(start + tasksPerWorker, allTasks.length);
      const batch = allTasks.slice(start, end);

      if (batch.length > 0) {
        batches.push(batch);
        console.log(`   Worker ${i + 1}: ${batch.length} tasks`);
      }
    }

    console.log(`\n🔥 Starting ${batches.length} workers...\n`);

    // Spawn all workers in parallel
    const results: WorkerResult[] = [];
    let processedCount = 0;

    const workerPromises = batches.map((batch, index) =>
      this.spawnBatchWorker(index + 1, batch, (recordId, revisionsFound) => {
        processedCount++;
        const status = revisionsFound > 0 ? "✅" : "⚪";
        console.log(
          `${status} [${processedCount}/${allTasks.length}] W${
            index + 1
          } - ${recordId.substring(0, 18)}... → ${revisionsFound} revisions`
        );
      })
    );

    const workerResults = await Promise.all(workerPromises);

    // Flatten results
    workerResults.forEach((workerResult) => {
      results.push(...workerResult);
    });

    return results;
  }

  /**
   * Spawn a single batch worker
   */
  private async spawnBatchWorker(
    workerId: number,
    batch: TaskItem[],
    onProgress: (recordId: string, revisionsFound: number) => void
  ): Promise<WorkerResult[]> {
    return new Promise((resolve, reject) => {
      // Use compiled worker from dist directory
      const workerPath = path.join(
        process.cwd(),
        "dist/workers/revisionHistoryFetchWorker.js"
      );

      const worker = new Worker(workerPath, {
        workerData: {
          workerId,
          tasks: batch,
        },
      });

      let results: WorkerResult[] = [];

      worker.on(
        "message",
        (message: ProgressMessage | CompleteMessage | any) => {
          if (message.type === "progress") {
            onProgress(message.recordId, message.revisionsFound);
          } else if (message.type === "complete") {
            results = message.results;
            console.log(
              `\n✨ Worker ${message.workerId} DONE: ${message.totalRevisions} total revisions\n`
            );
            resolve(results);
          } else if (message.type === "error") {
            logger.error(`Worker ${workerId} error`, { error: message.error });
            resolve(results); // Return whatever results we have
          }
        }
      );

      worker.on("error", (error) => {
        logger.error(`Worker ${workerId} error`, { error });
        reject(error);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          logger.warn(`Worker ${workerId} exited with code ${code}`);
        }
      });
    });
  }

  /**
   * Scrape revision history for a single record
   * (Backward compatibility method)
   */
  async scrapeSingleRecord(recordId: string, baseId: string): Promise<any[]> {
    try {
      console.log(
        `\n[RevisionHistoryFetchService] Fetching single record: ${recordId}`
      );

      // Get cookies
      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection || !connection.cookies) {
        throw new Error("No cookies found for user");
      }

      let cookiesString = connection.cookies;
      if (isEncrypted(cookiesString)) {
        cookiesString = decrypt(cookiesString);
      }

      // Create single task
      const task: TaskItem = {
        recordId,
        baseId,
        cookies: cookiesString,
        applicationId: baseId,
        userId: this.userId,
      };

      // Process with single worker
      const results = await this.spawnBatchWorker(1, [task], () => {});

      if (results.length > 0 && results[0].success) {
        console.log(
          `✅ Found ${results[0].revisionsFound} revisions for record ${recordId}`
        );

        // Fetch stored revisions
        const revisions = await RevisionHistory.find({
          issueId: recordId,
          userId: this.userId,
        }).lean();

        return revisions;
      }

      return [];
    } catch (error) {
      logger.error("Error scraping single record", { error, recordId });
      throw error;
    }
  }

  /**
   * Clean up duplicate revision history records
   * Removes duplicates based on matching newValue, oldValue, and createdDate
   * Keeps only one record when duplicates are found
   */
  async cleanupDuplicates(userId?: string): Promise<{
    totalChecked: number;
    duplicatesRemoved: number;
    groupsProcessed: number;
  }> {
    try {
      const targetUserId = userId || this.userId;
      console.log(
        `\n${"=".repeat(70)}\n🧹 DUPLICATE CLEANUP STARTED\n${"=".repeat(70)}`
      );
      console.log(`👤 User ID: ${targetUserId || "ALL USERS"}\n`);

      // Step 1: Find all revision histories for the user (or all if undefined)
      console.log("📊 Step 1: Loading all revision histories...");
      const query = targetUserId ? { userId: targetUserId } : {};
      const allRevisions = await RevisionHistory.find(query).lean();

      console.log(`✅ Found ${allRevisions.length} total records\n`);

      if (allRevisions.length === 0) {
        console.log("⚠️  No records to check");
        return { totalChecked: 0, duplicatesRemoved: 0, groupsProcessed: 0 };
      }

      // Step 2: Group by newValue, oldValue, and createdDate
      console.log(
        "🔍 Step 2: Grouping records by newValue, oldValue, and createdDate..."
      );

      const groupMap = new Map<string, any[]>();

      for (const revision of allRevisions) {
        // Create a unique key based on the three fields
        const createdDateStr = new Date(revision.createdDate).toISOString();
        const key = `${revision.newValue}|||${revision.oldValue}|||${createdDateStr}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(revision);
      }

      console.log(`✅ Created ${groupMap.size} unique groups\n`);

      // Step 3: Find and remove duplicates
      console.log("🗑️  Step 3: Identifying and removing duplicates...");

      let duplicatesRemoved = 0;
      let groupsWithDuplicates = 0;
      const idsToDelete: string[] = [];

      for (const [, records] of groupMap.entries()) {
        if (records.length > 1) {
          groupsWithDuplicates++;

          // Keep the first record, delete the rest
          const toDelete = records.slice(1);
          const deleteIds = toDelete.map((r) => r._id.toString());
          idsToDelete.push(...deleteIds);

          console.log(
            `   ⚠️  Found ${records.length} duplicates (keeping 1, removing ${toDelete.length})`
          );
          console.log(`      newValue: "${records[0].newValue}"`);
          console.log(`      oldValue: "${records[0].oldValue}"`);
          console.log(
            `      createdDate: ${new Date(
              records[0].createdDate
            ).toISOString()}`
          );

          duplicatesRemoved += toDelete.length;
        }
      }

      // Step 4: Perform bulk delete
      if (idsToDelete.length > 0) {
        console.log(
          `\n🔥 Step 4: Deleting ${idsToDelete.length} duplicate records...`
        );

        const deleteResult = await RevisionHistory.deleteMany({
          _id: { $in: idsToDelete },
        });

        console.log(`✅ Deleted ${deleteResult.deletedCount} records\n`);
      } else {
        console.log("\n✨ No duplicates found! Database is clean.\n");
      }

      // Step 5: Summary
      console.log(`${"=".repeat(70)}`);
      console.log(`🎉 CLEANUP COMPLETE`);
      console.log(`${"=".repeat(70)}`);
      console.log(`📊 Total Records Checked: ${allRevisions.length}`);
      console.log(`🔍 Unique Groups: ${groupMap.size}`);
      console.log(`⚠️  Groups with Duplicates: ${groupsWithDuplicates}`);
      console.log(`🗑️  Duplicates Removed: ${duplicatesRemoved}`);
      console.log(`${"=".repeat(70)}\n`);

      return {
        totalChecked: allRevisions.length,
        duplicatesRemoved,
        groupsProcessed: groupsWithDuplicates,
      };
    } catch (error) {
      logger.error("Error cleaning up duplicates", { error });
      throw error;
    }
  }
}
