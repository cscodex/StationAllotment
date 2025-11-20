-- ================================================================================
-- Migration: Add Multi-Counseling Support
-- ================================================================================
-- This migration adds:
-- 1. Counseling rounds table for tracking multiple rounds per academic year
-- 2. Academic year columns to vacancies, students, and students_entrance_result
-- 3. Counseling round tracking columns to students table
-- 4. Updates unique constraints
-- ================================================================================

-- Step 1: Create Counseling Rounds table
-- ================================================================================
CREATE TABLE IF NOT EXISTS counseling_rounds (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year VARCHAR NOT NULL,
    round_number INTEGER NOT NULL,
    round_name VARCHAR NOT NULL, -- Counseling title (required) - e.g., 'First Counseling', 'Second Counseling'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(academic_year, round_name, round_number) -- Multiple counselings, each with multiple rounds numbered from 1
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_counseling_rounds_academic_year ON counseling_rounds(academic_year);
CREATE INDEX IF NOT EXISTS idx_counseling_rounds_round_name ON counseling_rounds(round_name);
CREATE INDEX IF NOT EXISTS idx_counseling_rounds_active ON counseling_rounds(is_active);

-- Step 2: Add academic_year to Vacancies table
-- ================================================================================
ALTER TABLE vacancies 
ADD COLUMN IF NOT EXISTS academic_year VARCHAR;

-- Add index
CREATE INDEX IF NOT EXISTS idx_vacancies_academic_year ON vacancies(academic_year);

-- Step 3: Update Vacancies unique constraint
-- ================================================================================
-- Remove old unique constraint
ALTER TABLE vacancies 
DROP CONSTRAINT IF EXISTS vacancies_udise_stream_gender_category_unique;

-- Add new unique constraint with academic year
ALTER TABLE vacancies 
ADD CONSTRAINT vacancies_academic_year_udise_stream_gender_category_unique 
UNIQUE(academic_year, udise_code, stream, gender, category);

-- Step 4: Add academic_year to Students table
-- ================================================================================
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS academic_year VARCHAR;

-- Add index
CREATE INDEX IF NOT EXISTS idx_students_academic_year ON students(academic_year);

-- Step 5: Add counseling round tracking to Students table
-- ================================================================================
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS counseling_round_id VARCHAR REFERENCES counseling_rounds(id) ON DELETE SET NULL ON UPDATE CASCADE,
ADD COLUMN IF NOT EXISTS counseling_round_number INTEGER,
ADD COLUMN IF NOT EXISTS preferences_updated_at TIMESTAMP;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_students_counseling_round_id ON students(counseling_round_id);
CREATE INDEX IF NOT EXISTS idx_students_counseling_round_number ON students(counseling_round_number);

-- Step 6: Add academic_year to Students Entrance Result table
-- ================================================================================
ALTER TABLE students_entrance_result 
ADD COLUMN IF NOT EXISTS academic_year VARCHAR;

-- Add index
CREATE INDEX IF NOT EXISTS idx_students_entrance_result_academic_year ON students_entrance_result(academic_year);

-- Step 7: Data Migration (Optional - for existing data)
-- ================================================================================
-- If you have existing data, set a default academic year
-- Uncomment and modify as needed:

-- Set default academic year for existing data (e.g., "2024-2025")
-- UPDATE vacancies SET academic_year = '2024-2025' WHERE academic_year IS NULL;
-- UPDATE students SET academic_year = '2024-2025' WHERE academic_year IS NULL;
-- UPDATE students_entrance_result SET academic_year = '2024-2025' WHERE academic_year IS NULL;

-- Create initial counseling round for existing data
-- INSERT INTO counseling_rounds (academic_year, round_number, round_name, start_date, end_date, is_active, is_completed)
-- VALUES ('2024-2025', 1, 'First Counseling', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', false, false)
-- ON CONFLICT (academic_year, round_number) DO NOTHING;

-- Link existing allocations to round 1 (if any)
-- UPDATE students 
-- SET counseling_round_id = (
--     SELECT id FROM counseling_rounds 
--     WHERE academic_year = students.academic_year AND round_number = 1
-- ),
-- counseling_round_number = 1
-- WHERE allocation_status = 'allotted' AND counseling_round_id IS NULL;

-- Step 8: Make academic_year required (after data migration)
-- ================================================================================
-- IMPORTANT: Only run this after you've migrated all existing data
-- Uncomment when ready:

-- ALTER TABLE vacancies 
-- ALTER COLUMN academic_year SET NOT NULL;

-- ALTER TABLE students 
-- ALTER COLUMN academic_year SET NOT NULL;

-- ALTER TABLE students_entrance_result 
-- ALTER COLUMN academic_year SET NOT NULL;

-- ================================================================================
-- Migration Complete
-- ================================================================================
-- After running this migration:
-- 1. Update your application code to use academic year and rounds
-- 2. Create counseling rounds for your academic year
-- 3. Upload vacancies with academic year
-- 4. Upload students with academic year
-- 5. Run allocation for specific rounds
-- ================================================================================

