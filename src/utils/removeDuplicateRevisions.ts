import { RevisionHistory } from "../models";

export async function removeDuplicateRevisions(
  userId?: string,
  recordId?: string
): Promise<{
  totalRevisions: number;
  uniqueGroups: number;
  duplicateGroups: number;
  duplicatesRemoved: number;
  affectedRecords: number;
}> {
  try {
    // Build query
    const query: any = {};
    if (userId) query.userId = userId;
    if (recordId) query.issueId = recordId;

    console.log(
      `\n[CLEANUP] Cleaning duplicate revisions${
        userId ? ` for user: ${userId}` : ""
      }${recordId ? ` for record: ${recordId}` : ""}...`
    );

    // Get all revisions
    const revisions = await RevisionHistory.find(query).sort({
      createdDate: 1,
    });
    console.log(`   Found ${revisions.length} total revisions`);

    if (revisions.length === 0) {
      return {
        totalRevisions: 0,
        uniqueGroups: 0,
        duplicateGroups: 0,
        duplicatesRemoved: 0,
        affectedRecords: 0,
      };
    }

    // Group by issueId + newValue + oldValue + createdDate
    const groupedRevisions = new Map<string, any[]>();

    revisions.forEach((revision) => {
      const key = `${revision.issueId}|${revision.newValue}|${
        revision.oldValue
      }|${revision.createdDate.toISOString()}`;

      if (!groupedRevisions.has(key)) {
        groupedRevisions.set(key, []);
      }
      groupedRevisions.get(key)!.push(revision);
    });

    let totalDuplicates = 0;
    let duplicateGroups = 0;
    const idsToDelete: string[] = [];
    const affectedRecords = new Set<string>();

    // Find duplicates
    groupedRevisions.forEach((group) => {
      if (group.length > 1) {
        duplicateGroups++;
        const duplicateCount = group.length - 1;
        totalDuplicates += duplicateCount;
        affectedRecords.add(group[0].issueId);

        console.log(
          `   Duplicate: ${group[0].issueId} - ${group[0].columnType} (${group.length} entries, keeping 1)`
        );

        // Keep the first one, mark the rest for deletion
        for (let i = 1; i < group.length; i++) {
          idsToDelete.push(group[i]._id);
        }
      }
    });

    if (idsToDelete.length > 0) {
      // Delete duplicates
      const result = await RevisionHistory.deleteMany({
        _id: { $in: idsToDelete },
      });

      console.log(
        `   [SUCCESS] Removed ${result.deletedCount} duplicate entries`
      );
      console.log(`   [INFO] Affected records: ${affectedRecords.size}`);
    } else {
      console.log("   [SUCCESS] No duplicates found - data is clean!");
    }

    return {
      totalRevisions: revisions.length,
      uniqueGroups: groupedRevisions.size,
      duplicateGroups,
      duplicatesRemoved: totalDuplicates,
      affectedRecords: affectedRecords.size,
    };
  } catch (error) {
    console.error("[ERROR] Error removing duplicates:", error);
    throw error;
  }
}
