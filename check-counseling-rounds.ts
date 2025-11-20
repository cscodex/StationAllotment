#!/usr/bin/env tsx
/**
 * Check counseling rounds in database and verify they can be fetched
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function checkRounds() {
  console.log("🔍 Checking Counseling Rounds in Database\n");
  console.log("=".repeat(60));

  try {
    // Check all rounds
    const allRounds = await sql`
      SELECT 
        id,
        academic_year,
        round_number,
        round_name,
        start_date,
        end_date,
        is_active,
        is_completed
      FROM counseling_rounds
      ORDER BY academic_year DESC, round_name, round_number;
    `;

    console.log(`\n📊 Total rounds in database: ${allRounds.length}\n`);

    if (allRounds.length === 0) {
      console.log("⚠️  No counseling rounds found in database");
      return;
    }

    // Group by academic year
    const byYear: Record<string, any[]> = {};
    allRounds.forEach((round: any) => {
      const year = round.academic_year;
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(round);
    });

    Object.entries(byYear).forEach(([year, rounds]) => {
      console.log(`📅 Academic Year: ${year}`);
      console.log(`   Total rounds: ${rounds.length}\n`);

      // Group by counseling title
      const byTitle: Record<string, any[]> = {};
      rounds.forEach((round: any) => {
        const title = round.round_name || "Unnamed";
        if (!byTitle[title]) byTitle[title] = [];
        byTitle[title].push(round);
      });

      Object.entries(byTitle).forEach(([title, titleRounds]) => {
        console.log(`   🏫 Counseling: ${title}`);
        titleRounds.forEach((round: any) => {
          const status = round.is_active ? '🟢 Active' : round.is_completed ? '✅ Completed' : '⚪ Inactive';
          console.log(`      Round ${round.round_number}: ${round.start_date} to ${round.end_date} | ${status}`);
          console.log(`         ID: ${round.id}`);
        });
        console.log();
      });
    });

    // Test query that matches API endpoint
    console.log("\n🧪 Testing API Query Format:");
    const testYear = "2024-2025";
    const apiRounds = await sql`
      SELECT 
        id,
        academic_year as "academicYear",
        round_number as "roundNumber",
        round_name as "roundName",
        start_date as "startDate",
        end_date as "endDate",
        is_active as "isActive",
        is_completed as "isCompleted",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM counseling_rounds
      WHERE academic_year = ${testYear}
      ORDER BY round_name, round_number;
    `;

    console.log(`   Query for academic year "${testYear}":`);
    console.log(`   Found ${apiRounds.length} rounds\n`);
    
    if (apiRounds.length > 0) {
      console.log("   Sample round data:");
      console.log(JSON.stringify(apiRounds[0], null, 2));
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Check completed!");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkRounds();


