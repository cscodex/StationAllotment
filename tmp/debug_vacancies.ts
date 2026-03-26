import { db } from '../server/db';
import { vacancies } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

async function main() {
  // Check what roundNames exist and their available seats
  const result = await db.select({
    roundName: vacancies.roundName,
    academicYear: vacancies.academicYear,
    count: sql`COUNT(*)`,
    sumAvailable: sql`SUM(available_seats)`,
    sumTotal: sql`SUM(total_seats)`,
  }).from(vacancies).groupBy(vacancies.roundName, vacancies.academicYear);
  
  console.log('Vacancy summary:', JSON.stringify(result, null, 2));
  
  // Check a sample to see if roundName is null
  const sample = await db.select({
    id: vacancies.id,
    roundName: vacancies.roundName,
    academicYear: vacancies.academicYear,
    availableSeats: vacancies.availableSeats,
  }).from(vacancies).limit(3);
  console.log('\nSample vacancies:', JSON.stringify(sample, null, 2));
  
  // Check if there are any with null roundName
  const nullRoundNames = await db.select({
    count: sql`COUNT(*)`
  }).from(vacancies).where(sql`round_name IS NULL`);
  console.log('\nVacancies with NULL roundName:', JSON.stringify(nullRoundNames, null, 2));
  
  process.exit(0);
}
main().catch(console.error);
