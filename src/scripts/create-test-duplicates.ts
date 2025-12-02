import { connectDatabase } from "../config/database";
import { RevisionHistory } from "../models";

async function createDuplicates() {
  await connectDatabase();

  const original = await RevisionHistory.findOne({
    userId: { $exists: true },
  }).lean();

  if (original) {
    // Create 2 duplicates with same newValue, oldValue, createdDate
    // But different UUIDs (since uuid is unique)
    const dup1 = { ...original };
    const dup2 = { ...original };
    delete (dup1 as any)._id;
    delete (dup2 as any)._id;
    delete (dup1 as any).__v;
    delete (dup2 as any).__v;

    // Generate unique UUIDs
    dup1.uuid = `test_dup_${Date.now()}_1`;
    dup2.uuid = `test_dup_${Date.now()}_2`;

    await RevisionHistory.create([dup1, dup2]);
    console.log("✅ Created 2 duplicates for testing");
    console.log(`   Same newValue: "${original.newValue}"`);
    console.log(`   Same oldValue: "${original.oldValue}"`);
    console.log(`   Same createdDate: ${original.createdDate}`);

    const count = await RevisionHistory.countDocuments({});
    console.log(`📊 Total revisions: ${count}`);
  }

  process.exit(0);
}

createDuplicates();
