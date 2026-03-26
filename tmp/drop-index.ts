import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Dropping constraint...");
  try {
    await db.execute(sql`ALTER TABLE counseling_rounds DROP CONSTRAINT IF EXISTS counseling_rounds_academic_year_round_name_round_number_unique;`);
    console.log("Constraint dropped.");
  } catch(e) {
    console.log(e);
  }
  process.exit(0);
}

run();
