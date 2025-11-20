#!/usr/bin/env tsx
/**
 * Check Unique Constraint
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function checkConstraint() {
  console.log("🔍 Checking Unique Constraint...\n");

  try {
    // Check existing data
    const existing = await sql`
      SELECT academic_year, round_name, round_number, COUNT(*) as count
      FROM counseling_rounds
      GROUP BY academic_year, round_name, round_number
      HAVING COUNT(*) > 1;
    `;
    
    if (existing.length > 0) {
      console.log("❌ Found duplicate entries:");
      existing.forEach((row: any) => {
        console.log(`   ${row.academic_year} - ${row.round_name} - Round ${row.round_number}: ${row.count} entries`);
      });
    } else {
      console.log("✅ No duplicates found - constraint is working!");
    }

    // Try to insert duplicate
    console.log("\n🧪 Testing constraint by attempting duplicate insert...");
    try {
      await sql`
        INSERT INTO counseling_rounds (
          academic_year, round_number, round_name,
          start_date, end_date
        )
        VALUES (
          '2024-2025', 2, 'Meritorious School',
          '2024-09-01', '2024-09-15'
        )
      `;
      console.log("❌ Constraint failed - duplicate was inserted!");
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('unique') || errorMsg.includes('duplicate') || errorMsg.includes('violates')) {
        console.log("✅ Constraint working - duplicate prevented");
        console.log(`   Error: ${errorMsg.substring(0, 100)}`);
      } else {
        console.log("⚠️  Unexpected error:", errorMsg);
      }
    }

    // Show current state
    console.log("\n📊 Current Rounds:");
    const rounds = await sql`
      SELECT academic_year, round_name, round_number, is_active
      FROM counseling_rounds
      WHERE academic_year = '2024-2025'
      ORDER BY round_name, round_number;
    `;
    
    rounds.forEach((r: any) => {
      console.log(`   ${r.round_name} - Round ${r.round_number} (${r.is_active ? 'Active' : 'Inactive'})`);
    });

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkConstraint();


