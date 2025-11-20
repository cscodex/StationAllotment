-- ================================================================================
-- Migration: Add roundName to Entrance Results and Vacancies
-- ================================================================================
-- This migration adds roundName (counseling title) to entrance results and vacancies
-- so they can be shared across all rounds of the same counseling title
-- ================================================================================

-- Step 1: Add round_name to students_entrance_result
-- ================================================================================
ALTER TABLE students_entrance_result 
ADD COLUMN IF NOT EXISTS round_name VARCHAR;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_students_entrance_result_round_name ON students_entrance_result(round_name);

-- Step 2: Add round_name to vacancies
-- ================================================================================
ALTER TABLE vacancies 
ADD COLUMN IF NOT EXISTS round_name VARCHAR;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vacancies_round_name ON vacancies(round_name);

-- Step 3: Update unique constraint on vacancies to include round_name
-- ================================================================================
-- Drop old constraint
ALTER TABLE vacancies 
DROP CONSTRAINT IF EXISTS vacancies_academic_year_udise_stream_gender_category_unique;

-- Add new constraint with round_name
ALTER TABLE vacancies 
ADD CONSTRAINT vacancies_academic_year_round_name_udise_stream_gender_category_unique 
UNIQUE(academic_year, round_name, udise_code, stream, gender, category);

-- Note: round_name can be NULL for backward compatibility with existing data
-- When round_name is NULL, it means the data is not linked to a specific counseling title

