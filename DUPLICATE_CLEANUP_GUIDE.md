# Duplicate Cleanup Functionality

## Overview

The duplicate cleanup function removes duplicate revision history records based on three matching fields:

- `newValue`
- `oldValue`
- `createdDate`

When duplicates are found (2 or more records with identical values for these three fields), only one record is kept and the rest are deleted.

## How It Works

### Detection Algorithm

1. Loads all revision histories for a user
2. Groups records by creating a unique key: `newValue|||oldValue|||createdDate`
3. Identifies groups with more than one record (duplicates)
4. Keeps the first record in each group, marks the rest for deletion
5. Performs a bulk delete operation

### Performance

- Uses MongoDB `lean()` for faster queries (returns plain JavaScript objects)
- Groups records in-memory using a Map for O(1) lookups
- Bulk delete operation for efficiency (single database call)

## Usage

### Method 1: Via API Endpoint

```bash
# Cleanup duplicates for a specific user
POST http://localhost:5000/api/revision-history/cleanup/:userId
```

**Example Response:**

```json
{
  "success": true,
  "message": "Cleanup completed: 5 duplicates removed",
  "data": {
    "totalChecked": 100,
    "duplicatesRemoved": 5,
    "groupsProcessed": 3,
    "remainingRecords": 95
  }
}
```

### Method 2: Via Service Class

```typescript
import { RevisionHistoryFetchService } from "../services/RevisionHistoryFetchService";

const service = new RevisionHistoryFetchService(userId);
const result = await service.cleanupDuplicates();

console.log(`Removed ${result.duplicatesRemoved} duplicates`);
console.log(`Checked ${result.totalChecked} total records`);
console.log(`Found ${result.groupsProcessed} groups with duplicates`);
```

### Method 3: Via Test Script

```bash
# Run the test script
npx ts-node src/scripts/test-cleanup-duplicates.ts
```

## Return Values

```typescript
{
  totalChecked: number; // Total records examined
  duplicatesRemoved: number; // Number of duplicate records deleted
  groupsProcessed: number; // Number of groups that had duplicates
}
```

## Example Console Output

```
======================================================================
🧹 DUPLICATE CLEANUP STARTED
======================================================================
👤 User ID: user123

📊 Step 1: Loading all revision histories...
✅ Found 100 total records

🔍 Step 2: Grouping records by newValue, oldValue, and createdDate...
✅ Created 95 unique groups

🗑️  Step 3: Identifying and removing duplicates...
   ⚠️  Found 3 duplicates (keeping 1, removing 2)
      newValue: "In Progress"
      oldValue: "To Do"
      createdDate: 2025-12-01T10:30:00.000Z

   ⚠️  Found 2 duplicates (keeping 1, removing 1)
      newValue: "Done"
      oldValue: "In Progress"
      createdDate: 2025-12-01T14:20:00.000Z

🔥 Step 4: Deleting 5 duplicate records...
✅ Deleted 5 records

======================================================================
🎉 CLEANUP COMPLETE
======================================================================
📊 Total Records Checked: 100
🔍 Unique Groups: 95
⚠️  Groups with Duplicates: 3
🗑️  Duplicates Removed: 5
======================================================================
```

## When to Use

### Recommended Scenarios

- After bulk data imports
- After migrating data from another system
- Periodically as maintenance (e.g., weekly/monthly)
- After discovering duplicate records in queries

### Safe to Run

- ✅ Non-destructive (only removes exact duplicates)
- ✅ Keeps the first occurrence of each duplicate group
- ✅ Can be run multiple times safely (idempotent)
- ✅ No risk to unique records

## Integration with Fetch Process

The cleanup can be integrated into the fetch process to automatically remove duplicates:

```typescript
// In your controller or service
const service = new RevisionHistoryFetchService(userId);

// Fetch new revision histories
await service.fetchAndStoreRevisionHistories();

// Clean up any duplicates that may have been created
await service.cleanupDuplicates();
```

## Technical Details

### Database Indexes

The cleanup function benefits from these existing indexes:

- `userId` index (for filtering by user)
- Composite indexes help with faster queries

### Memory Considerations

- For users with 10,000+ records, the function loads all records into memory
- Uses Map data structure for efficient grouping
- Consider running during off-peak hours for very large datasets

### Transaction Safety

- Uses MongoDB `deleteMany()` with array of IDs
- Atomic operation ensures consistency
- No partial deletions occur

## Error Handling

The function includes comprehensive error handling:

- Logs errors with full context
- Returns error response if cleanup fails
- Database connection errors are caught and reported
- Safe to retry on failure

## Monitoring

Track cleanup operations with these metrics:

- `totalChecked` - How many records were examined
- `duplicatesRemoved` - Success metric for cleanup
- `groupsProcessed` - Indicates severity of duplication issue

### Example Metrics Analysis

- If `groupsProcessed` is high → Investigate data source for duplication cause
- If `duplicatesRemoved/totalChecked > 10%` → Consider fixing upstream process
- If `duplicatesRemoved = 0` consistently → Data quality is good
