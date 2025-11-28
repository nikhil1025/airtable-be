# Revision History Custom Scraping Method

## Overview

This implementation provides a complete solution for fetching Airtable Revision History using Airtable's internal API endpoint `/v0.3/view/{viewId}/readRowActivitiesAndComments`. The system automatically retrieves and validates cookies, fetches revision history for tasks, and stores them in the database with a focus on **Status** and **Assignee** changes.

## Features

✅ **Automatic Cookie Management**: Retrieve and validate cookies via Puppeteer automation  
✅ **Cookie Validation**: Check if cookies are still valid before processing  
✅ **Batch Processing**: Handle 200+ records efficiently with configurable batch sizes  
✅ **MFA Support**: Pass MFA code from frontend for cookie refresh  
✅ **Internal API Usage**: Uses Airtable's internal API (not DOM scraping)  
✅ **Filtered Changes**: Focuses on Status and Assignee changes only  
✅ **Worker Pool**: Concurrent processing using worker threads  
✅ **Error Handling**: Automatic detection of expired cookies with clear error messages

## Architecture

```
┌─────────────────┐
│   Frontend      │
│  (MFA Input)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Cookie Management                      │
│  POST /api/airtable/cookies/auto-retrieve │
│  - Login with Puppeteer                 │
│  - Handle MFA                           │
│  - Store encrypted cookies              │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Cookie Validation                      │
│  POST /api/airtable/cookies/validate    │
│  - Check if cookies are still valid     │
│  - Return validation status             │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Revision History Fetching (V2)         │
│  POST /api/airtable/revision-history-v2/fetch-batch │
│  - Fetch all tickets from DB            │
│  - Process in batches (10-20 per batch) │
│  - Use WorkerPool for concurrency       │
│  - Call internal API endpoint           │
│  - Parse and filter Status/Assignee     │
│  - Store in RevisionHistory collection  │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Database (MongoDB)                     │
│  - RevisionHistory Collection           │
│    {                                    │
│      uuid: activityId,                  │
│      issueId: ticketId,                 │
│      columnType: "Status" | "Assigned To", │
│      oldValue: "In Progress",           │
│      newValue: "Done",                  │
│      createdDate: Date,                 │
│      authoredBy: userId,                │
│      authorName: "John Doe"             │
│    }                                    │
└─────────────────────────────────────────┘
```

## API Endpoints

### 1. Cookie Management

#### Auto-Retrieve Cookies (Login)

```http
POST /api/airtable/cookies/auto-retrieve
Content-Type: application/json

{
  "userId": "user_123",
  "email": "your@email.com",
  "password": "your_password",
  "mfaCode": "123456"  // Optional, only if MFA is enabled
}
```

**Response:**

```json
{
  "success": true,
  "message": "Cookies automatically retrieved and stored successfully",
  "validUntil": "2025-11-27T12:00:00.000Z"
}
```

#### Validate Cookies

```http
POST /api/airtable/cookies/validate
Content-Type: application/json

{
  "userId": "user_123"
}
```

**Response:**

```json
{
  "success": true,
  "isValid": true,
  "message": "Cookies are valid"
}
```

### 2. Revision History Fetching (V2 - New Implementation)

#### Fetch Single Ticket

```http
POST /api/airtable/revision-history-v2/fetch-single
Content-Type: application/json

{
  "userId": "user_123",
  "recordId": "recDr6WRVuK15TkOn",
  "viewId": "viw3qURDO42ZiXM4R"  // Optional, will be extracted if not provided
}
```

**Response:**

```json
{
  "success": true,
  "recordId": "recDr6WRVuK15TkOn",
  "totalRevisions": 5,
  "savedRevisions": 5,
  "revisions": [
    {
      "uuid": "act123",
      "issueId": "recDr6WRVuK15TkOn",
      "columnType": "Status",
      "oldValue": "In Progress",
      "newValue": "Done",
      "createdDate": "2025-11-26T10:30:00.000Z",
      "authoredBy": "usr456",
      "authorName": "John Doe"
    }
  ]
}
```

#### Fetch Batch (All Tickets)

```http
POST /api/airtable/revision-history-v2/fetch-batch
Content-Type: application/json

{
  "userId": "user_123",
  "viewId": "viw3qURDO42ZiXM4R",  // Optional
  "batchSize": 10,                 // Optional, default: 10
  "delayMs": 2000                  // Optional, default: 2000ms between batches
}
```

**Response:**

```json
{
  "success": true,
  "totalTickets": 250,
  "processedTickets": 248,
  "totalRevisions": 1523,
  "errors": 2,
  "errorDetails": [
    {
      "recordId": "recXXX",
      "error": "Timeout"
    }
  ]
}
```

#### Get Statistics

```http
GET /api/airtable/revision-history-v2/statistics/user_123
```

**Response:**

```json
{
  "success": true,
  "totalRevisions": 1523,
  "statusChanges": 892,
  "assigneeChanges": 631,
  "recentRevisions": [...]
}
```

## Database Schema

### RevisionHistory Collection

```typescript
{
  uuid: string; // Unique activityId from Airtable
  issueId: string; // airtableRecordId (ticket ID)
  columnType: string; // Field name (e.g., "Status", "Assigned To")
  oldValue: string; // Previous value
  newValue: string; // New value
  createdDate: Date; // When the change occurred
  authoredBy: string; // User ID who made the change
  authorName: string; // User name (optional)
  baseId: string; // Airtable base ID
  tableId: string; // Airtable table ID
  userId: string; // Our system user ID
  rawData: object; // Full activity data for debugging
  createdAt: Date; // MongoDB timestamp
  updatedAt: Date; // MongoDB timestamp
}
```

### Indexes

- `uuid` (unique)
- `issueId`
- `columnType`
- `userId`
- Compound: `(userId, issueId)`
- Compound: `(userId, columnType)`
- Compound: `(userId, issueId, createdDate DESC)`
- Compound: `(baseId, tableId)`

## Usage Flow

### Step 1: Initial Setup (Login and Store Cookies)

```bash
curl -X POST http://localhost:3000/api/airtable/cookies/auto-retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_1764150693490",
    "email": "your@email.com",
    "password": "your_password",
    "mfaCode": "123456"
  }'
```

### Step 2: Validate Cookies (Optional but Recommended)

```bash
curl -X POST http://localhost:3000/api/airtable/cookies/validate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_1764150693490"
  }'
```

### Step 3: Fetch Revision History for All Tickets

```bash
curl -X POST http://localhost:3000/api/airtable/revision-history-v2/fetch-batch \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_1764150693490",
    "viewId": "viw3qURDO42ZiXM4R",
    "batchSize": 20,
    "delayMs": 3000
  }'
```

### Step 4: Check Statistics

```bash
curl http://localhost:3000/api/airtable/revision-history-v2/statistics/user_1764150693490
```

## Testing with 200+ Records

The system has been designed to handle large-scale processing:

1. **Batch Processing**: Processes records in configurable batches (default: 10)
2. **Rate Limiting**: Configurable delay between batches (default: 2000ms)
3. **Concurrent Processing**: Uses Worker Pool with 2 workers for parallel execution
4. **Error Recovery**: Continues processing even if individual records fail
5. **Cookie Validation**: Automatically stops if cookies expire during processing

### Test Command

```bash
# Test with 200+ records
npm run test:batch-revision-history
```

Or manually:

```bash
curl -X POST http://localhost:3000/api/airtable/revision-history-v2/fetch-batch \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_1764150693490",
    "batchSize": 20,
    "delayMs": 2000
  }'
```

## Error Handling

### Cookie Expired During Processing

```json
{
  "success": false,
  "error": "COOKIES_EXPIRED",
  "message": "Cookies expired during processing. Please refresh cookies and restart."
}
```

**Action**: Call `/api/airtable/cookies/auto-retrieve` again with credentials and MFA.

### Individual Record Failures

The system continues processing other records and provides error details:

```json
{
  "success": true,
  "totalTickets": 250,
  "processedTickets": 248,
  "errors": 2,
  "errorDetails": [{ "recordId": "recXXX", "error": "Timeout" }]
}
```

## Configuration

### Environment Variables

```env
# Puppeteer Settings
PUPPETEER_HEADLESS=true          # Set to false for debugging
CHROME_BIN=/usr/bin/google-chrome  # Optional: Custom Chrome path

# Database
MONGODB_URI=mongodb://localhost:27017/airtable-integration

# Server
PORT=3000
```

### Worker Pool Settings

Located in `src/controllers/revisionHistoryControllerV2.ts`:

```typescript
this.workerPool = new WorkerPool(workerPath, 2); // 2 concurrent workers
```

### Batch Processing Settings

Default values can be overridden per request:

- **batchSize**: 10 (process 10 tickets concurrently)
- **delayMs**: 2000 (wait 2 seconds between batches)

## Implementation Details

### Internal API Endpoint

The system uses Airtable's internal endpoint:

```
POST https://airtable.com/v0.3/view/{viewId}/readRowActivitiesAndComments
Body: { "rowId": "row_xxx" }
```

This endpoint returns:

```json
{
  "activities": [
    {
      "id": "act123",
      "createdTime": "2025-11-26T10:30:00.000Z",
      "createdByUserId": "usr456",
      "createdByUserName": "John Doe",
      "fieldName": "Status",
      "oldCellValueStr": "In Progress",
      "newCellValueStr": "Done"
    }
  ],
  "comments": [...]
}
```

### Filtering Logic

Only Status and Assignee changes are stored:

```typescript
const fieldName = activity.fieldName || "";
const isStatusChange = fieldName.toLowerCase().includes("status");
const isAssigneeChange = fieldName.toLowerCase().includes("assign");

if (isStatusChange || isAssigneeChange) {
  // Store this revision
}
```

## Troubleshooting

### Issue: "Cookies are invalid or expired"

**Solution**: Refresh cookies

```bash
curl -X POST http://localhost:3000/api/airtable/cookies/auto-retrieve \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_123", "email": "...", "password": "...", "mfaCode": "..."}'
```

### Issue: "No viewId could be extracted"

**Solution**: Pass viewId explicitly in the request

```json
{
  "userId": "user_123",
  "viewId": "viw3qURDO42ZiXM4R"
}
```

### Issue: Rate limiting / Too many requests

**Solution**: Increase delay between batches

```json
{
  "userId": "user_123",
  "batchSize": 5,
  "delayMs": 5000
}
```

## Files Modified/Created

1. **Models**

   - `src/models/RevisionHistory.ts` - Updated with baseId, tableId, authorName, rawData fields

2. **Controllers**

   - `src/controllers/revisionHistoryControllerV2.ts` - NEW: Batch processing controller

3. **Routes**

   - `src/routes/revisionHistoryV2.ts` - NEW: V2 API routes
   - `src/routes/index.ts` - Added V2 routes

4. **Workers**

   - `src/workers/puppeteerWorker.ts` - Updated with:
     - URL redirect detection
     - Detailed API response logging
     - Status/Assignee filtering
     - Required format transformation

5. **Services**
   - `src/services/CookieScraperService.ts` - Already has validation methods

## Next Steps

1. ✅ Test with valid cookies (need to login first)
2. ✅ Run batch processing on 200+ records
3. ✅ Monitor error rates and adjust batch size/delays
4. ✅ Verify Status and Assignee changes are being captured correctly
5. ✅ Set up automated cookie refresh if needed

## Production Recommendations

1. **Cookie Refresh**: Set up automated cookie refresh every 24 hours
2. **Error Monitoring**: Log all errors to monitoring service
3. **Rate Limiting**: Add rate limiting to prevent API abuse
4. **Retry Logic**: Implement exponential backoff for failed requests
5. **Database Indexes**: Ensure all indexes are created for optimal query performance
6. **Worker Pool Size**: Adjust based on server resources and Airtable rate limits

## Support

For issues or questions:

1. Check server logs: `npm run dev`
2. Enable Puppeteer debugging: `PUPPETEER_HEADLESS=false npm run dev`
3. Check revision history controller logs for detailed error messages
