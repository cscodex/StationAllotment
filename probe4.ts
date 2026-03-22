import { db } from "./server/db";
import { students, studentsEntranceResult, vacancies, counselingRounds } from "./shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";

async function analyze() {
  const round = await db.query.counselingRounds.findFirst({});
  if (!round) { console.log("No round"); return; }
  
  const allStudents = await db.select().from(students);
  const allEntrance = await db.select().from(studentsEntranceResult).where(eq(studentsEntranceResult.academicYear, round.academicYear));
  const allVacancies = await db.select().from(vacancies).where(and(eq(vacancies.academicYear, round.academicYear), isNotNull(vacancies.udiseCode)));
  
  const emap = new Map();
  allEntrance.forEach(e => emap.set(e.applicationNo, e));
  
  const vacancyMap = new Map();
  let totalCap = 0;
  allVacancies.forEach(v => {
      const key = `${v.district}|${v.stream}|${v.gender}|${v.category}`;
      if (!vacancyMap.has(key)) vacancyMap.set(key, 0);
      vacancyMap.set(key, vacancyMap.get(key) + (v.totalSeats || 0));
      totalCap += (v.totalSeats || 0);
  });
  console.log(`Total Capacity in Vacancies: ${totalCap}`);

  const eligibleStudents = allStudents.filter(s => s.appNo && s.choice1 && emap.has(s.appNo));
  console.log(`Eligible Students: ${eligibleStudents.length}`);

  // Sort by merit
  eligibleStudents.sort((a, b) => a.meritNumber - b.meritNumber);

  // Group by queue
  const queues = new Map();
  eligibleStudents.forEach(s => {
    const e = emap.get(s.appNo);
    const bucket = `${e.gender}_${e.category}`;
    if (!queues.has(bucket)) queues.set(bucket, []);
    queues.get(bucket).push(s);
  });

  // Since queues run in parallel exactly as in the app, but they don't intersect, 
  // we can just simulate allocation queue by queue and check if anyone is denied.
  const reasons = [];
  
  for (const [bucket, qStudents] of queues.entries()) {
      let bucketAllotted = 0;
      let bucketDenied = 0;
      let availableForBucket = new Map(); // Copy vacancy counts for this bucket
      
      const gender = bucket.split('_')[0];
      const category = bucket.split('_')[1];
      
      allVacancies.forEach(v => {
          if (v.gender === gender && v.category === category) {
             const key = `${v.district}|${v.stream}`;
             if (!availableForBucket.has(key)) availableForBucket.set(key, 0);
             availableForBucket.set(key, availableForBucket.get(key) + (v.totalSeats || 0));
          }
      });
      
      for (const s of qStudents) {
          let allocated = false;
          for (let i = 1; i <= 10; i++) {
              const choice = s[`choice${i}`];
              if (!choice) continue;
              
              const stream = s.stream;
              const key = `${choice}|${stream}`;
              
              if (availableForBucket.has(key) && availableForBucket.get(key) > 0) {
                  availableForBucket.set(key, availableForBucket.get(key) - 1);
                  allocated = true;
                  bucketAllotted++;
                  break;
              }
          }
          if (!allocated) {
              bucketDenied++;
              if (category !== 'Open') {
                  // If reserved and denied, let's see why
                  reasons.push(`Student ${s.name} (${s.appNo}) Merit ${s.meritNumber} [${bucket}] Denied. Choices: ${[1,2,3,4,5].map(i=>s[`choice${i}`]).filter(Boolean).join(', ')}`);
              }
          }
      }
      console.log(`Queue ${bucket}: Allotted ${bucketAllotted}, Denied ${bucketDenied}`);
  }

  console.log("First 10 denied reserved candidates:");
  reasons.slice(0, 10).forEach(r => console.log(r));

  process.exit(0);
}
analyze().catch(console.error);
