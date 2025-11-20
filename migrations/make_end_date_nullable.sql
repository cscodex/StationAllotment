-- ================================================================================
-- Migration: Make end_date nullable in counseling_rounds
-- ================================================================================
-- This migration makes end_date nullable to match the application schema
-- where endDate is optional (rounds are completed manually)
-- ================================================================================

-- Make end_date nullable
ALTER TABLE counseling_rounds 
ALTER COLUMN end_date DROP NOT NULL;

