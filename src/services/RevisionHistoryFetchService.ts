import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { AirtableConnection, RevisionHistory, Ticket } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";

/**
 * REVISION HISTORY FETCH SERVICE (WORKER THREAD VERSION)
 *
 * This service fetches revision histories for all tickets of a user using worker threads
 * for parallel processing, stores them in MongoDB RevisionHistory collection, and returns the results.
 *
 * PERFORMANCE: Uses worker thread pool to process multiple tickets concurrently
 */

interface RevisionHistoryItem {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: any;
  newValue: any;
  createdDate: Date;
  authoredBy: string;
}

interface TicketData {
  airtableRecordId: string;
  rowId: string;
  baseId: string;
  tableId: string;
  fields: any;
}

export class RevisionHistoryFetchService {
  private userId: string;
  private cookies: string = "";
  private workerPool: Worker[] = [];
  private poolSize: number;

  constructor(userId: string) {
    this.userId = userId;
    // Use CPU cores - 1 for optimal performance, minimum 2, maximum 8
    this.poolSize = Math.min(Math.max(os.cpus().length - 1, 2), 8);
    console.log(
      `[RevisionHistoryFetchService] 🚀 Initialized with ${this.poolSize} worker threads`
    );
  }

  /**
   * Initialize worker pool
   */
  private initializeWorkerPool(): void {
    console.log(
      `[RevisionHistoryFetchService] 🔧 Initializing ${this.poolSize} workers...`
    );

    const workerPath = path.resolve(
      __dirname,
      "../workers/revisionHistoryWorker.js"
    );

    // Check if compiled .js exists, otherwise use .ts for development
    const tsWorkerPath = path.resolve(
      __dirname,
      "../workers/revisionHistoryWorker.ts"
    );

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(
        require("fs").existsSync(workerPath) ? workerPath : tsWorkerPath,
        {
          execArgv: require("fs").existsSync(workerPath)
            ? []
            : ["-r", "ts-node/register"],
        }
      );

      worker.on("error", (error) => {
        console.error(
          `[RevisionHistoryFetchService] ❌ Worker ${i} error:`,
          error
        );
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.warn(
            `[RevisionHistoryFetchService] ⚠️  Worker ${i} exited with code ${code}`
          );
        }
      });

      this.workerPool.push(worker);
    }

    console.log(
      `[RevisionHistoryFetchService] ✅ Worker pool initialized with ${this.poolSize} workers`
    );
  }

  /**
   * Terminate worker pool
   */
  private async terminateWorkerPool(): Promise<void> {
    console.log(
      `[RevisionHistoryFetchService] 🛑 Terminating ${this.workerPool.length} workers...`
    );

    await Promise.all(
      this.workerPool.map(async (worker) => {
        await worker.terminate();
      })
    );

    this.workerPool = [];
    console.log(`[RevisionHistoryFetchService] ✅ Worker pool terminated`);
  }

  /**
   * Process a ticket using worker thread
   */
  private processTicketWithWorker(
    ticketData: TicketData,
    workerId: number
  ): Promise<RevisionHistoryItem[] | null> {
    return new Promise((resolve, reject) => {
      const worker = this.workerPool[workerId % this.poolSize];

      const messageHandler = (result: any) => {
        worker.removeListener("message", messageHandler);
        worker.removeListener("error", errorHandler);

        if (result.success) {
          resolve(result.revisions);
        } else {
          reject(new Error(result.error || "Worker failed"));
        }
      };

      const errorHandler = (error: Error) => {
        worker.removeListener("message", messageHandler);
        worker.removeListener("error", errorHandler);
        reject(error);
      };

      worker.once("message", messageHandler);
      worker.once("error", errorHandler);

      worker.postMessage({
        type: "scrapeRevisionHistory",
        data: {
          ticketData,
          cookies: this.cookies,
          workerId: workerId % this.poolSize,
        },
      });
    });
  }

  /**
   * Fetch cookies from MongoDB
   */
  private async fetchCookiesFromDB(): Promise<boolean> {
    try {
      console.log(
        `\n[RevisionHistoryFetchService] 📦 Step 1: Fetching cookies for user: ${this.userId}`
      );

      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection || !connection.cookies) {
        console.error(
          `[RevisionHistoryFetchService] ❌ No cookies found for userId: ${this.userId}`
        );
        return false;
      }
      console.log(
        `[RevisionHistoryFetchService] ✅ Found AirtableConnection document`
      );
      console.log(
        `[RevisionHistoryFetchService] 📊 Cookie length: ${
          connection.cookies?.length || 0
        } chars`
      );

      let cookieString = connection.cookies;
      if (isEncrypted(cookieString)) {
        console.log(
          "[RevisionHistoryFetchService] 🔐 Cookies are encrypted, decrypting..."
        );
        try {
          cookieString = decrypt(cookieString);
          console.log(
            "[RevisionHistoryFetchService] ✅ Cookies decrypted successfully"
          );
        } catch (error) {
          console.error(
            "[RevisionHistoryFetchService] ❌ Failed to decrypt cookies:",
            error
          );
          return false;
        }
      } else {
        console.log(
          "[RevisionHistoryFetchService] 🔓 Cookies are not encrypted"
        );
      }

      this.cookies = cookieString;
      console.log(
        `[RevisionHistoryFetchService] ✅ Cookies retrieved (${cookieString.length} chars)`
      );
      console.log(
        `[RevisionHistoryFetchService] 📅 Cookies valid until: ${
          connection.cookiesValidUntil
            ? new Date(connection.cookiesValidUntil).toISOString()
            : "Not set"
        }`
      );

      return true;
    } catch (error) {
      console.error(
        "[RevisionHistoryFetchService] Error fetching cookies:",
        error
      );
      return false;
    }
  }

  /**
   * Fetch all tickets from MongoDB
   */
  private async fetchAllTickets(): Promise<TicketData[]> {
    try {
      console.log(
        `\n[RevisionHistoryFetchService] 🎫 Step 2: Fetching all tickets for user: ${this.userId}`
      );

      const tickets = await Ticket.find({ userId: this.userId }).select(
        "airtableRecordId rowId baseId tableId fields"
      );

      console.log(
        `[RevisionHistoryFetchService] ✅ Found ${tickets.length} tickets to process`
      );

      return tickets.map((ticket) => ({
        airtableRecordId: ticket.airtableRecordId,
        rowId: ticket.rowId,
        baseId: ticket.baseId,
        tableId: ticket.tableId,
        fields: ticket.fields,
      }));
    } catch (error) {
      console.error(
        "[RevisionHistoryFetchService] Error fetching tickets:",
        error
      );
      return [];
    }
  }

  /**
   * Main execution: Fetch all revision histories using worker threads and store in MongoDB
   */
  /**
   * Main execution: Fetch all revision histories using worker threads and store in MongoDB
   */
  async fetchAndStoreRevisionHistories(): Promise<any[]> {
    const startTime = Date.now();
    try {
      console.log(`\n${"=".repeat(70)}`);
      console.log(
        `[RevisionHistoryFetchService] 🚀 STARTING REVISION HISTORY FETCH (WORKER THREAD MODE)`
      );
      console.log(`[RevisionHistoryFetchService] 👤 User ID: ${this.userId}`);
      console.log(
        `[RevisionHistoryFetchService] 🧵 Worker threads: ${this.poolSize}`
      );
      console.log(
        `[RevisionHistoryFetchService] ⏰ Started at: ${new Date().toISOString()}`
      );
      console.log(`${"=".repeat(70)}`);

      // Fetch cookies
      const cookiesFetched = await this.fetchCookiesFromDB();
      if (!cookiesFetched) {
        throw new Error("Could not fetch cookies");
      }

      // Initialize worker pool
      this.initializeWorkerPool();

      // Fetch all tickets
      const tickets = await this.fetchAllTickets();
      if (tickets.length === 0) {
        console.log(
          `[RevisionHistoryFetchService] ⚠️  No tickets found, exiting...`
        );
        await this.terminateWorkerPool();
        return [];
      }

      console.log(`\n${"=".repeat(70)}`);
      console.log(
        `[RevisionHistoryFetchService] 🔄 Step 3: PROCESSING ${tickets.length} TICKETS WITH ${this.poolSize} WORKERS`
      );
      console.log(`${"=".repeat(70)}\n`);

      const allRevisions: any[] = [];
      const batchSize = this.poolSize; // Process in batches equal to pool size
      let processedCount = 0;
      let successCount = 0;
      let failedCount = 0;

      // Process tickets in batches
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(tickets.length / batchSize);

        console.log(
          `\n[RevisionHistoryFetchService] 📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} tickets in parallel)...`
        );

        // Process batch in parallel using worker threads
        const batchPromises = batch.map((ticket, idx) =>
          this.processTicketWithWorker(ticket, i + idx)
            .then((revisions) => ({ ticket, revisions, success: true }))
            .catch((error) => ({ ticket, error, success: false }))
        );

        const batchResults = await Promise.all(batchPromises);

        // Process results
        for (const result of batchResults) {
          processedCount++;
          const recordId = result.ticket.airtableRecordId;

          console.log(
            `\n[RevisionHistoryFetchService] 📌 [${processedCount}/${tickets.length}] ${recordId}`
          );

          if (
            result.success &&
            "revisions" in result &&
            result.revisions &&
            result.revisions.length > 0
          ) {
            console.log(
              `[RevisionHistoryFetchService] ✅ Found ${result.revisions.length} revision items`
            );

            // Store in MongoDB
            console.log(
              `[RevisionHistoryFetchService] 💾 Storing ${result.revisions.length} revisions...`
            );
            for (const revision of result.revisions) {
              try {
                const revisionDoc = await RevisionHistory.findOneAndUpdate(
                  { uuid: revision.uuid, issueId: revision.issueId },
                  {
                    uuid: revision.uuid,
                    issueId: revision.issueId,
                    columnType: revision.columnType,
                    oldValue: revision.oldValue || "",
                    newValue: revision.newValue || "",
                    createdDate: revision.createdDate,
                    authoredBy: revision.authoredBy,
                    baseId: result.ticket.baseId,
                    tableId: result.ticket.tableId,
                    userId: this.userId,
                  },
                  { upsert: true, new: true }
                );

                allRevisions.push(revisionDoc);
              } catch (dbError) {
                console.error(
                  `[RevisionHistoryFetchService] ❌ Error storing revision:`,
                  dbError
                );
              }
            }
            console.log(
              `[RevisionHistoryFetchService] ✅ Stored ${result.revisions.length} revisions`
            );
            successCount++;
          } else if (result.success && "revisions" in result) {
            console.log(
              `[RevisionHistoryFetchService] ⚪ No revision history found`
            );
            successCount++;
          } else if (!result.success && "error" in result) {
            console.error(
              `[RevisionHistoryFetchService] ❌ Error: ${
                result.error?.message || "Unknown error"
              }`
            );
            failedCount++;
          }
        }

        console.log(
          `[RevisionHistoryFetchService] ✅ Batch ${batchNumber} complete: ${
            batchResults.filter((r) => r.success).length
          } success, ${batchResults.filter((r) => !r.success).length} failed`
        );

        // Small delay between batches
        if (i + batchSize < tickets.length) {
          console.log(
            `[RevisionHistoryFetchService] ⏳ Waiting 2s before next batch...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // Cleanup
      await this.terminateWorkerPool();

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log(`\n${"=".repeat(70)}`);
      console.log(
        `[RevisionHistoryFetchService] 🎉 FETCH COMPLETED SUCCESSFULLY`
      );
      console.log(
        `[RevisionHistoryFetchService] 📊 Total revisions stored: ${allRevisions.length}`
      );
      console.log(
        `[RevisionHistoryFetchService] ✅ Success: ${successCount}/${tickets.length} tickets`
      );
      console.log(
        `[RevisionHistoryFetchService] ❌ Failed: ${failedCount}/${tickets.length} tickets`
      );
      console.log(`[RevisionHistoryFetchService] ⏱️  Total time: ${duration}s`);
      console.log(
        `[RevisionHistoryFetchService] 🚀 Average: ${(
          tickets.length / parseFloat(duration)
        ).toFixed(2)} tickets/second`
      );
      console.log(
        `[RevisionHistoryFetchService] ⏰ Completed at: ${new Date().toISOString()}`
      );
      console.log(`${"=".repeat(70)}\n`);

      return allRevisions;
    } catch (error) {
      console.error("[RevisionHistoryFetchService] Unexpected error:", error);
      await this.terminateWorkerPool();
      throw error;
    }
  }
}
