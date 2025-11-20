#!/usr/bin/env tsx
/**
 * Test bulkCreateCounselingRounds directly
 */

import "dotenv/config";
import { storage } from "./server/storage";

async function testBulkCreate() {
  console.log("🧪 Testing bulkCreateCounselingRounds\n");
  console.log("=".repeat(60));

  try {
    const rounds = [
      {
        academicYear: "2024-2025",
        roundName: "Demo Counseling",
        startDate: "2024-06-15",
        endDate: "2024-06-30",
        roundNumber: 0, // Will be auto-incremented
        isActive: false,
        isCompleted: false,
      },
      {
        academicYear: "2024-2025",
        roundName: "Demo Counseling",
        startDate: "2024-07-15",
        endDate: "2024-07-31",
        roundNumber: 0,
        isActive: false,
        isCompleted: false,
      },
      {
        academicYear: "2024-2025",
        roundName: "Demo Counseling",
        startDate: "2024-08-15",
        endDate: "2024-08-31",
        roundNumber: 0,
        isActive: false,
        isCompleted: false,
      },
      {
        academicYear: "2024-2025",
        roundName: "Demo Counseling",
        startDate: "2024-09-15",
        endDate: "2024-09-30",
        roundNumber: 0,
        isActive: false,
        isCompleted: false,
      },
    ];

    console.log(`\n📝 Attempting to create ${rounds.length} rounds...\n`);

    const createdRounds = await storage.bulkCreateCounselingRounds(rounds);

    console.log(`✅ Successfully created ${createdRounds.length} rounds:\n`);
    createdRounds.forEach((round, index) => {
      console.log(`   ${index + 1}. Round ${round.roundNumber}: ${round.startDate} to ${round.endDate}`);
      console.log(`      ID: ${round.id}`);
      console.log(`      Name: ${round.roundName}`);
    });

    // Verify
    console.log("\n📊 Verification:");
    const allRounds = await storage.getCounselingRounds("2024-2025");
    const demoRounds = allRounds.filter(r => r.roundName === "Demo Counseling");
    console.log(`   Total "Demo Counseling" rounds: ${demoRounds.length}`);
    demoRounds.forEach(r => {
      console.log(`      Round ${r.roundNumber}: ${r.startDate} to ${r.endDate}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ Test completed successfully!");

  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testBulkCreate();


