/**
 * TEST FILTER API
 *
 * This script tests the filter API endpoint to ensure it works correctly
 * with different filter combinations.
 */

import axios from "axios";

const API_BASE_URL = "http://localhost:3000/api/revision-history";

interface FilterTestCase {
  name: string;
  params: {
    userId: string;
    baseId?: string;
    tableId?: string;
    limit?: number;
  };
}

const TEST_CASES: FilterTestCase[] = [
  {
    name: "Filter by userId only",
    params: {
      userId: "usrqBqcvJqV0aXFEz",
    },
  },
  {
    name: "Filter by userId + baseId",
    params: {
      userId: "usrqBqcvJqV0aXFEz",
      baseId: "appqXdwTF0iRXZkpI",
    },
  },
  {
    name: "Filter by userId + tableId",
    params: {
      userId: "usrqBqcvJqV0aXFEz",
      tableId: "tblPmFSQcnT2OLcY0",
    },
  },
  {
    name: "Filter by userId + baseId + tableId",
    params: {
      userId: "usrqBqcvJqV0aXFEz",
      baseId: "appqXdwTF0iRXZkpI",
      tableId: "tblPmFSQcnT2OLcY0",
    },
  },
  {
    name: "Filter with limit",
    params: {
      userId: "usrqBqcvJqV0aXFEz",
      limit: 10,
    },
  },
];

async function runTests() {
  console.log("\n" + "=".repeat(70));
  console.log(" TESTING FILTER API ENDPOINT");
  console.log("=".repeat(70) + "\n");

  for (const testCase of TEST_CASES) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Params:`, JSON.stringify(testCase.params, null, 2));

    try {
      const response = await axios.get(`${API_BASE_URL}/filter`, {
        params: testCase.params,
      });

      if (response.data.success) {
        const { data } = response.data;
        console.log(`   ✅ SUCCESS`);
        console.log(`   📊 Filters Applied:`, data.filters);
        console.log(`   📈 Stats:`);
        console.log(`      - Total Changes: ${data.stats?.totalChanges || 0}`);
        console.log(
          `      - Status Changes: ${data.stats?.statusChanges || 0}`
        );
        console.log(
          `      - Assignee Changes: ${data.stats?.assigneeChanges || 0}`
        );
        console.log(`   📦 Results:`);
        console.log(`      - Total Revisions: ${data.totalRevisions}`);
        console.log(`      - Total Tickets: ${data.totalTickets}`);
        console.log(`      - Revisions Returned: ${data.revisions.length}`);

        // Show sample revision if available
        if (data.revisions.length > 0) {
          console.log(`   📝 Sample Revision:`);
          const sample = data.revisions[0];
          console.log(
            `      ${sample.issueId} | ${sample.columnType} | ${sample.oldValue} → ${sample.newValue}`
          );
        }
      } else {
        console.log(`   ❌ FAILED: ${response.data.message}`);
      }
    } catch (error: any) {
      if (error.response) {
        console.log(`   ❌ API ERROR: ${error.response.data.message}`);
        console.log(
          `   Status: ${error.response.status} ${error.response.statusText}`
        );
      } else {
        console.log(`   ❌ ERROR: ${error.message}`);
      }
    }

    console.log("-".repeat(70));
  }

  console.log("\n" + "=".repeat(70));
  console.log(" ALL TESTS COMPLETED");
  console.log("=".repeat(70) + "\n");
}

// Run tests
runTests()
  .then(() => {
    console.log("✅ Test script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test script failed:", error);
    process.exit(1);
  });
