import { db } from '../server/db';
import { vacancies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.select({
    sum: sql`SUM(available_seats)`
  }).from(vacancies);
  console.log('Total Vacancies:', result);
  process.exit(0);
}
main().catch(console.error);
