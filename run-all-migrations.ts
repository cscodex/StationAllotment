#!/usr/bin/env tsx
/**
 * Run All Database Migrations
 * Runs all migrations in the correct order for production setup
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeSQL(sql: any, statement: string, index: number, total: number) {
  const statementPreview = statement.substring(0, 80).replace(/\s+/g, " ").trim();
  console.log(`[${index + 1}/${total}] Executing: ${statementPreview}...`);
  
  try {
    await sql(statement);
    console.log(`   ✅ Success\n`);
    return true;
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    // Ignore "already exists" errors (IF NOT EXISTS handles this)
    if (errorMsg.includes("already exists") || 
        errorMsg.includes("duplicate") ||
        (errorMsg.includes("does not exist") && errorMsg.includes("constraint"))) {
      console.log(`   ⚠️  Warning (ignored): ${errorMsg.substring(0, 100)}\n`);
      return true;
    } else {
      console.error(`   ❌ Error: ${errorMsg}`);
      throw error;
    }
  }
}

function parseSQL(sqlContent: string): string[] {
  // Remove comments
  let cleanedSQL = sqlContent
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(line => {
      const commentIndex = line.indexOf("--");
      if (commentIndex >= 0) {
        const beforeComment = line.substring(0, commentIndex);
        const singleQuotes = (beforeComment.match(/'/g) || []).length;
        if (singleQuotes % 2 === 0) {
          return line.substring(0, commentIndex);
        }
      }
      return line;
    })
    .join("\n");

  // Split by semicolon, handling strings
  const statements: string[] = [];
  let currentStatement = "";
  let inString = false;
  let stringChar = "";
  
  for (let i = 0; i < cleanedSQL.length; i++) {
    const char = cleanedSQL[i];
    
    if ((char === "'" || char === '"') && (i === 0 || cleanedSQL[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }
    
    currentStatement += char;
    
    if (char === ";" && !inString) {
      const trimmed = currentStatement.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      currentStatement = "";
    }
  }
  
  if (currentStatement.trim().length > 0) {
    statements.push(currentStatement.trim());
  }
  
  return statements.filter(s => s.trim().length > 0);
}

async function runAllMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set");
    console.error("   Set it with: export DATABASE_URL='your-connection-string'");
    process.exit(1);
  }

  console.log("🔌 Connecting to database...");
  const sql = neon(databaseUrl);

  // Migration files in order
  const migrations = [
    { name: "Initial Database Schema", file: "create_database.sql", path: path.join(__dirname, "create_database.sql") },
    { name: "Counseling Rounds", file: "migrations/add_counseling_rounds.sql", path: path.join(__dirname, "migrations", "add_counseling_rounds.sql") },
    { name: "Add File Uploads Columns", file: "migrations/add_file_uploads_columns.sql", path: path.join(__dirname, "migrations", "add_file_uploads_columns.sql") },
    { name: "UDISE Code", file: "migrations/add_udise_code.sql", path: path.join(__dirname, "migrations", "add_udise_code.sql") },
    { name: "Update Counseling Rounds Constraints", file: "migrations/update_counseling_rounds_unique_constraint.sql", path: path.join(__dirname, "migrations", "update_counseling_rounds_unique_constraint.sql") },
    { name: "Make end_date Nullable", file: "migrations/make_end_date_nullable.sql", path: path.join(__dirname, "migrations", "make_end_date_nullable.sql") },
    { name: "Add roundName to Shared Data", file: "migrations/add_round_name_to_shared_data.sql", path: path.join(__dirname, "migrations", "add_round_name_to_shared_data.sql") },
  ];

  console.log("\n📋 Migration Plan:");
  migrations.forEach((m, i) => console.log(`   ${i + 1}. ${m.name} (${m.file})`));
  console.log("\n");

  let totalStatements = 0;
  const allStatements: Array<{ migration: string; statement: string }> = [];

  // Read all migration files
  for (const migration of migrations) {
    if (!fs.existsSync(migration.path)) {
      console.error(`❌ ERROR: Migration file not found: ${migration.path}`);
      process.exit(1);
    }

    console.log(`📄 Reading: ${migration.file}`);
    const sqlContent = fs.readFileSync(migration.path, "utf-8");
    const statements = parseSQL(sqlContent);
    
    statements.forEach(statement => {
      allStatements.push({ migration: migration.name, statement });
      totalStatements++;
    });
  }

  console.log(`\n📝 Found ${totalStatements} SQL statements to execute\n`);
  console.log("=" .repeat(60) + "\n");

  try {
    // Execute all statements
    for (let i = 0; i < allStatements.length; i++) {
      const { migration, statement } = allStatements[i];
      await executeSQL(sql, statement, i, totalStatements);
    }

    console.log("=" .repeat(60));
    console.log("\n✅ All migrations completed successfully!");
    console.log("\n📋 Summary:");
    console.log("   ✅ Initial database schema created");
    console.log("   ✅ Counseling rounds table and columns added");
    console.log("   ✅ UDISE code columns added");
    console.log("   ✅ Unique constraints updated");
    console.log("   ✅ end_date made nullable (optional)");
    console.log("\n🎉 Your database is ready for production!");

  } catch (error: any) {
    console.error("\n" + "=".repeat(60));
    console.error("\n❌ Migration failed:");
    console.error(error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run migrations
runAllMigrations().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

