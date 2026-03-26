import { db } from '../server/db';
import { students, studentsEntranceResult } from '../shared/schema';

async function syncStudents() {
  console.log('Fetching entrance results...');
  const results = await db.select().from(studentsEntranceResult);
  console.log(`Found ${results.length} entrance results.`);

  const existingStudents = await db.select().from(students);
  console.log(`Found ${existingStudents.length} students currently in system.`);

  const existingMerits = new Set(existingStudents.map(s => s.meritNumber));

  const toCreate: any[] = [];
  for (const r of results) {
    if (!existingMerits.has(r.meritNo)) {
      toCreate.push({
        academicYear: r.academicYear || '2025-2026',
        counselingTitleId: r.counselingTitleId,
        appNo: r.applicationNo,
        meritNumber: r.meritNo,
        name: r.studentName,
        gender: r.gender,
        category: r.category,
        stream: r.stream || '', // "NA" maybe not right? "stream" is required
        allocationStatus: 'registered',
      });
    }
  }

  console.log(`Need to create ${toCreate.length} missing students.`);

  if (toCreate.length > 0) {
    // Insert in batches of 500
    for (let i = 0; i < toCreate.length; i += 500) {
      const batch = toCreate.slice(i, i + 500);
      await db.insert(students).values(batch);
      console.log(`Inserted batch ${i} to ${i + batch.length}...`);
    }
    console.log('Sync complete.');
  } else {
    console.log('All students are already in sync.');
  }
  
  process.exit(0);
}

syncStudents().catch(console.error);
