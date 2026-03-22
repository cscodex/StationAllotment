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
  
  const eligibleStudents = allStudents.filter(s => s.appNo && s.choice1 && emap.has(s.appNo));
  eligibleStudents.sort((a, b) => a.meritNumber - b.meritNumber);

  const queues = new Map();
  eligibleStudents.forEach(s => {
    const e = emap.get(s.appNo);
    const bucket = `${e.gender}_${e.category}`;
    if (!queues.has(bucket)) queues.set(bucket, []);
    queues.get(bucket).push(s);
  });

  let totalMismatches = 0;
  for (const [bucket, qStudents] of queues.entries()) {
      let availableForBucket = new Map();
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
          let possibleToAllocate = false; // Could they have gotten a seat BEFORE this turn assuming seats were left?
          
          for (let i = 1; i <= 10; i++) {
              const choice = s[`choice${i}`];
              if (!choice) continue;
              const key = `${choice}|${s.stream}`;
              if (availableForBucket.has(key) && availableForBucket.get(key) > 0) {
                  availableForBucket.set(key, availableForBucket.get(key) - 1);
                  allocated = true;
                  break;
              }
          }
          if (!allocated) {
              // Now we check if their choice STILL has seats (meaning they should have gotten it)
              for (let i = 1; i <= 10; i++) {
                  const choice = s[`choice${i}`];
                  if (!choice) continue;
                  const key = `${choice}|${s.stream}`;
                  if (availableForBucket.has(key) && availableForBucket.get(key) > 0) {
                      console.log(`ERROR: Student ${s.name} (${s.appNo}) Merit ${s.meritNumber} [${bucket}] Denied BUT choice ${choice} still has ${availableForBucket.get(key)} seats left!`);
                      totalMismatches++;
                  }
              }
          }
      }
  }

  console.log(`Total algorithm logic errors found: ${totalMismatches}`);
  
  // If NO errors, it means the remaining seats are simply in districts/streams NO ONE asked for.
  // Let's print out the remaining seats!
  console.log("Remaining seats that NO ONE wanted:");
  for (const [bucket, qStudents] of queues.entries()) {
      let availableForBucket = new Map();
      allVacancies.forEach(v => {
          if (v.gender === bucket.split('_')[0] && v.category === bucket.split('_')[1]) {
             const key = `${v.district}|${v.stream}`;
             if (!availableForBucket.has(key)) availableForBucket.set(key, 0);
             availableForBucket.set(key, availableForBucket.get(key) + (v.totalSeats || 0));
          }
      });
      // simulate all
      for (const s of qStudents) {
          for (let i = 1; i <= 10; i++) {
              const choice = s[`choice${i}`];
              const key = `${choice}|${s.stream}`;
              if (availableForBucket.has(key) && availableForBucket.get(key) > 0) {
                  availableForBucket.set(key, availableForBucket.get(key) - 1);
                  break;
              }
          }
      }
      
      // Print left over
      for (const [k, v] of availableForBucket.entries()) {
          if (v > 0) {
              console.log(`[${bucket}] ${k}: ${v} seats left`);
          }
      }
  }

  process.exit(0);
}
analyze().catch(console.error);
