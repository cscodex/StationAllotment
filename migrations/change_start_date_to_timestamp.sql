-- ================================================================================
-- Migration: Change start_date from DATE to TIMESTAMP
-- ================================================================================
-- This migration changes the start_date column in counseling_rounds table
-- from DATE type to TIMESTAMP type to support datetime values with time component
-- ================================================================================
-- 
-- IMPORTANT: If you get permission denied errors, you may need to:
-- 1. Run this as a database superuser, OR
-- 2. Grant ALTER TABLE permissions to your database user:
--    GRANT ALTER ON TABLE counseling_rounds TO your_username;
--    OR
--    ALTER USER your_username WITH SUPERUSER;
-- ================================================================================

-- Step 1: Check current column type (for verification)
-- ================================================================================
-- Uncomment to check current type before migration:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'counseling_rounds' AND column_name = 'start_date';

-- Step 2: Alter the start_date column to TIMESTAMP
-- ================================================================================
-- Convert DATE to TIMESTAMP, preserving existing date values
-- Existing dates will be converted to timestamps at midnight (00:00:00)
-- 
-- If you get permission denied, try running as superuser or use the alternative method below
DO $$
BEGIN
    -- Check if column exists and is DATE type
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'counseling_rounds' 
        AND column_name = 'start_date' 
        AND data_type = 'date'
    ) THEN
        -- Perform the conversion
        ALTER TABLE counseling_rounds 
        ALTER COLUMN start_date TYPE TIMESTAMP USING start_date::TIMESTAMP;
        
        RAISE NOTICE 'Successfully changed start_date from DATE to TIMESTAMP';
    ELSE
        -- Check if already TIMESTAMP
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'counseling_rounds' 
            AND column_name = 'start_date' 
            AND data_type = 'timestamp without time zone'
        ) THEN
            RAISE NOTICE 'start_date is already TIMESTAMP type, no migration needed';
        ELSE
            RAISE EXCEPTION 'start_date column not found or has unexpected type';
        END IF;
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'Permission denied. You need ALTER TABLE privileges. Contact your database administrator.';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during migration: %', SQLERRM;
END $$;

-- Alternative Method (if DO block doesn't work):
-- ================================================================================
-- If the above fails, try this direct approach (may require superuser):
-- 
-- ALTER TABLE counseling_rounds 
-- ALTER COLUMN start_date TYPE TIMESTAMP USING start_date::TIMESTAMP;
--
-- Or if you need to preserve timezone:
-- ALTER TABLE counseling_rounds 
-- ALTER COLUMN start_date TYPE TIMESTAMP WITH TIME ZONE USING start_date::TIMESTAMP WITH TIME ZONE;

-- Step 3: Verify the change
-- ================================================================================
-- Uncomment to verify the migration:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_name = 'counseling_rounds' AND column_name = 'start_date';

-- ================================================================================
-- Migration Complete
-- ================================================================================
-- After running this migration:
-- 1. The start_date column will support datetime values with time component
-- 2. Existing date values will be preserved as timestamps at midnight
-- 3. Application code should now use Date objects or ISO timestamp strings
-- ================================================================================

