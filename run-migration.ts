#!/usr/bin/env tsx
/**
 * Migration Runner Script
 * Runs the UDISE code migration against the database
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔌 Connecting to database...");
  const sql = neon(databaseUrl);

  // Read migration file from command line argument or use default
  const migrationFileName = process.argv[2] || "add_udise_code.sql";
  const migrationPath = path.join(__dirname, "migrations", migrationFileName);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ ERROR: Migration file not found at ${migrationPath}`);
    process.exit(1);
  }
  
  console.log(`📄 Using migration file: ${migrationFileName}`);

  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
  
  // Remove comments and split into statements
  let cleanedSQL = migrationSQL
    // Remove block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Remove single-line comments (but preserve -- in strings)
    .split("\n")
    .map(line => {
      const commentIndex = line.indexOf("--");
      if (commentIndex >= 0) {
        // Check if it's inside a string (simple check)
        const beforeComment = line.substring(0, commentIndex);
        const singleQuotes = (beforeComment.match(/'/g) || []).length;
        if (singleQuotes % 2 === 0) {
          return line.substring(0, commentIndex);
        }
      }
      return line;
    })
    .join("\n");

  // Split by semicolon, but be careful with semicolons in strings
  const statements: string[] = [];
  let currentStatement = "";
  let inString = false;
  let stringChar = "";
  
  for (let i = 0; i < cleanedSQL.length; i++) {
    const char = cleanedSQL[i];
    const nextChar = cleanedSQL[i + 1];
    
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
  
  // Add remaining statement if any
  if (currentStatement.trim().length > 0) {
    statements.push(currentStatement.trim());
  }

  // Filter out empty statements
  const validStatements = statements.filter(s => s.trim().length > 0);

  console.log(`📝 Found ${validStatements.length} SQL statements to execute\n`);

  try {
    // Execute each statement
    for (let i = 0; i < validStatements.length; i++) {
      const statement = validStatements[i];
      const statementPreview = statement.substring(0, 80).replace(/\s+/g, " ").trim();
      
      console.log(`[${i + 1}/${validStatements.length}] Executing: ${statementPreview}...`);
      
      try {
        await sql(statement);
        console.log(`   ✅ Success\n`);
      } catch (error: any) {
        // Check if it's a "already exists" error (which is fine for IF NOT EXISTS)
        const errorMsg = error.message || String(error);
        if (errorMsg.includes("already exists") || 
            errorMsg.includes("duplicate") ||
            errorMsg.includes("does not exist") ||
            errorMsg.includes("constraint") && errorMsg.includes("does not exist")) {
          console.log(`   ⚠️  Warning: ${errorMsg.substring(0, 100)}\n`);
        } else {
          console.error(`   ❌ Error: ${errorMsg}`);
          throw error;
        }
      }
    }

    console.log("✅ Migration completed successfully!");
    console.log("\n📋 Summary:");
    console.log("   - Schools table created");
    console.log("   - UDISE code column added to vacancies");
    console.log("   - Allotted school UDISE column added to students");
    console.log("   - Unique constraints updated");
    console.log("   - Indexes created");
    console.log("\n⚠️  Note: UDISE code is nullable initially. Make it NOT NULL after data migration.");

  } catch (error: any) {
    console.error("\n❌ Migration failed:");
    console.error(error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run migration
runMigration().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

