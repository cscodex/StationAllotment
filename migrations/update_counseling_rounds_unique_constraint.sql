-- ================================================================================
-- Migration: Update Counseling Rounds Unique Constraint
-- ================================================================================
-- This migration updates the unique constraint to support multiple counselings
-- Each counseling (identified by round_name) can have multiple rounds
-- Rounds are numbered starting from 1 within each counseling
-- ================================================================================

-- Step 1: Drop the old unique constraint
-- ================================================================================
ALTER TABLE counseling_rounds 
DROP CONSTRAINT IF EXISTS counseling_rounds_academic_year_round_number_key;

-- Step 2: Make round_name NOT NULL (it's now required)
-- ================================================================================
ALTER TABLE counseling_rounds 
ALTER COLUMN round_name SET NOT NULL;

-- Step 3: Add new unique constraint on (academic_year, round_name, round_number)
-- ================================================================================
ALTER TABLE counseling_rounds 
ADD CONSTRAINT counseling_rounds_academic_year_round_name_round_number_unique 
UNIQUE(academic_year, round_name, round_number);

-- Step 4: Add index on round_name for faster lookups
-- ================================================================================
CREATE INDEX IF NOT EXISTS idx_counseling_rounds_round_name ON counseling_rounds(round_name);


