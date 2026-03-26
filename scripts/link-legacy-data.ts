import { db } from '../server/db';
import { counselingTitles, students, vacancies, counselingRounds, districtStatus, studentsEntranceResult } from '../shared/schema';
import { isNull, eq } from 'drizzle-orm';

async function migrate() {
  console.log("Starting data migration...");
  
  // 1. Find the target title ID
  const titles = await db.select().from(counselingTitles);
  const targetTitle = titles.find(t => t.titleName === 'MeritoriousSchoolLudhiana' || t.isActive);
  
  if (!targetTitle) {
    console.error("No active counseling title found! Please ensure 'MeritoriousSchoolLudhiana' exists.");
    process.exit(1);
  }
  
  const titleId = targetTitle.id;
  console.log(`Linking legacy data to Title ID: ${titleId} (${targetTitle.titleName})`);
  
  // 2. Update Students
  const studentsUpdate = await db.update(students)
    .set({ counselingTitleId: titleId })
    .where(isNull(students.counselingTitleId))
    .returning({ id: students.id });
  console.log(`Updated ${studentsUpdate.length} students records.`);
  
  // 3. Update Vacancies
  const vacanciesUpdate = await db.update(vacancies)
    .set({ counselingTitleId: titleId })
    .where(isNull(vacancies.counselingTitleId))
    .returning({ id: vacancies.id });
  console.log(`Updated ${vacanciesUpdate.length} vacancies records.`);

  // 4. Update Counseling Rounds
  const roundsUpdate = await db.update(counselingRounds)
    .set({ counselingTitleId: titleId })
    .where(isNull(counselingRounds.counselingTitleId))
    .returning({ id: counselingRounds.id });
  console.log(`Updated ${roundsUpdate.length} counseling rounds records.`);
  
  // 5. Update District Status
  const dsUpdate = await db.update(districtStatus)
    .set({ counselingTitleId: titleId })
    .where(isNull(districtStatus.counselingTitleId))
    .returning({ id: districtStatus.id });
  console.log(`Updated ${dsUpdate.length} district status records.`);
  
  // 6. Update Students Entrance Result
  const serUpdate = await db.update(studentsEntranceResult)
    .set({ counselingTitleId: titleId })
    .where(isNull(studentsEntranceResult.counselingTitleId))
    .returning({ id: studentsEntranceResult.id });
  console.log(`Updated ${serUpdate.length} students entrance results.`);
  
  console.log("Migration complete!");
  process.exit(0);
}

migrate().catch(console.error);
