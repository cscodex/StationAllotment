#!/usr/bin/env tsx
/**
 * Migration Script: Change start_date from DATE to TIMESTAMP
 * 
 * This script migrates the counseling_rounds.start_date column
 * from DATE type to TIMESTAMP type to support datetime values.
 * 
 * Usage:
 *   tsx migrate-start-date-to-timestamp.ts
 * 
 * Or with explicit database URL:
 *   DATABASE_URL=your_connection_string tsx migrate-start-date-to-timestamp.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function migrateStartDateToTimestamp() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set");
    console.error("   Set it in .env file or pass as environment variable");
    process.exit(1);
  }

  console.log("🔄 Starting Migration: Change start_date from DATE to TIMESTAMP\n");
  console.log("=".repeat(60));
  
  const sql = neon(databaseUrl);

  try {
    // Step 1: Check current column type
    console.log("\n1️⃣  Checking current column type...");
    const columnInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'counseling_rounds' 
      AND column_name = 'start_date'
    `;

    if (columnInfo.length === 0) {
      console.error("❌ Column 'start_date' not found in counseling_rounds table");
      process.exit(1);
    }

    const currentType = columnInfo[0].data_type;
    console.log(`   📊 Current type: ${currentType}`);
    console.log(`   📋 Nullable: ${columnInfo[0].is_nullable}`);

    // Step 2: Check if migration is needed
    if (currentType === 'timestamp without time zone' || currentType === 'timestamp with time zone') {
      console.log("\n✅ Column is already TIMESTAMP type. No migration needed!");
      process.exit(0);
    }

    if (currentType !== 'date') {
      console.error(`❌ Unexpected column type: ${currentType}. Expected 'date'`);
      process.exit(1);
    }

    // Step 3: Check for existing data
    console.log("\n2️⃣  Checking for existing data...");
    const rowCount = await sql`
      SELECT COUNT(*) as count FROM counseling_rounds
    `;
    const count = parseInt(rowCount[0].count);
    console.log(`   📊 Found ${count} existing row(s)`);

    if (count > 0) {
      // Show sample data
      const sample = await sql`
        SELECT id, start_date 
        FROM counseling_rounds 
        LIMIT 3
      `;
      console.log("   📋 Sample data:");
      sample.forEach((row: any) => {
        console.log(`      - ID: ${row.id}, start_date: ${row.start_date}`);
      });
    }

    // Step 4: Perform migration
    console.log("\n3️⃣  Performing migration...");
    console.log("   ⚠️  Converting DATE to TIMESTAMP (dates will become timestamps at midnight)");
    
    try {
      await sql`
        ALTER TABLE counseling_rounds 
        ALTER COLUMN start_date TYPE TIMESTAMP USING start_date::TIMESTAMP
      `;
      console.log("   ✅ Migration completed successfully!");
    } catch (error: any) {
      if (error.message?.includes('permission denied') || error.message?.includes('insufficient_privilege')) {
        console.error("\n❌ PERMISSION DENIED ERROR");
        console.error("=".repeat(60));
        console.error("The database user does not have ALTER TABLE permissions.");
        console.error("\nSolutions:");
        console.error("1. Run as database superuser:");
        console.error("   psql -U postgres -d your_database -f migrations/change_start_date_to_timestamp.sql");
        console.error("\n2. Grant permissions to your user:");
        console.error("   GRANT ALTER ON TABLE counseling_rounds TO your_username;");
        console.error("   -- OR --");
        console.error("   ALTER USER your_username WITH SUPERUSER;");
        console.error("\n3. If using Neon/Render/Heroku:");
        console.error("   - Use the database dashboard SQL editor");
        console.error("   - Or contact your database administrator");
        process.exit(1);
      } else {
        throw error;
      }
    }

    // Step 5: Verify migration
    console.log("\n4️⃣  Verifying migration...");
    const newColumnInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'counseling_rounds' 
      AND column_name = 'start_date'
    `;

    const newType = newColumnInfo[0].data_type;
    console.log(`   📊 New type: ${newType}`);

    if (newType === 'timestamp without time zone' || newType === 'timestamp with time zone') {
      console.log("   ✅ Verification successful!");
    } else {
      console.error(`   ❌ Verification failed. Type is still: ${newType}`);
      process.exit(1);
    }

    // Step 6: Show migrated data
    if (count > 0) {
      console.log("\n5️⃣  Showing migrated data...");
      const migrated = await sql`
        SELECT id, start_date 
        FROM counseling_rounds 
        LIMIT 3
      `;
      console.log("   📋 Migrated data:");
      migrated.forEach((row: any) => {
        console.log(`      - ID: ${row.id}, start_date: ${row.start_date}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Restart your application server");
    console.log("2. The application will now use TIMESTAMP for start_date");
    console.log("3. New dates will include time component");

  } catch (error: any) {
    console.error("\n❌ Migration failed!");
    console.error("=".repeat(60));
    console.error("Error:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

// Run migration
migrateStartDateToTimestamp()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });


