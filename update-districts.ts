import { db } from './server/db';
import { vacancies, schools, districtStatus, users, students } from './shared/schema';
import { eq, or } from 'drizzle-orm';

async function run() {
  console.log('Starting district updates...');

  const targetDistricts = ['SAS Nagar', 'Mohali'];
  const newDistrictName = 'SAS Nagar (Mohali)';

  for (const table of [vacancies, schools, districtStatus, users]) {
    try {
      if ('district' in table) {
        for (const target of targetDistricts) {
          const res = await db.update(table).set({ district: newDistrictName }).where(eq((table as any).district, target)).returning();
          console.log(`Updated ${res.length} rows in table for ${target}`);
        }
      }
    } catch (e) {
      console.log(`Error on a table:`, (e as Error).message);
    }
  }

  // Update student choices
  const targets = ['Pathankot'];
  const newChoiceName = 'Gurdaspur';

  const choices = ['choice1', 'choice2', 'choice3', 'choice4', 'choice5', 'choice6', 'choice7', 'choice8', 'choice9', 'choice10'];
  for (const choice of choices) {
    try {
      for (const target of targets) {
        const res = await db.update(students).set({ [choice]: newChoiceName }).where(eq((students as any)[choice], target)).returning();
        console.log(`Updated ${res.length} rows in students.${choice} from ${target} to ${newChoiceName}`);
      }
      // Also update SAS Nagar choices to SAS Nagar (Mohali) if any
      for (const target of targetDistricts) {
        const res = await db.update(students).set({ [choice]: newDistrictName }).where(eq((students as any)[choice], target)).returning();
        console.log(`Updated ${res.length} rows in students.${choice} from ${target} to ${newDistrictName}`);
      }
    } catch (e) {
      console.log(`Error on students.${choice}:`, (e as Error).message);
    }
  }

  // Update students counselingDistrict
  for (const target of targetDistricts) {
    const res = await db.update(students).set({ counselingDistrict: newDistrictName }).where(eq(students.counselingDistrict, target)).returning();
    console.log(`Updated ${res.length} rows in students.counselingDistrict from ${target} to ${newDistrictName}`);
  }

  console.log('Done!');
  process.exit(0);
}

run().catch(console.error);
