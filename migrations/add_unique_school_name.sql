-- ================================================================================
-- Migration: Add Unique Constraint on School Name
-- ================================================================================
-- This migration adds a unique constraint on school_name column in the schools table
-- to ensure that both UDISE code and school name are unique
-- ================================================================================

-- Add unique constraint on school_name
-- First, check if there are any duplicate school names and handle them
-- (This will fail if duplicates exist - you'll need to clean them up first)

ALTER TABLE schools 
ADD CONSTRAINT schools_school_name_unique UNIQUE (school_name);

-- Verify the constraint
SELECT 
    constraint_name, 
    constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'schools' 
AND constraint_type = 'UNIQUE';



