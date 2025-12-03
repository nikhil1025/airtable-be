import * as path from "path";
import { Worker } from "worker_threads";
import { AirtableConnection, RevisionHistory, Ticket } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";
import { logger } from "../utils/errors";

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

  async fetchAndStoreRevisionHistories(): Promise<any[]> {
    const startTime = Date.now();

    try {
      console.log(`\n${"=".repeat(70)}`);
      console.log(`LIGHTNING REVISION HISTORY FETCH SERVICE (AXIOS-BASED)`);
      console.log(`${"=".repeat(70)}`);
      console.log(` User ID: ${this.userId}`);
      console.log(`SETTINGS  Workers: ${this.maxWorkers}`);
      console.log(`NO NO PUPPETEER - Pure axios HTTP requests`);
      console.log(`REFRESH Batch processing with MongoDB connection reuse`);
      console.log(`CLOCK Started: ${new Date().toISOString()}`);
      console.log(`${"=".repeat(70)}\n`);

      console.log("Clearing existing revision histories...");
      const deleteResult = await RevisionHistory.deleteMany({
        userId: this.userId,
      });
      console.log(`OK Cleared ${deleteResult.deletedCount} existing records\n`);

      console.log("Loading tickets from MongoDB...");
      const tickets = await Ticket.find({ userId: this.userId }).select(
        "airtableRecordId baseId tableId"
      );

      if (tickets.length === 0) {
        console.log("INFO  No tickets found for user");
        return [];
      }

      console.log(`OK Found ${tickets.length} tickets\n`);

      console.log("Loading authentication cookies...");
      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection || !connection.cookies) {
        throw new Error("No cookies found for user - please login first");
      }

      let cookiesString = connection.cookies;
      if (isEncrypted(cookiesString)) {
        console.log("UNLOCK Decrypting cookies...");
        cookiesString = decrypt(cookiesString);
      }

      console.log(`OK Cookies loaded and ready\n`);

      console.log("Building task list...");
      const allTasks: TaskItem[] = tickets.map((ticket) => ({
        recordId: ticket.airtableRecordId,
        baseId: ticket.baseId,
        cookies: cookiesString,
        applicationId: ticket.baseId,
        userId: this.userId,
      }));

      console.log(`OK ${allTasks.length} tasks ready\n`);

      console.log(
        `Dividing ${allTasks.length} tasks across ${this.maxWorkers} workers...\n`
      );

      const results = await this.processBatches(allTasks);

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const totalRevisions = results.reduce(
        (sum, r) => sum + r.revisionsFound,
        0
      );

      console.log(`\n${"=".repeat(70)}`);
      console.log(`PARTY FETCH COMPLETED`);
      console.log(`${"=".repeat(70)}`);
      console.log(`TIMER  Duration: ${duration}s`);
      console.log(`CHART Total Records: ${results.length}`);
      console.log(`OK Successful: ${successful}`);
      console.log(`X Failed: ${failed}`);
      console.log(`MEMO Total Revisions: ${totalRevisions}`);
      console.log(`LIGHTNING Workers: ${this.maxWorkers}`);
      console.log(
        `REFRESH MongoDB Connections: ${this.maxWorkers} (one per worker, reused)`
      );
      console.log(
        `ROCKET Speed: ${(results.length / parseFloat(duration)).toFixed(
          2
        )} records/sec`
      );
      console.log(`CLOCK Completed: ${new Date().toISOString()}`);
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

    console.log(`\nFIRE Starting ${batches.length} workers...\n`);

    // Spawn all workers in parallel
    const results: WorkerResult[] = [];
    let processedCount = 0;

    const workerPromises = batches.map((batch, index) =>
      this.spawnBatchWorker(index + 1, batch, (recordId, revisionsFound) => {
        processedCount++;
        const status = revisionsFound > 0 ? "OK" : "CIRCLE";
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
              `\nSPARKLE Worker ${message.workerId} DONE: ${message.totalRevisions} total revisions\n`
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
          `OK Found ${results[0].revisionsFound} revisions for record ${recordId}`
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

  async cleanupDuplicates(userId?: string): Promise<{
    totalChecked: number;
    duplicatesRemoved: number;
    groupsProcessed: number;
  }> {
    try {
      const targetUserId = userId || this.userId;
      console.log(
        `\n${"=".repeat(70)}\nBROOM DUPLICATE CLEANUP STARTED\n${"=".repeat(70)}`
      );
      console.log(` User ID: ${targetUserId || "ALL USERS"}\n`);

      console.log("Loading all revision histories...");
      const query = targetUserId ? { userId: targetUserId } : {};
      const allRevisions = await RevisionHistory.find(query).lean();

      console.log(`OK Found ${allRevisions.length} total records\n`);

      if (allRevisions.length === 0) {
        console.log("WARNING  No records to check");
        return { totalChecked: 0, duplicatesRemoved: 0, groupsProcessed: 0 };
      }

      console.log(
        "Grouping records by newValue, oldValue, and createdDate..."
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

      console.log(`OK Created ${groupMap.size} unique groups\n`);

      console.log("Identifying and removing duplicates...");

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
            `   WARNING  Found ${records.length} duplicates (keeping 1, removing ${toDelete.length})`
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

      if (idsToDelete.length > 0) {
        console.log(
          `\nDeleting ${idsToDelete.length} duplicate records...`
        );

        const deleteResult = await RevisionHistory.deleteMany({
          _id: { $in: idsToDelete },
        });

        console.log(`OK Deleted ${deleteResult.deletedCount} records\n`);
      } else {
        console.log("\nSPARKLE No duplicates found! Database is clean.\n");
      }

      console.log(`${"=".repeat(70)}`);
      console.log(`PARTY CLEANUP COMPLETE`);
      console.log(`${"=".repeat(70)}`);
      console.log(`CHART Total Records Checked: ${allRevisions.length}`);
      console.log(`MAG Unique Groups: ${groupMap.size}`);
      console.log(`WARNING  Groups with Duplicates: ${groupsWithDuplicates}`);
      console.log(`TRASH  Duplicates Removed: ${duplicatesRemoved}`);
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
