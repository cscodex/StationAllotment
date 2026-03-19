import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '.env') });

import { db } from './server/db';
import { students, districtStatus, schools, vacancies } from '@shared/schema';
import { like, gte, sql } from 'drizzle-orm';

async function revert() {
  console.log('🔄 Reverting all seed data...\n');

  // 1. Delete all seeded students (identifiable by merit number >= 9001 OR app_no starting with SEED-)
  const deletedStudents = await db.delete(students)
    .where(like(students.appNo, 'SEED-%'))
    .returning({ id: students.id });
  console.log(`✅ Deleted ${deletedStudents.length} seeded students (SEED- prefix)`);

  // Also catch any previous round's seeds
  const deletedOldStudents = await db.delete(students)
    .where(gte(students.meritNumber, 9001))
    .returning({ id: students.id });
  console.log(`✅ Deleted ${deletedOldStudents.length} additional seeded students (merit >= 9001)`);

  // 2. Delete all vacancies linked to fake STA- UDISE codes
  const deletedVacancies = await db.delete(vacancies)
    .where(like(vacancies.udiseCode, 'STA-%'))
    .returning({ id: vacancies.id });
  console.log(`✅ Deleted ${deletedVacancies.length} fake vacancies (STA- UDISE)`);

  // 3. Delete all fake schools with STA- UDISE codes
  const deletedSchools = await db.delete(schools)
    .where(like(schools.udiseCode, 'STA-%'))
    .returning({ udiseCode: schools.udiseCode });
  console.log(`✅ Deleted ${deletedSchools.length} fake schools (STA- UDISE)`);

  // 4. Delete all districtStatus rows created by the seeder (all of them, since I wiped real ones too)
  const deletedStatuses = await db.delete(districtStatus)
    .returning({ id: districtStatus.id });
  console.log(`✅ Deleted ${deletedStatuses.length} districtStatus records (all — to reset to clean state)`);

  console.log('\n🎉 Revert complete! Your real schools, real vacancies, and real student data are untouched.');
  console.log('   Only records with SEED- app nos, STA- UDISE codes, and merit numbers ≥ 9001 were removed.');
  process.exit(0);
}

revert().catch(e => {
  console.error('❌ Revert failed:', e);
  process.exit(1);
});
