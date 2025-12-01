# Parallel Revision History Scraping

## Overview

This module provides high-performance parallel scraping of Airtable revision history using Node.js worker threads. It automatically utilizes all available CPU cores to process multiple tickets simultaneously.

## Architecture

### Components

1. **bulk-revision-scraping-parallel.ts** (Main Orchestrator)

   - Fetches all tickets from MongoDB
   - Divides tickets into batches
   - Manages worker thread pool
   - Aggregates results from all workers

2. **bulk-revision-scraping-worker.ts** (Worker Thread)
   - Launches its own headless Chrome browser instance
   - Processes a batch of tickets independently
   - Scrapes revision history using Airtable API
   - Parses HTML responses with cheerio
   - Returns results to main thread

### How It Works

```
Main Thread
    ├── Fetch Cookies from MongoDB
    ├── Fetch All Tickets from MongoDB
    ├── Divide Tickets into N Batches (N = CPU cores)
    │
    ├── Worker 1 (Batch 1) ──> Browser Instance 1 ──> Process Tickets 1-X
    ├── Worker 2 (Batch 2) ──> Browser Instance 2 ──> Process Tickets X-Y
    ├── Worker 3 (Batch 3) ──> Browser Instance 3 ──> Process Tickets Y-Z
    └── Worker N (Batch N) ──> Browser Instance N ──> Process Tickets ...
    │
    └── Aggregate Results & Display
```

## Performance Benefits

### Single-Threaded (Original)

- Processes tickets sequentially
- 1 browser instance
- ~1-2 seconds per ticket
- **Total time for 24 tickets: ~40-50 seconds**

### Multi-Threaded (Parallel)

- Processes tickets concurrently
- N browser instances (N = CPU cores)
- ~1-2 seconds per ticket per worker
- **Total time for 24 tickets: ~10-15 seconds** (on 4-core CPU)

### Speed Improvement

- **4-core CPU**: ~4x faster
- **8-core CPU**: ~8x faster
- **16-core CPU**: ~16x faster (limited by network/API throttling)

## Usage

### Run Parallel Scraping

```bash
npm run bulk:revision-scraping:parallel
```

### Run Sequential Scraping (Single Thread)

```bash
npm run bulk:revision-scraping
```

### Configuration

The parallel scraper automatically detects and uses all available CPU cores. You can modify the number of workers in the script:

```typescript
// Use all cores (default)
const scraper = new ParallelBulkRevisionScraper(userId);

// Use specific number of workers
const scraper = new ParallelBulkRevisionScraper(userId, 4);
```

## Output Format

Both scripts produce identical output:

```
recuMKeu0aLm7i0hP - [10 revisions]
recABC123XYZ456 - null
recDEF789GHI012 - ERROR: Network timeout
```

### Result Types

1. **Success**: `recordId - [N revisions]`

   - Successfully scraped revision history
   - N = number of revision items found

2. **No Data**: `recordId - null`

   - Record has no revision history
   - Or API returned empty response

3. **Error**: `recordId - ERROR: message`
   - Failed to scrape due to network/browser error
   - Error message included for debugging

## Technical Details

### Worker Thread Communication

Workers communicate with the main thread using Node.js message passing:

```typescript
// Main thread sends
workerData: {
  tickets: TicketData[],
  userId: string,
  cookies: string,
  workerId: number
}

// Worker responds
parentPort.postMessage({
  success: true,
  results: ProcessingResult[]
})
```

### Resource Management

Each worker:

- Launches its own headless Chrome instance
- Processes its assigned batch of tickets
- Closes browser and exits when complete
- Handles errors independently without affecting other workers

### Error Handling

- **Worker Crash**: Main thread catches and marks all tickets in that batch as errors
- **Individual Ticket Failure**: Worker continues processing remaining tickets
- **Network Errors**: Gracefully handled with retry logic (within worker)

## Requirements

- **Node.js**: v14+ (worker_threads support)
- **CPU Cores**: More cores = faster processing
- **Memory**: ~200-300MB per worker (browser instance)
- **Chrome**: `/usr/bin/google-chrome` (headless mode)

## Limitations

1. **Memory Usage**: Each worker spawns a Chrome instance (~200-300MB RAM)

   - 8 workers = ~2-3GB RAM required
   - Consider reducing workers on low-memory systems

2. **Network Throttling**: Airtable may rate-limit parallel requests

   - Each worker includes 800ms delay between tickets
   - Adjust delay if encountering 429 errors

3. **Compilation**: Worker files must be compiled to JavaScript
   - `ts-node` handles this automatically
   - For production, compile with `npm run build` first

## Troubleshooting

### Worker Compilation Errors

If you see "Cannot find module 'bulk-revision-scraping-worker.js'":

```bash
# Compile TypeScript to JavaScript
npm run build

# Then run
node dist/scripts/bulk-revision-scraping-parallel.js
```

Or use ts-node (automatically compiles):

```bash
npm run bulk:revision-scraping:parallel
```

### Memory Issues

Reduce number of workers:

```typescript
// In bulk-revision-scraping-parallel.ts
const scraper = new ParallelBulkRevisionScraper(userId, 2); // Use only 2 workers
```

### Rate Limiting (429 Errors)

Increase delay between requests:

```typescript
// In bulk-revision-scraping-worker.ts, line ~404
await new Promise((resolve) => setTimeout(resolve, 2000)); // Increase to 2 seconds
```

## Comparison Table

| Feature            | Sequential               | Parallel               |
| ------------------ | ------------------------ | ---------------------- |
| Processing         | One at a time            | Multiple simultaneous  |
| Browser Instances  | 1                        | N (CPU cores)          |
| Memory Usage       | ~300MB                   | ~300MB × N             |
| Speed (24 tickets) | ~45 seconds              | ~12 seconds (4 cores)  |
| CPU Utilization    | ~25%                     | ~100%                  |
| Error Isolation    | ❌ One failure stops all | ✅ Workers independent |
| Resource Scaling   | ❌ Fixed                 | ✅ Dynamic (CPU-based) |

## Best Practices

1. **Use Parallel for Large Batches**: 50+ tickets benefit most from parallelization
2. **Use Sequential for Small Batches**: <20 tickets may not show significant improvement
3. **Monitor Memory**: Watch RAM usage when using 8+ workers
4. **Adjust Delays**: Tune delays based on Airtable API response times
5. **Test First**: Use single-threaded version to validate cookies/setup before going parallel

## Example Output

```
======================================================================
🚀 PARALLEL BULK REVISION HISTORY SCRAPER
======================================================================
👤 User ID: user_1764525443009
🧵 Available CPU Cores: 8
🧵 Workers Configured: 8 (dynamic allocation)

======================================================================
📦 STEP 1: FETCHING COOKIES FROM MONGODB
======================================================================
🔓 Decrypting cookies...
✅ Cookies decrypted successfully
✅ Cookies retrieved (2847 chars)
   Valid Until: 2025-12-15T10:30:00.000Z

======================================================================
🎫 STEP 2: FETCHING ALL TICKETS FROM MONGODB
======================================================================
✅ Found 24 tickets to process

======================================================================
⚡ STEP 3: PROCESSING TICKETS IN PARALLEL
======================================================================
🧵 CPU Cores Available: 8
🧵 Workers to Launch: 8
📦 Divided 24 tickets into 8 batches
   Batch 1: 3 tickets
   Batch 2: 3 tickets
   Batch 3: 3 tickets
   Batch 4: 3 tickets
   Batch 5: 3 tickets
   Batch 6: 3 tickets
   Batch 7: 3 tickets
   Batch 8: 3 tickets

🚀 Launching 8 worker threads...

✅ All workers completed in 12.34 seconds

✅ Worker 1: Processed 3 tickets
✅ Worker 2: Processed 3 tickets
✅ Worker 3: Processed 3 tickets
✅ Worker 4: Processed 3 tickets
✅ Worker 5: Processed 3 tickets
✅ Worker 6: Processed 3 tickets
✅ Worker 7: Processed 3 tickets
✅ Worker 8: Processed 3 tickets

======================================================================
📊 FINAL RESULTS
======================================================================

📈 Summary:
   Total Processed: 24
   ✅ Success: 18
   ⚪ No Data: 4
   ❌ Errors: 2

📋 Detailed Results:

recuMKeu0aLm7i0hP - [10 revisions]
recABC123XYZ456 - null
recDEF789GHI012 - [5 revisions]
...

======================================================================

✅ SCRAPING COMPLETED SUCCESSFULLY!
```

## Future Enhancements

- [ ] Add resume capability (checkpoint/restart)
- [ ] Implement result caching to avoid re-scraping
- [ ] Add progress bar for better UX
- [ ] Support custom batch size configuration
- [ ] Add result export to JSON/CSV
- [ ] Implement adaptive rate limiting
- [ ] Add detailed performance metrics
