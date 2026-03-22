import { db } from "./server/db";
import { vacancies } from "./shared/schema";
import { isNull } from "drizzle-orm";

async function analyze() {
  const allVacancies = await db.select().from(vacancies);
  const withoutUdise = allVacancies.filter(v => !v.udiseCode || v.udiseCode.trim() === '');
  const withUdise = allVacancies.filter(v => v.udiseCode && v.udiseCode.trim() !== '');
  
  console.log(`Total vacancies: ${allVacancies.length}`);
  console.log(`With UDISE: ${withUdise.length}`);
  console.log(`Without UDISE: ${withoutUdise.length}`);
  
  if (withoutUdise.length > 0) {
    console.log("Example without UDISE:", withoutUdise[0]);
  }

  process.exit(0);
}
analyze().catch(console.error);
