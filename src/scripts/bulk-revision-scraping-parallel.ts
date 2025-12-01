import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { connectDatabase } from "../config/database";
import { AirtableConnection, Ticket } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";

/**
 * PARALLEL BULK REVISION HISTORY SCRAPING SCRIPT
 *
 * This script uses worker threads to parallelize revision history scraping:
 * 1. Fetches all tickets from MongoDB
 * 2. Divides tickets into batches based on available CPU cores
 * 3. Launches worker threads (one per core) to process batches in parallel
 * 4. Aggregates results from all workers
 * 5. Displays final results
 *
 * Performance: Processes multiple tickets simultaneously using all available CPU cores
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

interface ProcessingResult {
  recordId: string;
  status: "success" | "error" | "no_data";
  revisions: RevisionHistoryItem[] | null;
  error?: string;
}

class ParallelBulkRevisionScraper {
  private userId: string;
  private cookies: string = "";
  private results: ProcessingResult[] = [];
  private numWorkers: number;

  constructor(userId: string, numWorkers?: number) {
    this.userId = userId;
    // Use max 6 workers to avoid resource exhaustion
    const maxWorkers = 4;
    const cpuCores = os.cpus().length;
    this.numWorkers = numWorkers || Math.min(cpuCores, maxWorkers);
  }

  /**
   * Step 1: Fetch cookies from MongoDB
   */
  async fetchCookiesFromDB(): Promise<boolean> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("📦 STEP 1: FETCHING COOKIES FROM MONGODB");
      console.log("=".repeat(70));

      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection || !connection.cookies) {
        console.error(`❌ No cookies found for userId: ${this.userId}`);
        return false;
      }

      let cookieString = connection.cookies;
      if (isEncrypted(cookieString)) {
        console.log("🔓 Decrypting cookies...");
        try {
          cookieString = decrypt(cookieString);
          console.log("✅ Cookies decrypted successfully");
        } catch (error) {
          console.error("❌ Failed to decrypt cookies:", error);
          return false;
        }
      }

      this.cookies = cookieString;
      console.log(`✅ Cookies retrieved (${cookieString.length} chars)`);
      console.log(
        `   Valid Until: ${
          connection.cookiesValidUntil
            ? new Date(connection.cookiesValidUntil).toISOString()
            : "Not set"
        }`
      );

      return true;
    } catch (error) {
      console.error("❌ Error fetching cookies:", error);
      return false;
    }
  }

  /**
   * Step 2: Fetch all tickets from MongoDB
   */
  async fetchAllTickets(): Promise<TicketData[]> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🎫 STEP 2: FETCHING ALL TICKETS FROM MONGODB");
      console.log("=".repeat(70));

      const tickets = await Ticket.find({ userId: this.userId }).select(
        "airtableRecordId rowId baseId tableId fields"
      );

      if (tickets.length === 0) {
        console.warn(`⚠️  No tickets found for userId: ${this.userId}`);
        return [];
      }

      console.log(`✅ Found ${tickets.length} tickets to process`);

      return tickets.map((ticket) => ({
        airtableRecordId: ticket.airtableRecordId,
        rowId: ticket.rowId || "",
        baseId: ticket.baseId,
        tableId: ticket.tableId,
        fields: ticket.fields,
      }));
    } catch (error) {
      console.error("❌ Error fetching tickets:", error);
      return [];
    }
  }

  /**
   * Step 3: Divide tickets into batches for workers
   */
  divideToBatches(tickets: TicketData[]): TicketData[][] {
    const batches: TicketData[][] = [];
    const batchSize = Math.ceil(tickets.length / this.numWorkers);

    for (let i = 0; i < tickets.length; i += batchSize) {
      batches.push(tickets.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Step 4: Launch worker thread
   */
  async launchWorker(
    tickets: TicketData[],
    workerId: number
  ): Promise<ProcessingResult[]> {
    return new Promise((resolve, reject) => {
      // Use .ts extension when running with ts-node
      // Use .js extension when running compiled version
      const workerPath = path.join(
        __dirname,
        "bulk-revision-scraping-worker.ts"
      );

      const worker = new Worker(workerPath, {
        workerData: {
          tickets,
          userId: this.userId,
          cookies: this.cookies,
          workerId,
        },
        execArgv: ["-r", "ts-node/register", "--no-warnings"],
      });

      worker.on("message", (message) => {
        if (message.success) {
          resolve(message.results);
        } else {
          console.error(
            `[Main] Worker ${workerId} reported error:`,
            message.error
          );
          reject(new Error(message.error || "Unknown worker error"));
        }
      });

      worker.on("error", (error) => {
        console.error(`[Main] Worker ${workerId} error event:`, error);
        reject(error);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(`[Main] Worker ${workerId} exited with code ${code}`);
          reject(
            new Error(`Worker ${workerId} stopped with exit code ${code}`)
          );
        }
      });
    });
  }

  /**
   * Step 5: Process all tickets in parallel
   */
  async processAllTicketsInParallel(): Promise<void> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("⚡ STEP 3: PROCESSING TICKETS IN PARALLEL");
      console.log("=".repeat(70));

      const tickets = await this.fetchAllTickets();

      if (tickets.length === 0) {
        console.log("❌ No tickets to process");
        return;
      }

      // Adjust number of workers if we have fewer tickets
      const actualWorkers = Math.min(this.numWorkers, tickets.length);
      console.log(`🧵 CPU Cores Available: ${os.cpus().length}`);
      console.log(`🧵 Workers to Launch: ${actualWorkers}`);

      // Divide tickets into batches
      const batches = this.divideToBatches(tickets);
      console.log(
        `📦 Divided ${tickets.length} tickets into ${batches.length} batches`
      );

      batches.forEach((batch, index) => {
        console.log(`   Batch ${index + 1}: ${batch.length} tickets`);
      });

      console.log(`\n🚀 Launching ${actualWorkers} worker threads...\n`);

      const startTime = Date.now();

      // Launch all workers in parallel
      const workerPromises = batches.map((batch, index) =>
        this.launchWorker(batch, index + 1)
      );

      // Wait for all workers to complete
      const workerResults = await Promise.allSettled(workerPromises);

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log(`\n✅ All workers completed in ${duration} seconds\n`);

      // Aggregate results
      workerResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          console.log(
            `✅ Worker ${index + 1}: Processed ${result.value.length} tickets`
          );
          this.results.push(...result.value);
        } else {
          let errorMessage = "Unknown error";
          try {
            if (result.reason instanceof Error) {
              errorMessage = result.reason.message;
            } else if (typeof result.reason === "string") {
              errorMessage = result.reason;
            } else if (result.reason && result.reason.toString) {
              errorMessage = result.reason.toString();
            } else {
              errorMessage = JSON.stringify(result.reason);
            }
          } catch (e) {
            errorMessage = "Failed to parse error message";
          }

          console.error(`❌ Worker ${index + 1}: Failed - ${errorMessage}`);
          // Mark all tickets in this batch as errors
          batches[index].forEach((ticket) => {
            this.results.push({
              recordId: ticket.airtableRecordId,
              status: "error",
              revisions: null,
              error: `Worker failed: ${errorMessage}`,
            });
          });
        }
      });
    } catch (error) {
      console.error("❌ Error during parallel processing:", error);
      throw error;
    }
  }

  /**
   * Step 6: Display results
   */
  displayResults(): void {
    console.log("\n" + "=".repeat(70));
    console.log("📊 FINAL RESULTS");
    console.log("=".repeat(70));

    const successCount = this.results.filter(
      (r) => r.status === "success"
    ).length;
    const noDataCount = this.results.filter(
      (r) => r.status === "no_data"
    ).length;
    const errorCount = this.results.filter((r) => r.status === "error").length;

    console.log(`\n📈 Summary:`);
    console.log(`   Total Processed: ${this.results.length}`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⚪ No Data: ${noDataCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    console.log(`\n📋 Detailed Results:\n`);

    let counter = 1;
    for (const result of this.results) {
      if (result.status === "success" && result.revisions) {
        console.log(
          `${counter}. ${result.recordId} - ${JSON.stringify(result.revisions)}`
        );
      } else if (result.status === "no_data") {
        console.log(`${counter}. ${result.recordId} - null`);
      } else {
        console.log(
          `${counter}. ${result.recordId} - ERROR: ${result.error || "Unknown"}`
        );
      }
      counter++;
    }

    console.log("\n" + "=".repeat(70));
  }

  /**
   * Main execution flow
   */
  async execute(): Promise<void> {
    try {
      console.log("\n" + "=".repeat(70));
      console.log("🚀 PARALLEL BULK REVISION HISTORY SCRAPER");
      console.log("=".repeat(70));
      console.log(`👤 User ID: ${this.userId}`);
      console.log(`🧵 Available CPU Cores: ${os.cpus().length}`);
      console.log(
        `🧵 Workers Configured: ${this.numWorkers} (dynamic allocation)`
      );

      // Connect to database
      await connectDatabase();

      // Fetch cookies
      const cookiesFetched = await this.fetchCookiesFromDB();
      if (!cookiesFetched) {
        throw new Error("Failed to fetch cookies");
      }

      // Process all tickets in parallel
      await this.processAllTicketsInParallel();

      // Display results
      this.displayResults();

      console.log("\n✅ SCRAPING COMPLETED SUCCESSFULLY!\n");
      process.exit(0);
    } catch (error) {
      console.error("\n❌ Fatal Error:", error);
      process.exit(1);
    }
  }
}

// Execute script
const userId = "user_1764525443009"; // Replace with actual user ID if needed
const scraper = new ParallelBulkRevisionScraper(userId); // Will use max 6 workers
scraper.execute();
