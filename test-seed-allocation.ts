import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '.env') });

import { db } from './server/db';
import { students, districtStatus, users, schools } from '@shared/schema';
import { isNull, eq } from 'drizzle-orm';

// ── All 23 Punjab counseling districts ──────────────────────────────────────
const ALL_23_DISTRICTS = [
  'Amritsar', 'Barnala', 'Bathinda', 'Faridkot', 'Fatehgarh Sahib',
  'Fazilka', 'Ferozepur', 'Gurdaspur', 'Hoshiarpur', 'Jalandhar',
  'Kapurthala', 'Ludhiana', 'Mansa', 'Moga', 'Muktsar',
  'Nawanshahr', 'Pathankot', 'Patiala', 'Rupnagar', 'SAS Nagar (Mohali)',
  'Sangrur', 'Tarn Taran', 'Talwara'
];

function shuffle<T>(arr: T[]): T[] {
  return arr.sort(() => Math.random() - 0.5);
}

async function seedDistrictAssignments() {
  console.log('🚀 Starting Smart District Assignment Seeder...\n');

  try {
    const credsPath = path.join(__dirname, 'credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    const centralAdmin = creds.central_admin;

    // ── 1. Build district admin lookup ─────────────────────────────────────
    const adminByDistrict: Record<string, string> = {};
    for (const a of (creds.district_admins || [])) {
      adminByDistrict[a.district] = a.username;
    }

    // ── 2. Get central admin DB ID ─────────────────────────────────────────
    const [cAdminRow] = await db.select().from(users).where(eq(users.username, centralAdmin.username));
    const adminId = cAdminRow?.id || 'system';

    // ── 3. Fetch ALL real existing schools (the 10 station districts) ──────
    const allSchools = await db.select().from(schools);
    if (allSchools.length === 0) {
      throw new Error('No schools found in database! Make sure your real school/station data is loaded first.');
    }
    const stationNames = allSchools.map(s => s.schoolName);
    console.log(`✅ Found ${allSchools.length} real stations/schools in database`);

    // ── 4. Fetch ALL existing students that are not yet assigned ───────────
    // We want unlocked, unassigned students only  
    const allStudents = await db.select().from(students);
    const unassigned = allStudents.filter(s => !s.counselingDistrict && !s.isLocked);
    
    console.log(`✅ Found ${allStudents.length} total students, ${unassigned.length} unassigned & unlocked\n`);

    if (unassigned.length === 0) {
      // If all students are already assigned, let's work with everyone
      console.log('⚠️  No unassigned students found. Using ALL students and re-assigning districts.\n');
    }

    const workingStudents = unassigned.length > 0 ? unassigned : allStudents;

    // ── 5. Sort students to ensure uniform category/gender distribution ────
    // Group by gender + category so we can round-robin assign to districts
    const studentsByGroup: Record<string, typeof workingStudents> = {};
    for (const s of workingStudents) {
      const key = `${s.gender}-${s.category}`;
      if (!studentsByGroup[key]) studentsByGroup[key] = [];
      studentsByGroup[key].push(s);
    }

    console.log(`📊 Student Groups Found:`);
    for (const [group, arr] of Object.entries(studentsByGroup)) {
      console.log(`   ${group}: ${arr.length} students`);
    }
    console.log('');

    // ── 6. Round-robin assign students to districts ─────────────────────────
    // We cycle through districts so every district gets at least 1 student from every group
    const assignmentMap: Record<string, (typeof workingStudents)> = {};
    for (const d of ALL_23_DISTRICTS) assignmentMap[d] = [];

    for (const [group, groupStudents] of Object.entries(studentsByGroup)) {
      // Shuffle to avoid sequential merit number bias
      const shuffled = shuffle([...groupStudents]);
      
      shuffled.forEach((student, idx) => {
        const district = ALL_23_DISTRICTS[idx % ALL_23_DISTRICTS.length];
        assignmentMap[district].push(student);
      });
    }

    // Print planned distribution
    console.log(`📍 Planned District Assignment:`);
    for (const d of ALL_23_DISTRICTS) {
      console.log(`   ${d}: ${assignmentMap[d].length} students`);
    }
    console.log('');

    // ── 7. Apply assignments: update students in DB ─────────────────────────
    let totalUpdated = 0;
    let districtIdx = 0;

    for (const district of ALL_23_DISTRICTS) {
      const distStudents = assignmentMap[district];
      const adminUsername = adminByDistrict[district] || centralAdmin.username;
      
      if (distStudents.length === 0) {
        console.log(`⚠️  ${district}: No students assigned, still finalizing district`);
      }

      for (const student of distStudents) {
        // Pick 10 random unique station choices from real schools
        const shuffledStations = shuffle([...stationNames]);
        const choices = shuffledStations.slice(0, 10);

        await db.update(students)
          .set({
            counselingDistrict: district,
            districtAdmin: adminUsername,
            choice1:  choices[0] || null,
            choice2:  choices[1] || null,
            choice3:  choices[2] || null,
            choice4:  choices[3] || null,
            choice5:  choices[4] || null,
            choice6:  choices[5] || null,
            choice7:  choices[6] || null,
            choice8:  choices[7] || null,
            choice9:  choices[8] || null,
            choice10: choices[9] || null,
            isLocked: true,
            lockedBy: adminId,
            lockedAt: new Date(),
            preferencesUpdatedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(students.id, student.id));

        totalUpdated++;
      }

      console.log(`✅ ${district} — assigned ${distStudents.length} students, filled 10 choices each, locked`);

      // ── 8. Finalize the district ────────────────────────────────────────
      await db.delete(districtStatus).where(eq(districtStatus.district, district));
      await db.insert(districtStatus).values({
        district,
        isFinalized: true,
        finalizedAt: new Date(),
        finalizedBy: adminId,
        totalStudents: distStudents.length,
        lockedStudents: distStudents.length,
        studentsWithChoices: distStudents.length,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`   ✅ District finalized (isFinalized: true)\n`);
    }

    console.log(`${'═'.repeat(55)}`);
    console.log(`🎉 DISTRICT ASSIGNMENT COMPLETE!`);
    console.log(`${'═'.repeat(55)}`);
    console.log(`   Total students updated : ${totalUpdated}`);
    console.log(`   Districts finalized    : ${ALL_23_DISTRICTS.length}`);
    console.log(`   Choices per student    : 10 (from real schools)`);
    console.log(`   Total real stations    : ${allSchools.length}`);
    console.log(`${'═'.repeat(55)}`);
    console.log(`👉 Log in as Central Admin → click RUN ALLOCATION!`);

    process.exit(0);

  } catch (error) {
    console.error('❌ Seeding Failed:', error);
    process.exit(1);
  }
}

seedDistrictAssignments();
