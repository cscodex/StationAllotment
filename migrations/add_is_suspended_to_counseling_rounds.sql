-- Add is_suspended column to counseling_rounds table
-- This column controls whether subsequent rounds should be auto-created for a counseling title

ALTER TABLE counseling_rounds
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;

-- Update existing rows to have is_suspended = false
UPDATE counseling_rounds
SET is_suspended = false
WHERE is_suspended IS NULL;

-- Add comment to explain the column
COMMENT ON COLUMN counseling_rounds.is_suspended IS 'Whether subsequent rounds are suspended for this counseling title. When true, no new rounds will be auto-created even if seats are available.';


