-- ================================================================================
-- Migration: Add UDISE Code Support
-- ================================================================================
-- This migration adds:
-- 1. Schools table for UDISE code and school name mapping
-- 2. UDISE code column to vacancies table
-- 3. Allotted school UDISE code to students table
-- 4. Updates unique constraints
-- ================================================================================

-- Step 1: Create Schools table
-- ================================================================================
CREATE TABLE IF NOT EXISTS schools (
    udise_code VARCHAR PRIMARY KEY,
    school_name VARCHAR NOT NULL,
    district VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add index for faster district lookups
CREATE INDEX IF NOT EXISTS idx_schools_district ON schools(district);

-- Step 2: Add UDISE code to Vacancies table
-- ================================================================================
-- First, add the column as nullable to allow existing data
ALTER TABLE vacancies 
ADD COLUMN IF NOT EXISTS udise_code VARCHAR;

-- Add foreign key constraint (initially deferrable to handle existing data)
ALTER TABLE vacancies 
ADD CONSTRAINT fk_vacancies_school 
FOREIGN KEY (udise_code) 
REFERENCES schools(udise_code) 
ON DELETE RESTRICT 
ON UPDATE CASCADE;

-- Step 3: Update Vacancies unique constraint
-- ================================================================================
-- Remove old unique constraint
ALTER TABLE vacancies 
DROP CONSTRAINT IF EXISTS vacancies_district_stream_gender_category_key;

-- Add new unique constraint with UDISE code
ALTER TABLE vacancies 
ADD CONSTRAINT vacancies_udise_stream_gender_category_unique 
UNIQUE(udise_code, stream, gender, category);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vacancies_udise_code ON vacancies(udise_code);
CREATE INDEX IF NOT EXISTS idx_vacancies_district ON vacancies(district);

-- Step 4: Add allotted school UDISE to Students table
-- ================================================================================
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS allotted_school_udise VARCHAR;

-- Add foreign key constraint
ALTER TABLE students 
ADD CONSTRAINT fk_students_allotted_school 
FOREIGN KEY (allotted_school_udise) 
REFERENCES schools(udise_code) 
ON DELETE SET NULL 
ON UPDATE CASCADE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_students_allotted_school_udise ON students(allotted_school_udise);

-- Step 5: Data Migration (Optional - for existing data)
-- ================================================================================
-- If you have existing vacancy data without UDISE codes, you can create placeholder schools
-- Uncomment and modify as needed:

-- INSERT INTO schools (udise_code, school_name, district)
-- SELECT DISTINCT 
--     'DISTRICT_AGGREGATE_' || district AS udise_code,
--     'Aggregated Vacancies - ' || district AS school_name,
--     district
-- FROM vacancies
-- WHERE udise_code IS NULL
-- ON CONFLICT (udise_code) DO NOTHING;

-- UPDATE vacancies
-- SET udise_code = 'DISTRICT_AGGREGATE_' || district
-- WHERE udise_code IS NULL;

-- Step 6: Make UDISE code required in vacancies (after data migration)
-- ================================================================================
-- IMPORTANT: Only run this after you've migrated all existing data
-- Uncomment when ready:

-- ALTER TABLE vacancies 
-- ALTER COLUMN udise_code SET NOT NULL;

-- ================================================================================
-- Migration Complete
-- ================================================================================
-- After running this migration:
-- 1. Update your application code to use UDISE codes
-- 2. Update file upload templates to include UDISE code
-- 3. Update allocation algorithm to work with school-level vacancies
-- 4. Test thoroughly before making udise_code NOT NULL
-- ================================================================================


