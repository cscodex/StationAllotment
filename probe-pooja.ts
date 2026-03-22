import { db } from "./server/db";
import { students, studentsEntranceResult, vacancies, counselingRounds } from "./shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";

async function investigate() {
  const allStudents = await db.select().from(students);
  const pooja = allStudents.find(s => Math.floor(Number(s.meritNumber)) === 1130);
  
  if (!pooja) {
      console.log("Could not find Merit 1130");
      process.exit(1);
  }
  
  console.log(`FOUND Pooja: AppNo: ${pooja.appNo}, Stream: ${pooja.stream}`);
  console.log(`Choices:`);
  for(let i=1; i<=10; i++) {
     if (pooja[`choice${i}` as keyof typeof pooja]) {
         console.log(`  [${i}] ${pooja[`choice${i}` as keyof typeof pooja]}`);
     }
  }

  const allVacancies = await db.select().from(vacancies).where(isNotNull(vacancies.udiseCode));
  
  console.log(`\n--- ALL Female WHH seats in Jalandhar ---`);
  let whhJalandharSum = 0;
  allVacancies.filter(v => v.district === 'Jalandhar' && v.category === 'WHH' && v.gender === 'Female').forEach(v => {
      console.log(`  Stream: ${v.stream} -> ${v.totalSeats} seats (School: ${v.schoolName})`);
      whhJalandharSum += (v.totalSeats || 0);
  });
  console.log(`Total Female WHH seats in Jalandhar: ${whhJalandharSum}`);
  
  console.log(`\n--- Who took the Jalandhar | ${pooja.stream} | Female | WHH seats? ---`);
  const entranceMap = new Map();
  const allER = await db.select().from(studentsEntranceResult);
  allER.forEach(e => entranceMap.set(e.applicationNo, e));
  
  const eligibleStudents = allStudents.filter(s => s.appNo && s.choice1 && entranceMap.has(s.appNo));
  eligibleStudents.sort((a, b) => a.meritNumber - b.meritNumber);
  
  let targetSeatsAvailable = 0;
  allVacancies.filter(v => v.district === 'Jalandhar' && v.category === 'WHH' && v.gender === 'Female' && v.stream === pooja.stream).forEach(v => {
      targetSeatsAvailable += (v.totalSeats || 0);
  });
  console.log(`Target Available initially: ${targetSeatsAvailable}`);
  
  if (targetSeatsAvailable > 0) {
      // simulate who got them
      const winners = [];
      let remaining = targetSeatsAvailable;
      
      for (const s of eligibleStudents) {
          const e = entranceMap.get(s.appNo);
          if (e.gender === 'Female' && e.category === 'WHH') {
              // it's a female whh student. did she ask for jalandhar medical?
              // wait, we must simulate the whole allocation to know if she got jalandhar medical
              // because she might have gotten choice 1
          }
      }
      
  }
  
  process.exit(0);
}

investigate().catch(console.error);
