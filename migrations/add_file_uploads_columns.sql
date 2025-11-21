-- ================================================================================
-- Migration: Add academic_year and counseling_round_id to file_uploads
-- ================================================================================
-- This migration adds missing columns to file_uploads table that are expected
-- by the application schema
-- ================================================================================

-- Add academic_year column
ALTER TABLE file_uploads 
ADD COLUMN IF NOT EXISTS academic_year VARCHAR;

-- Add counseling_round_id column with foreign key
ALTER TABLE file_uploads 
ADD COLUMN IF NOT EXISTS counseling_round_id VARCHAR REFERENCES counseling_rounds(id) ON DELETE SET NULL;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_file_uploads_academic_year ON file_uploads(academic_year);
CREATE INDEX IF NOT EXISTS idx_file_uploads_counseling_round_id ON file_uploads(counseling_round_id);

