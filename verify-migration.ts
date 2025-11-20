#!/usr/bin/env tsx
/**
 * Verify Migration Script
 * Checks that all migration changes were applied correctly
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function verifyMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔍 Verifying migration changes...\n");
  const sql = neon(databaseUrl);

  try {
    // Check if schools table exists
    const schoolsCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schools'
      );
    `;
    console.log(`✅ Schools table exists: ${schoolsCheck[0]?.exists || false}`);

    // Check schools table columns
    const schoolsColumns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'schools'
      ORDER BY ordinal_position;
    `;
    console.log(`   Columns: ${schoolsColumns.map((c: any) => c.column_name).join(", ")}`);

    // Check if vacancies has udise_code column
    const vacanciesUdiseCheck = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vacancies' AND column_name = 'udise_code';
    `;
    console.log(`\n✅ Vacancies.udise_code column: ${vacanciesUdiseCheck.length > 0 ? "EXISTS" : "MISSING"}`);
    if (vacanciesUdiseCheck.length > 0) {
      console.log(`   Type: ${vacanciesUdiseCheck[0].data_type}, Nullable: ${vacanciesUdiseCheck[0].is_nullable}`);
    }

    // Check vacancies unique constraint
    const vacanciesConstraint = await sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'vacancies' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%udise%';
    `;
    console.log(`\n✅ Vacancies unique constraint: ${vacanciesConstraint.length > 0 ? vacanciesConstraint[0].constraint_name : "MISSING"}`);

    // Check if students has allotted_school_udise column
    const studentsUdiseCheck = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'students' AND column_name = 'allotted_school_udise';
    `;
    console.log(`\n✅ Students.allotted_school_udise column: ${studentsUdiseCheck.length > 0 ? "EXISTS" : "MISSING"}`);
    if (studentsUdiseCheck.length > 0) {
      console.log(`   Type: ${studentsUdiseCheck[0].data_type}, Nullable: ${studentsUdiseCheck[0].is_nullable}`);
    }

    // Check foreign keys
    const foreignKeys = await sql`
      SELECT 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (tc.table_name = 'vacancies' OR tc.table_name = 'students')
      AND (kcu.column_name LIKE '%udise%' OR kcu.column_name LIKE '%school%');
    `;
    console.log(`\n✅ Foreign keys:`);
    foreignKeys.forEach((fk: any) => {
      console.log(`   ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // Check indexes
    const indexes = await sql`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND (indexname LIKE '%udise%' OR indexname LIKE '%school%')
      ORDER BY tablename, indexname;
    `;
    console.log(`\n✅ Indexes created:`);
    indexes.forEach((idx: any) => {
      console.log(`   ${idx.tablename}.${idx.indexname}`);
    });

    console.log("\n✅ Migration verification complete!");
    console.log("\n📝 Next steps:");
    console.log("   1. Upload vacancy files with UDISE codes");
    console.log("   2. Test allocation algorithm");
    console.log("   3. After all data is migrated, make udise_code NOT NULL");

  } catch (error: any) {
    console.error("\n❌ Verification failed:");
    console.error(error.message);
    process.exit(1);
  }
}

verifyMigration().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


