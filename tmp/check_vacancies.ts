import { db } from '../server/db';
import { vacancies } from '../shared/schema';

async function main() {
  const result = await db.select().from(vacancies).limit(10);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(console.error);
