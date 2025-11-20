#!/usr/bin/env tsx
/**
 * Test creating counseling rounds with 4 rounds at different dates
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function testCreateCounseling() {
  console.log("🧪 Testing Counseling Round Creation\n");
  console.log("=".repeat(60));

  try {
    const academicYear = "2024-2025";
    const roundName = "Demo Counseling";
    
    // Define 4 rounds for June, July, August, September (mid-month)
    const rounds = [
      {
        academicYear,
        roundName,
        startDate: "2024-06-15",
        endDate: "2024-06-30",
      },
      {
        academicYear,
        roundName,
        startDate: "2024-07-15",
        endDate: "2024-07-31",
      },
      {
        academicYear,
        roundName,
        startDate: "2024-08-15",
        endDate: "2024-08-31",
      },
      {
        academicYear,
        roundName,
        startDate: "2024-09-15",
        endDate: "2024-09-30",
      },
    ];

    console.log(`\n📝 Creating counseling: "${roundName}"`);
    console.log(`   Academic Year: ${academicYear}`);
    console.log(`   Number of rounds: ${rounds.length}\n`);

    const createdRounds: any[] = [];

    for (const round of rounds) {
      // Get max round number for this counseling
      const maxRound = await sql`
        SELECT COALESCE(MAX(round_number), 0) as max_num
        FROM counseling_rounds
        WHERE academic_year = ${round.academicYear}
        AND round_name = ${round.roundName};
      `;
      
      const nextRoundNumber = (maxRound[0].max_num || 0) + 1;
      
      console.log(`   Creating Round ${nextRoundNumber}:`);
      console.log(`      Start: ${round.startDate}`);
      console.log(`      End: ${round.endDate}`);
      
      try {
        const result = await sql`
          INSERT INTO counseling_rounds (
            academic_year, round_number, round_name,
            start_date, end_date, is_active, is_completed
          )
          VALUES (
            ${round.academicYear}, ${nextRoundNumber}, ${round.roundName},
            ${round.startDate}, ${round.endDate}, false, false
          )
          RETURNING id, round_number, round_name, start_date, end_date;
        `;
        
        createdRounds.push(result[0]);
        console.log(`      ✅ Created successfully (ID: ${result[0].id})`);
      } catch (error: any) {
        console.error(`      ❌ Failed: ${error.message}`);
        if (error.message.includes('unique')) {
          console.error(`         ⚠️  Duplicate detected - round ${nextRoundNumber} may already exist`);
        }
        throw error;
      }
    }

    // Verify creation
    console.log("\n📊 Verification:");
    const allRounds = await sql`
      SELECT 
        round_number,
        round_name,
        start_date,
        end_date,
        is_active,
        is_completed
      FROM counseling_rounds
      WHERE academic_year = ${academicYear}
      AND round_name = ${roundName}
      ORDER BY round_number;
    `;

    console.log(`   ✅ Total rounds created: ${allRounds.length}`);
    console.log(`\n   Rounds for "${roundName}":`);
    allRounds.forEach((r: any) => {
      const status = r.is_active ? '🟢 Active' : r.is_completed ? '✅ Completed' : '⚪ Inactive';
      console.log(`      Round ${r.round_number}: ${r.start_date} to ${r.end_date} | ${status}`);
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

testCreateCounseling();


