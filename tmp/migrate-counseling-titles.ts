import { db } from '../server/db';
import { sql } from 'drizzle-orm';

/**
 * Migration: Multi-Counseling Title System
 *
 * Phase 1: Create counseling_titles table
 * Phase 2: Add counseling_title_id FK columns to all data tables  
 * Phase 3: Seed counseling_titles from existing data
 * Phase 4: Backfill FK references
 */
async function main() {
  console.log('🚀 Starting Multi-Counseling Title Migration...\n');

  // ─── PHASE 1: Create the counseling_titles table ───
  console.log('📋 Phase 1: Creating counseling_titles table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS counseling_titles (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      academic_year VARCHAR NOT NULL,
      title_name VARCHAR NOT NULL,
      display_name VARCHAR,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(academic_year, title_name)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_counseling_titles_academic_year ON counseling_titles(academic_year)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_counseling_titles_active ON counseling_titles(is_active)`);
  console.log('   ✅ counseling_titles table created\n');

  // ─── PHASE 2: Add counseling_title_id FK columns ───
  console.log('📋 Phase 2: Adding counseling_title_id columns to data tables...');

  const tables = [
    'counseling_rounds',
    'students',
    'students_entrance_result',
    'vacancies',
    'district_status',
    'file_uploads',
  ];

  for (const table of tables) {
    try {
      await db.execute(sql.raw(`
        ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS counseling_title_id VARCHAR REFERENCES counseling_titles(id) ON DELETE SET NULL ON UPDATE CASCADE;
      `));
      console.log(`   ✅ counseling_title_id added to ${table}`);
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log(`   ⏭  counseling_title_id already exists on ${table}`);
      } else {
        console.error(`   ❌ Error adding to ${table}: ${e.message}`);
      }
    }
  }

  // Fix counseling_rounds to use CASCADE delete instead of SET NULL
  try {
    await db.execute(sql.raw(`ALTER TABLE counseling_rounds DROP CONSTRAINT IF EXISTS counseling_rounds_counseling_title_id_counseling_titles_id_fk`));
    await db.execute(sql.raw(`ALTER TABLE counseling_rounds ADD CONSTRAINT counseling_rounds_counseling_title_id_counseling_titles_id_fk FOREIGN KEY (counseling_title_id) REFERENCES counseling_titles(id) ON DELETE CASCADE ON UPDATE CASCADE`));
    console.log('   ✅ counseling_rounds FK updated to CASCADE');
  } catch (e: any) {
    console.log(`   ⏭  FK constraint update skipped: ${e.message}`);
  }

  console.log('');

  // ─── PHASE 3: Seed counseling_titles from existing data ───
  console.log('📋 Phase 3: Seeding counseling_titles from existing round_name data...');

  // Extract unique (academic_year, round_name) combinations from counseling_rounds
  const existingTitles = await db.execute(sql`
    SELECT DISTINCT academic_year, round_name 
    FROM counseling_rounds 
    WHERE round_name IS NOT NULL 
    ORDER BY academic_year, round_name
  `);

  let seeded = 0;
  for (const row of existingTitles.rows) {
    const year = row.academic_year as string;
    const titleName = row.round_name as string;
    // Generate a human-readable display name from camelCase/PascalCase
    const displayName = titleName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^ /, '')
      .replace(/\s+/g, ' ')
      .trim();

    try {
      await db.execute(sql`
        INSERT INTO counseling_titles (academic_year, title_name, display_name, is_active)
        VALUES (${year}, ${titleName}, ${displayName}, true)
        ON CONFLICT (academic_year, title_name) DO NOTHING
      `);
      seeded++;
      console.log(`   ✅ Seeded: "${displayName}" (${year})`);
    } catch (e: any) {
      console.log(`   ⏭  Skipped "${titleName}" (${year}): ${e.message}`);
    }
  }
  console.log(`   📊 Total seeded: ${seeded}\n`);

  // ─── PHASE 4: Backfill counseling_title_id FKs ───
  console.log('📋 Phase 4: Backfilling counseling_title_id on data tables...');

  // Backfill counseling_rounds
  const updatedRounds = await db.execute(sql`
    UPDATE counseling_rounds cr
    SET counseling_title_id = ct.id
    FROM counseling_titles ct
    WHERE cr.academic_year = ct.academic_year 
      AND cr.round_name = ct.title_name
      AND cr.counseling_title_id IS NULL
  `);
  console.log(`   ✅ counseling_rounds backfilled: ${updatedRounds.rowCount} rows`);

  // Backfill vacancies
  const updatedVacancies = await db.execute(sql`
    UPDATE vacancies v
    SET counseling_title_id = ct.id
    FROM counseling_titles ct
    WHERE v.academic_year = ct.academic_year 
      AND v.round_name = ct.title_name
      AND v.counseling_title_id IS NULL
  `);
  console.log(`   ✅ vacancies backfilled: ${updatedVacancies.rowCount} rows`);

  // Backfill students_entrance_result
  const updatedER = await db.execute(sql`
    UPDATE students_entrance_result ser
    SET counseling_title_id = ct.id
    FROM counseling_titles ct
    WHERE ser.academic_year = ct.academic_year 
      AND ser.round_name = ct.title_name
      AND ser.counseling_title_id IS NULL
  `);
  console.log(`   ✅ students_entrance_result backfilled: ${updatedER.rowCount} rows`);

  // Backfill students (via their counseling_round_id → counseling_rounds → counseling_title_id)
  const updatedStudents = await db.execute(sql`
    UPDATE students s
    SET counseling_title_id = cr.counseling_title_id
    FROM counseling_rounds cr
    WHERE s.counseling_round_id = cr.id
      AND cr.counseling_title_id IS NOT NULL
      AND s.counseling_title_id IS NULL
  `);
  console.log(`   ✅ students (via round) backfilled: ${updatedStudents.rowCount} rows`);

  // Also backfill students who don't have a counseling_round_id yet but have academic_year
  const updatedStudents2 = await db.execute(sql`
    UPDATE students s
    SET counseling_title_id = ct.id
    FROM counseling_titles ct
    WHERE s.academic_year = ct.academic_year
      AND s.counseling_title_id IS NULL
      AND ct.is_active = true
  `);
  console.log(`   ✅ students (via year fallback) backfilled: ${updatedStudents2.rowCount} rows`);

  // Backfill district_status (via counseling_round_id)
  const updatedDS = await db.execute(sql`
    UPDATE district_status ds
    SET counseling_title_id = cr.counseling_title_id
    FROM counseling_rounds cr
    WHERE ds.counseling_round_id = cr.id
      AND cr.counseling_title_id IS NOT NULL
      AND ds.counseling_title_id IS NULL
  `);
  console.log(`   ✅ district_status backfilled: ${updatedDS.rowCount} rows`);

  // Backfill file_uploads (via counseling_round_id)
  const updatedFiles = await db.execute(sql`
    UPDATE file_uploads fu
    SET counseling_title_id = cr.counseling_title_id
    FROM counseling_rounds cr
    WHERE fu.counseling_round_id = cr.id
      AND cr.counseling_title_id IS NOT NULL
      AND fu.counseling_title_id IS NULL
  `);
  console.log(`   ✅ file_uploads backfilled: ${updatedFiles.rowCount} rows`);

  console.log('\n🎉 Migration completed successfully!');

  // ─── VERIFY ───
  console.log('\n📊 Verification:');
  const titles = await db.execute(sql`SELECT id, academic_year, title_name, display_name FROM counseling_titles ORDER BY academic_year`);
  titles.rows.forEach((r: any) => {
    console.log(`   📌 ${r.title_name} (${r.academic_year}) → ID: ${r.id} → Display: "${r.display_name}"`);
  });

  const nullCounts = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM counseling_rounds WHERE counseling_title_id IS NULL) as null_rounds,
      (SELECT COUNT(*) FROM vacancies WHERE counseling_title_id IS NULL) as null_vacancies,
      (SELECT COUNT(*) FROM students WHERE counseling_title_id IS NULL) as null_students,
      (SELECT COUNT(*) FROM students_entrance_result WHERE counseling_title_id IS NULL) as null_er,
      (SELECT COUNT(*) FROM district_status WHERE counseling_title_id IS NULL) as null_ds,
      (SELECT COUNT(*) FROM file_uploads WHERE counseling_title_id IS NULL) as null_files
  `);
  const nc = nullCounts.rows[0] as any;
  console.log(`\n   NULL counseling_title_id counts:`);
  console.log(`     counseling_rounds: ${nc.null_rounds}`);
  console.log(`     vacancies: ${nc.null_vacancies}`);
  console.log(`     students: ${nc.null_students}`);
  console.log(`     students_entrance_result: ${nc.null_er}`);
  console.log(`     district_status: ${nc.null_ds}`);
  console.log(`     file_uploads: ${nc.null_files}`);

  process.exit(0);
}

main().catch(e => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});
