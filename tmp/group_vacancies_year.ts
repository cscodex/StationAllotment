import { db } from '../server/db';
import { vacancies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.select({
    year: vacancies.academicYear,
    roundName: vacancies.roundName,
    sum: sql`SUM(available_seats)`
  }).from(vacancies).groupBy(vacancies.academicYear, vacancies.roundName);
  console.log('Vacancies by Year/RoundName:', JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(console.error);
