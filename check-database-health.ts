#!/usr/bin/env tsx
/**
 * Comprehensive Database Health Check
 * Verifies all tables, connections, and critical components
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function checkDatabaseHealth() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🏥 Database Health Check\n");
  console.log("=" .repeat(60));
  
  const sql = neon(databaseUrl);

  try {
    // 1. Test connection
    console.log("\n1️⃣  Testing Database Connection...");
    const connectionTest = await sql`SELECT NOW() as current_time, version() as pg_version;`;
    console.log(`   ✅ Connected successfully`);
    console.log(`   📅 Server Time: ${connectionTest[0].current_time}`);
    console.log(`   🗄️  PostgreSQL: ${connectionTest[0].pg_version.split(',')[0]}`);

    // 2. Check all required tables
    console.log("\n2️⃣  Checking Required Tables...");
    const requiredTables = [
      'users', 'students', 'vacancies', 'schools', 
      'counseling_rounds', 'students_entrance_result',
      'district_status', 'settings', 'audit_logs', 
      'file_uploads', 'unlock_requests', 'sessions'
    ];
    
    const existingTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tableNames = existingTables.map((t: any) => t.table_name);
    let allTablesExist = true;
    
    requiredTables.forEach(table => {
      const exists = tableNames.includes(table);
      const status = exists ? '✅' : '❌';
      console.log(`   ${status} ${table.padEnd(30)} ${exists ? 'EXISTS' : 'MISSING'}`);
      if (!exists) allTablesExist = false;
    });
    
    if (!allTablesExist) {
      console.log("\n   ⚠️  Some required tables are missing!");
    } else {
      console.log("\n   ✅ All required tables exist");
    }

    // 3. Check critical columns
    console.log("\n3️⃣  Checking Critical Columns...");
    
    // Check counseling_rounds columns
    const counselingColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'counseling_rounds'
      ORDER BY ordinal_position;
    `;
    const counselingColNames = counselingColumns.map((c: any) => c.column_name);
    const requiredCounselingCols = ['id', 'academic_year', 'round_number', 'round_name', 'start_date', 'end_date', 'is_active'];
    requiredCounselingCols.forEach(col => {
      const exists = counselingColNames.includes(col);
      console.log(`   ${exists ? '✅' : '❌'} counseling_rounds.${col.padEnd(20)} ${exists ? 'EXISTS' : 'MISSING'}`);
    });
    
    // Check academic_year columns
    const academicYearCheck = await sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE column_name = 'academic_year'
      AND table_name IN ('students', 'vacancies', 'students_entrance_result')
      ORDER BY table_name;
    `;
    console.log(`\n   📅 Academic Year columns:`);
    academicYearCheck.forEach((col: any) => {
      console.log(`      ✅ ${col.table_name}.${col.column_name}`);
    });
    
    // Check UDISE code columns
    const udiseCheck = await sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE column_name LIKE '%udise%'
      ORDER BY table_name, column_name;
    `;
    console.log(`\n   🏫 UDISE Code columns:`);
    udiseCheck.forEach((col: any) => {
      console.log(`      ✅ ${col.table_name}.${col.column_name}`);
    });

    // 4. Check indexes
    console.log("\n4️⃣  Checking Critical Indexes...");
    const indexes = await sql`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND (
        indexname LIKE '%counseling%' OR
        indexname LIKE '%academic_year%' OR
        indexname LIKE '%udise%' OR
        indexname LIKE '%merit%'
      )
      ORDER BY tablename, indexname;
    `;
    console.log(`   Found ${indexes.length} critical indexes:`);
    indexes.forEach((idx: any) => {
      console.log(`      ✅ ${idx.tablename}.${idx.indexname}`);
    });

    // 5. Check constraints
    console.log("\n5️⃣  Checking Unique Constraints...");
    const uniqueConstraints = await sql`
      SELECT tc.table_name, tc.constraint_name, 
             string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_name IN ('counseling_rounds', 'vacancies', 'students')
      GROUP BY tc.table_name, tc.constraint_name
      ORDER BY tc.table_name, tc.constraint_name;
    `;
    console.log(`   Found ${uniqueConstraints.length} unique constraints:`);
    uniqueConstraints.forEach((c: any) => {
      console.log(`      ✅ ${c.table_name}.${c.constraint_name} (${c.columns})`);
    });

    // 6. Check foreign keys
    console.log("\n6️⃣  Checking Foreign Keys...");
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
      ORDER BY tc.table_name, kcu.column_name;
    `;
    console.log(`   Found ${foreignKeys.length} foreign keys:`);
    foreignKeys.forEach((fk: any) => {
      console.log(`      ✅ ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // 7. Check default users
    console.log("\n7️⃣  Checking Default Users...");
    const users = await sql`
      SELECT username, role, district, email
      FROM users
      ORDER BY role, username;
    `;
    console.log(`   Found ${users.length} users:`);
    users.forEach((u: any) => {
      const district = u.district ? ` (${u.district})` : '';
      console.log(`      ✅ ${u.username} - ${u.role}${district}`);
    });

    // 8. Check table row counts
    console.log("\n8️⃣  Checking Table Row Counts...");
    const tableCounts = await sql`
      SELECT 
        'counseling_rounds' as table_name,
        COUNT(*) as row_count
      FROM counseling_rounds
      UNION ALL
      SELECT 'students', COUNT(*) FROM students
      UNION ALL
      SELECT 'vacancies', COUNT(*) FROM vacancies
      UNION ALL
      SELECT 'schools', COUNT(*) FROM schools
      UNION ALL
      SELECT 'users', COUNT(*) FROM users;
    `;
    tableCounts.forEach((tc: any) => {
      console.log(`      📊 ${tc.table_name.padEnd(25)} ${tc.row_count} rows`);
    });

    // 9. Final summary
    console.log("\n" + "=" .repeat(60));
    console.log("\n✅ Database Health Check Complete!");
    console.log("\n📋 Summary:");
    console.log(`   ✅ Connection: Working`);
    console.log(`   ✅ Tables: ${tableNames.length} tables found`);
    console.log(`   ✅ Required Tables: ${allTablesExist ? 'All present' : 'Some missing'}`);
    console.log(`   ✅ Indexes: ${indexes.length} critical indexes`);
    console.log(`   ✅ Constraints: ${uniqueConstraints.length} unique constraints`);
    console.log(`   ✅ Foreign Keys: ${foreignKeys.length} foreign keys`);
    console.log(`   ✅ Users: ${users.length} users configured`);
    
    if (allTablesExist) {
      console.log("\n🎉 Database is ready for production!");
      console.log("\n✅ Your Render deployment should work correctly now.");
    } else {
      console.log("\n⚠️  Some issues detected. Please review the output above.");
    }

  } catch (error: any) {
    console.error("\n" + "=" .repeat(60));
    console.error("\n❌ Health check failed:");
    console.error(error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkDatabaseHealth().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

