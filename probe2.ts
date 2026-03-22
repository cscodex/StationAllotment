import { db } from "./server/db";
import { students, studentsEntranceResult, vacancies, counselingRounds } from "./shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";

async function analyze() {
  const round = await db.query.counselingRounds.findFirst({});
  if (!round) { console.log("No round"); return; }
  
  const allStudents = await db.select().from(students);
  const allEntrance = await db.select().from(studentsEntranceResult);
  const allVacancies = await db.select().from(vacancies).where(and(eq(vacancies.academicYear, round.academicYear), isNotNull(vacancies.udiseCode)));
  
  const emap = new Map();
  allEntrance.forEach(e => emap.set(e.applicationNo, e));

  // Find a student who is unallocated but has seats available in their choices for their exact category
  let found = false;
  for (const s of allStudents.filter(s => s.allocationStatus === 'not_allotted' && s.choice1)) {
    const e = emap.get(s.appNo!);
    if (!e) continue;
    
    // check all their choices
    let choiceWithVacancy = null;
    let fallbackAvailable = false;
    for (let i = 1; i <= 10; i++) {
      const c = (s as any)[`choice${i}`];
      if (!c) continue;
      
      const v = allVacancies.filter(v => v.district === c && v.stream === s.stream && v.gender === e.gender && v.category === e.category && (v.availableSeats || 0) > 0);
      if (v.length > 0) {
        choiceWithVacancy = c;
        break;
      }
    }
    
    if (choiceWithVacancy) {
      console.log(`Mismatch! Student ${s.name} (${s.appNo}) Merit: ${s.meritNumber} denied but Choice ${choiceWithVacancy} has ${e.gender}/${e.category} seats available!`);
      found = true;
      break;
    }
  }

  if (!found) {
    console.log("No student was denied when their specific choice+gender+category+stream had available seats.");
    console.log("Checking if there's any student denied when their exact choice had OPEN seats available.");
    for (const s of allStudents.filter(s => s.allocationStatus === 'not_allotted' && s.choice1)) {
      const e = emap.get(s.appNo!);
      if (!e) continue;
      
      let choiceWithOpenVacancy = null;
      for (let i = 1; i <= 10; i++) {
        const c = (s as any)[`choice${i}`];
        if (!c) continue;
        
        // Check Open category for same gender
        const v = allVacancies.filter(v => v.district === c && v.stream === s.stream && v.gender === e.gender && v.category === 'Open' && (v.availableSeats || 0) > 0);
        if (v.length > 0) {
          choiceWithOpenVacancy = c;
          break;
        }
      }
      
      if (choiceWithOpenVacancy) {
        console.log(`Student ${s.name} (${s.appNo}) Merit ${s.meritNumber} (Category ${e.category}) denied, but Choice ${choiceWithOpenVacancy} has OPEN seats available!`);
        found = true;
        break;
      }
    }
  }

  process.exit(0);
}
analyze().catch(console.error);
