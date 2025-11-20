#!/usr/bin/env tsx
/**
 * Verify Counseling System Database State
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function verifyDatabase() {
  console.log("🔍 Verifying Counseling System Database State\n");
  console.log("=" .repeat(60));

  try {
    // 1. Check table structure
    console.log("\n📋 Table Structure:");
    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'counseling_rounds'
      ORDER BY ordinal_position;
    `;
    
    columns.forEach((col: any) => {
      const nullable = col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      console.log(`   ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable}${defaultVal}`);
    });

    // 2. Check constraints
    console.log("\n🔒 Constraints:");
    const constraints = await sql`
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'counseling_rounds'
      GROUP BY tc.constraint_name, tc.constraint_type;
    `;
    
    constraints.forEach((c: any) => {
      console.log(`   ${c.constraint_type}: ${c.constraint_name}`);
      console.log(`      Columns: ${c.columns}`);
    });

    // 3. Check all counseling rounds
    console.log("\n📊 All Counseling Rounds in Database:");
    const allRounds = await sql`
      SELECT 
        id,
        academic_year,
        round_number,
        round_name,
        start_date,
        end_date,
        is_active,
        is_completed,
        created_at
      FROM counseling_rounds
      ORDER BY academic_year DESC, round_name, round_number;
    `;
    
    if (allRounds.length === 0) {
      console.log("   ⚠️  No counseling rounds found in database");
    } else {
      console.log(`   ✅ Found ${allRounds.length} counseling round(s):\n`);
      
      const byYear: Record<string, Record<string, any[]>> = {};
      allRounds.forEach((round: any) => {
        const year = round.academic_year;
        const title = round.round_name;
        if (!byYear[year]) byYear[year] = {};
        if (!byYear[year][title]) byYear[year][title] = [];
        byYear[year][title].push(round);
      });

      Object.entries(byYear).forEach(([year, byTitle]) => {
        console.log(`   📅 Academic Year: ${year}`);
        Object.entries(byTitle).forEach(([title, rounds]) => {
          console.log(`      🏫 Counseling: ${title}`);
          rounds.forEach((round: any) => {
            const status = round.is_active ? '🟢 Active' : round.is_completed ? '✅ Completed' : '⚪ Inactive';
            console.log(`         Round ${round.round_number}: ${round.start_date} to ${round.end_date} | ${status}`);
            console.log(`            ID: ${round.id}`);
          });
        });
      });
    }

    // 4. Check students associated with rounds
    console.log("\n👥 Students Associated with Rounds:");
    const studentsByRound = await sql`
      SELECT 
        cr.round_name,
        cr.round_number,
        COUNT(s.id) as student_count
      FROM counseling_rounds cr
      LEFT JOIN students s ON s.counseling_round_id = cr.id
      GROUP BY cr.id, cr.round_name, cr.round_number
      ORDER BY cr.academic_year DESC, cr.round_name, cr.round_number;
    `;
    
    studentsByRound.forEach((row: any) => {
      console.log(`   ${row.round_name} - Round ${row.round_number}: ${row.student_count} student(s)`);
    });

    // 5. Test unique constraint
    console.log("\n🧪 Testing Unique Constraint:");
    try {
      // Try to insert duplicate
      await sql`
        INSERT INTO counseling_rounds (
          academic_year, round_number, round_name,
          start_date, end_date
        )
        VALUES (
          '2024-2025', 1, 'Meritorious School',
          '2024-08-01', '2024-08-15'
        );
      `;
      console.log("   ❌ Unique constraint failed - duplicate was allowed!");
    } catch (error: any) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        console.log("   ✅ Unique constraint working - duplicate prevented");
      } else {
        throw error;
      }
    }

    // 6. Summary statistics
    console.log("\n📈 Summary Statistics:");
    const stats = await sql`
      SELECT 
        COUNT(*) as total_rounds,
        COUNT(DISTINCT academic_year) as academic_years,
        COUNT(DISTINCT round_name) as counseling_titles,
        COUNT(CASE WHEN is_active THEN 1 END) as active_rounds,
        COUNT(CASE WHEN is_completed THEN 1 END) as completed_rounds
      FROM counseling_rounds;
    `;
    
    const s = stats[0];
    console.log(`   Total Rounds: ${s.total_rounds}`);
    console.log(`   Academic Years: ${s.academic_years}`);
    console.log(`   Counseling Titles: ${s.counseling_titles}`);
    console.log(`   Active Rounds: ${s.active_rounds}`);
    console.log(`   Completed Rounds: ${s.completed_rounds}`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Database verification completed successfully!");

  } catch (error: any) {
    console.error("\n❌ Verification failed:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

verifyDatabase();


