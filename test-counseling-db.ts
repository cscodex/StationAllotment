#!/usr/bin/env tsx
/**
 * Test Counseling System by checking database directly
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function testDatabase() {
  console.log("🔌 Connecting to database...\n");

  try {
    // 1. Check if counseling_rounds table exists and has correct structure
    console.log("1️⃣  Checking counseling_rounds table structure...");
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'counseling_rounds'
      ORDER BY ordinal_position;
    `;
    
    console.log("   ✅ Table structure:");
    tableInfo.forEach((col: any) => {
      console.log(`      - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'})`);
    });

    // 2. Check unique constraint
    console.log("\n2️⃣  Checking unique constraints...");
    const constraints = await sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'counseling_rounds'
      AND constraint_type = 'UNIQUE';
    `;
    
    console.log("   ✅ Unique constraints:");
    constraints.forEach((c: any) => {
      console.log(`      - ${c.constraint_name}`);
    });

    // 3. Check indexes
    console.log("\n3️⃣  Checking indexes...");
    const indexes = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'counseling_rounds';
    `;
    
    console.log("   ✅ Indexes:");
    indexes.forEach((idx: any) => {
      console.log(`      - ${idx.indexname}`);
    });

    // 4. Create test counseling rounds
    console.log("\n4️⃣  Creating test counseling rounds...");
    
    // First, check if any exist
    const existing = await sql`
      SELECT COUNT(*) as count FROM counseling_rounds WHERE academic_year = '2024-2025';
    `;
    console.log(`   Found ${existing[0].count} existing rounds for 2024-2025`);

    // Create test rounds
    const testRounds = [
      {
        academic_year: '2024-2025',
        round_name: 'Meritorious School',
        start_date: '2024-06-01',
        end_date: '2024-06-15',
        is_active: false,
        is_completed: false,
      },
      {
        academic_year: '2024-2025',
        round_name: 'Meritorious School',
        start_date: '2024-06-16',
        end_date: '2024-06-30',
        is_active: false,
        is_completed: false,
      },
    ];

    for (const round of testRounds) {
      // Find max round number for this counseling
      const maxRound = await sql`
        SELECT COALESCE(MAX(round_number), 0) as max_num
        FROM counseling_rounds
        WHERE academic_year = ${round.academic_year}
        AND round_name = ${round.round_name};
      `;
      
      const nextRoundNumber = (maxRound[0].max_num || 0) + 1;
      
      const result = await sql`
        INSERT INTO counseling_rounds (
          academic_year, round_number, round_name, 
          start_date, end_date, is_active, is_completed
        )
        VALUES (
          ${round.academic_year}, ${nextRoundNumber}, ${round.round_name},
          ${round.start_date}, ${round.end_date}, ${round.is_active}, ${round.is_completed}
        )
        RETURNING id, academic_year, round_number, round_name, start_date, end_date;
      `;
      
      console.log(`   ✅ Created: ${result[0].round_name} - Round ${result[0].round_number} (ID: ${result[0].id})`);
    }

    // 5. List all rounds for 2024-2025
    console.log("\n5️⃣  Listing all rounds for 2024-2025...");
    const allRounds = await sql`
      SELECT id, academic_year, round_number, round_name, 
             start_date, end_date, is_active, is_completed
      FROM counseling_rounds
      WHERE academic_year = '2024-2025'
      ORDER BY round_name, round_number;
    `;
    
    console.log(`   ✅ Found ${allRounds.length} rounds:`);
    const byTitle: Record<string, any[]> = {};
    allRounds.forEach((round: any) => {
      const title = round.round_name;
      if (!byTitle[title]) byTitle[title] = [];
      byTitle[title].push(round);
    });

    Object.entries(byTitle).forEach(([title, rounds]) => {
      console.log(`\n   📋 ${title}:`);
      rounds.forEach((round: any) => {
        console.log(`      Round ${round.round_number}: ${round.start_date} to ${round.end_date}`);
        console.log(`         Status: ${round.is_active ? 'Active' : 'Inactive'} | ${round.is_completed ? 'Completed' : 'Pending'}`);
        console.log(`         ID: ${round.id}`);
      });
    });

    // 6. Test activation
    console.log("\n6️⃣  Testing round activation...");
    if (allRounds.length > 0) {
      const firstRound = allRounds[0];
      
      // Deactivate all first
      await sql`
        UPDATE counseling_rounds
        SET is_active = false
        WHERE academic_year = '2024-2025';
      `;
      
      // Activate first round
      await sql`
        UPDATE counseling_rounds
        SET is_active = true, updated_at = NOW()
        WHERE id = ${firstRound.id};
      `;
      
      const activated = await sql`
        SELECT round_name, round_number, is_active
        FROM counseling_rounds
        WHERE id = ${firstRound.id};
      `;
      
      console.log(`   ✅ Activated: ${activated[0].round_name} - Round ${activated[0].round_number}`);
    }

    // 7. Test delete (should work for inactive, non-completed rounds)
    console.log("\n7️⃣  Testing delete functionality...");
    const inactiveRounds = await sql`
      SELECT id, round_name, round_number
      FROM counseling_rounds
      WHERE academic_year = '2024-2025'
      AND is_active = false
      AND is_completed = false
      AND id NOT IN (
        SELECT DISTINCT counseling_round_id
        FROM students
        WHERE counseling_round_id IS NOT NULL
      )
      LIMIT 1;
    `;
    
    if (inactiveRounds.length > 0) {
      const toDelete = inactiveRounds[0];
      await sql`DELETE FROM counseling_rounds WHERE id = ${toDelete.id}`;
      console.log(`   ✅ Deleted: ${toDelete.round_name} - Round ${toDelete.round_number}`);
    } else {
      console.log("   ⚠️  No deletable rounds found (all have students or are active)");
    }

    // 8. Final summary
    console.log("\n8️⃣  Final database state...");
    const finalRounds = await sql`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN is_active THEN 1 END) as active,
             COUNT(CASE WHEN is_completed THEN 1 END) as completed
      FROM counseling_rounds
      WHERE academic_year = '2024-2025';
    `;
    
    console.log(`   ✅ Total rounds: ${finalRounds[0].total}`);
    console.log(`   ✅ Active rounds: ${finalRounds[0].active}`);
    console.log(`   ✅ Completed rounds: ${finalRounds[0].completed}`);

    console.log("\n✅ All database tests completed successfully!");

  } catch (error: any) {
    console.error("\n❌ Database test failed:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testDatabase();


