import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '.env') });

import { db } from './server/db';
import { students } from '@shared/schema';
import { isNotNull, eq } from 'drizzle-orm';

// The 10 districts that actually have counseling stations
const SCHOOL_DISTRICTS = [
  'Amritsar',
  'Bathinda',
  'Ferozepur',
  'Gurdaspur',
  'Jalandhar',
  'Ludhiana',
  'Patiala',
  'SAS Nagar (Mohali)',
  'Sangrur',
  'Talwara'
];

function shuffle<T>(arr: T[]): T[] {
  return arr.sort(() => Math.random() - 0.5);
}

async function fixChoices() {
  console.log('🚀 Fixing student choices to use District Names...\n');

  try {
    // We only want to update students who have been assigned a counseling district 
    // by the previous seeder
    const assignedStudents = await db.select({
      id: students.id,
      counselingDistrict: students.counselingDistrict
    })
    .from(students)
    .where(isNotNull(students.counselingDistrict));

    console.log(`✅ Found ${assignedStudents.length} students to fix...`);

    let updated = 0;
    
    // Process in batches so it's faster
    const batchSize = 100;
    for (let i = 0; i < assignedStudents.length; i += batchSize) {
      const batch = assignedStudents.slice(i, i + batchSize);
      
      for (const student of batch) {
        // Generate a random order of the 10 school districts
        const randomChoices = shuffle([...SCHOOL_DISTRICTS]);
        
        await db.update(students)
          .set({
            choice1: randomChoices[0],
            choice2: randomChoices[1],
            choice3: randomChoices[2],
            choice4: randomChoices[3],
            choice5: randomChoices[4],
            choice6: randomChoices[5],
            choice7: randomChoices[6],
            choice8: randomChoices[7],
            choice9: randomChoices[8],
            choice10: randomChoices[9],
            preferencesUpdatedAt: new Date()
          })
          .where(eq(students.id, student.id));
          
        updated++;
      }
      
      if (updated % 1000 === 0) {
        console.log(`   ⏳ Updated ${updated} students...`);
      }
    }

    console.log(`\n🎉 FIXED! Successfully updated ${updated} students.`);
    console.log(`All 10 choices now correctly use the District names (e.g., 'Amritsar', 'Bathinda').`);
    console.log(`👉 You can now run the allocation!`);
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Failed:', error);
    process.exit(1);
  }
}

fixChoices();
