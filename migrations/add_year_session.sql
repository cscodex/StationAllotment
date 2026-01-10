-- ================================================================================
-- Migration: Add Year Session Table
-- ================================================================================
-- This migration adds the year_session table to track academic sessions.
-- Session name is auto-calculated from start date (e.g., Apr 2025 → 2025-2026)
-- Only one session can be marked as "current" at a time.
-- ================================================================================

-- Create year_session table
CREATE TABLE IF NOT EXISTS year_session (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name VARCHAR NOT NULL UNIQUE,  -- e.g., "2025-2026"
    start_date DATE NOT NULL,              -- e.g., April 1, 2025
    end_date DATE NOT NULL,                -- e.g., March 31, 2026
    is_current BOOLEAN DEFAULT FALSE,      -- Only one session can be current
    is_active BOOLEAN DEFAULT TRUE,        -- Whether session is active for operations
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique partial index to ensure only one current session
-- This allows multiple FALSE values but only one TRUE value
CREATE UNIQUE INDEX IF NOT EXISTS idx_year_session_current_unique 
    ON year_session(is_current) WHERE is_current = TRUE;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_year_session_session_name ON year_session(session_name);
CREATE INDEX IF NOT EXISTS idx_year_session_active ON year_session(is_active);

-- ================================================================================
-- Insert Current Year Session (2025-2026)
-- ================================================================================
-- Since current date is January 2026, the active session is 2025-2026
-- (April 1, 2025 to March 31, 2026)
INSERT INTO year_session (id, session_name, start_date, end_date, is_current, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '2025-2026',
    '2025-04-01',
    '2026-03-31',
    TRUE,
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (session_name) DO NOTHING;

-- ================================================================================
-- Migration Complete
-- ================================================================================
