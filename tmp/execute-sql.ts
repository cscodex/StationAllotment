import 'dotenv/config';
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Creating vacated_seats...");
  try {
    await db.execute(sql`
      ALTER TABLE counseling_rounds ADD COLUMN IF NOT EXISTS snapshot_data JSONB;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vacated_seats (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id VARCHAR NOT NULL REFERENCES students(id),
        app_no VARCHAR NOT NULL,
        merit_number INTEGER NOT NULL,
        student_name VARCHAR NOT NULL,
        gender VARCHAR NOT NULL,
        category VARCHAR NOT NULL,
        stream VARCHAR NOT NULL,
        vacated_district VARCHAR NOT NULL,
        vacated_stream VARCHAR NOT NULL,
        reason VARCHAR NOT NULL,
        comment TEXT,
        academic_year VARCHAR NOT NULL,
        counseling_round_id VARCHAR REFERENCES counseling_rounds(id),
        vacated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log("Success.");
  } catch(e) {
    console.log(e);
  }
  process.exit(0);
}

run();
