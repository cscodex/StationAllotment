import { db } from '../server/db';
import { vacancies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.select({
    roundName: vacancies.roundName,
    sum: sql`SUM(available_seats)`
  }).from(vacancies).groupBy(vacancies.roundName);
  console.log('Vacancies by roundName:', JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(console.error);
