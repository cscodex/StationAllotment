-- ================================================================================
-- Punjab Seat Allotment System - Complete Database Schema
-- ================================================================================
-- This consolidated schema includes all tables, indexes, and constraints
-- needed for the Station Allotment application.
-- 
-- USAGE:
-- 1. Execute this file against your Neon PostgreSQL database
-- 2. Then run data.sql to seed initial data
--
-- NOTES:
-- - Uses IF NOT EXISTS and ON CONFLICT patterns for idempotency
-- - Safe to re-run without causing errors
-- ================================================================================

-- Enable UUID extension for generating random UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================================
-- Sessions Table (for session management)
-- ================================================================================
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- ================================================================================
-- Users Table (for authentication)
-- ================================================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR NOT NULL UNIQUE,
    email VARCHAR,
    password TEXT NOT NULL,
    role VARCHAR NOT NULL, -- 'central_admin' | 'district_admin'
    district VARCHAR, -- null for central_admin
    first_name VARCHAR,
    last_name VARCHAR,
    profile_image_url VARCHAR,
    credentials JSONB, -- Store credentials data from credentials.json
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================================
-- Counseling Rounds Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS counseling_rounds (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year VARCHAR NOT NULL,
    round_number INTEGER NOT NULL,
    round_name VARCHAR NOT NULL, -- Counseling title (e.g., 'First Counseling', 'Second Counseling')
    start_date TIMESTAMP NOT NULL, -- Changed from DATE to TIMESTAMP for datetime support
    end_date DATE, -- Nullable - rounds are completed manually
    is_active BOOLEAN DEFAULT FALSE,
    is_completed BOOLEAN DEFAULT FALSE,
    is_suspended BOOLEAN DEFAULT FALSE, -- Whether subsequent rounds are suspended
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(academic_year, round_name, round_number) -- Multiple counselings, each with multiple rounds
);

CREATE INDEX IF NOT EXISTS idx_counseling_rounds_academic_year ON counseling_rounds(academic_year);
CREATE INDEX IF NOT EXISTS idx_counseling_rounds_round_name ON counseling_rounds(round_name);
CREATE INDEX IF NOT EXISTS idx_counseling_rounds_active ON counseling_rounds(is_active);

-- ================================================================================
-- Students Entrance Results Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS students_entrance_result (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year VARCHAR,
    round_name VARCHAR, -- Counseling title for data sharing
    merit_no INTEGER NOT NULL UNIQUE,
    application_no VARCHAR NOT NULL UNIQUE,
    roll_no VARCHAR NOT NULL UNIQUE,
    student_name VARCHAR NOT NULL,
    marks INTEGER NOT NULL,
    gender VARCHAR NOT NULL, -- 'Male' | 'Female' | 'Other'
    category VARCHAR NOT NULL, -- 'Open' | 'WHH' | 'Disabled' | 'Private'
    stream VARCHAR, -- 'Medical' | 'Commerce' | 'NonMedical' - optional field
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_entrance_result_academic_year ON students_entrance_result(academic_year);
CREATE INDEX IF NOT EXISTS idx_students_entrance_result_round_name ON students_entrance_result(round_name);

-- ================================================================================
-- Schools Table (UDISE code and school name mapping)
-- ================================================================================
CREATE TABLE IF NOT EXISTS schools (
    udise_code VARCHAR PRIMARY KEY,
    school_name VARCHAR NOT NULL,
    district VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_district ON schools(district);

-- ================================================================================
-- Students Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year VARCHAR,
    app_no VARCHAR NOT NULL UNIQUE, -- Application number
    merit_number INTEGER NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    gender VARCHAR NOT NULL, -- 'Male' | 'Female' | 'Other'
    category VARCHAR NOT NULL, -- 'Open' | 'WHH' | 'Disabled' | 'Private'
    stream VARCHAR NOT NULL, -- 'Medical' | 'Commerce' | 'NonMedical'
    choice1 VARCHAR,
    choice2 VARCHAR,
    choice3 VARCHAR,
    choice4 VARCHAR,
    choice5 VARCHAR,
    choice6 VARCHAR,
    choice7 VARCHAR,
    choice8 VARCHAR,
    choice9 VARCHAR,
    choice10 VARCHAR,
    counseling_district VARCHAR, -- District where counseling was done
    district_admin VARCHAR, -- Name of the district admin who set preferences
    allotted_district VARCHAR,
    allotted_stream VARCHAR,
    allotted_school_udise VARCHAR REFERENCES schools(udise_code) ON DELETE SET NULL ON UPDATE CASCADE,
    counseling_round_id VARCHAR REFERENCES counseling_rounds(id) ON DELETE SET NULL ON UPDATE CASCADE,
    counseling_round_number INTEGER,
    preferences_updated_at TIMESTAMP,
    allocation_status VARCHAR DEFAULT 'pending', -- 'pending' | 'allotted' | 'not_allotted'
    is_locked BOOLEAN DEFAULT FALSE,
    locked_by VARCHAR,
    locked_at TIMESTAMP,
    is_released BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_allotted_school_udise ON students(allotted_school_udise);
CREATE INDEX IF NOT EXISTS idx_students_academic_year ON students(academic_year);
CREATE INDEX IF NOT EXISTS idx_students_counseling_round_id ON students(counseling_round_id);
CREATE INDEX IF NOT EXISTS idx_students_counseling_round_number ON students(counseling_round_number);
CREATE INDEX IF NOT EXISTS idx_students_merit_number ON students(merit_number);
CREATE INDEX IF NOT EXISTS idx_students_counseling_district ON students(counseling_district);
CREATE INDEX IF NOT EXISTS idx_students_allocation_status ON students(allocation_status);

-- ================================================================================
-- Vacancies Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS vacancies (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year VARCHAR,
    round_name VARCHAR, -- Counseling title for data sharing
    udise_code VARCHAR REFERENCES schools(udise_code) ON DELETE RESTRICT ON UPDATE CASCADE,
    district VARCHAR NOT NULL,
    stream VARCHAR NOT NULL, -- 'Medical' | 'Commerce' | 'NonMedical'
    gender VARCHAR NOT NULL, -- 'Male' | 'Female' | 'Other'
    category VARCHAR NOT NULL, -- 'Open' | 'WHH' | 'Disabled' | 'Private'
    total_seats INTEGER DEFAULT 0,
    available_seats INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(academic_year, round_name, udise_code, stream, gender, category)
);

CREATE INDEX IF NOT EXISTS idx_vacancies_udise_code ON vacancies(udise_code);
CREATE INDEX IF NOT EXISTS idx_vacancies_district ON vacancies(district);
CREATE INDEX IF NOT EXISTS idx_vacancies_academic_year ON vacancies(academic_year);
CREATE INDEX IF NOT EXISTS idx_vacancies_round_name ON vacancies(round_name);

-- ================================================================================
-- District Status Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS district_status (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    district VARCHAR NOT NULL UNIQUE,
    is_finalized BOOLEAN DEFAULT FALSE,
    total_students INTEGER DEFAULT 0,
    locked_students INTEGER DEFAULT 0,
    students_with_choices INTEGER DEFAULT 0,
    finalized_by VARCHAR REFERENCES users(id),
    finalized_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================================
-- Settings Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================================
-- Audit Logs Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR REFERENCES users(id),
    action VARCHAR NOT NULL,
    resource VARCHAR NOT NULL,
    resource_id VARCHAR,
    details JSONB,
    ip_address VARCHAR,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- ================================================================================
-- File Uploads Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS file_uploads (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR NOT NULL,
    original_name VARCHAR NOT NULL,
    mime_type VARCHAR NOT NULL,
    size INTEGER NOT NULL,
    type VARCHAR NOT NULL, -- 'student_choices' | 'vacancies'
    status VARCHAR DEFAULT 'uploaded', -- 'uploaded' | 'validated' | 'processed' | 'failed'
    validation_results JSONB,
    uploaded_by VARCHAR REFERENCES users(id),
    academic_year VARCHAR,
    counseling_round_id VARCHAR REFERENCES counseling_rounds(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_type ON file_uploads(type);
CREATE INDEX IF NOT EXISTS idx_file_uploads_academic_year ON file_uploads(academic_year);
CREATE INDEX IF NOT EXISTS idx_file_uploads_counseling_round_id ON file_uploads(counseling_round_id);

-- ================================================================================
-- Unlock Requests Table
-- ================================================================================
CREATE TABLE IF NOT EXISTS unlock_requests (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR REFERENCES students(id) NOT NULL,
    requested_by VARCHAR REFERENCES users(id) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    reviewed_by VARCHAR REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_comments TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unlock_requests_status ON unlock_requests(status);

-- ================================================================================
-- Year Session Table
-- ================================================================================
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_year_session_current_unique 
    ON year_session(is_current) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_year_session_session_name ON year_session(session_name);
CREATE INDEX IF NOT EXISTS idx_year_session_active ON year_session(is_active);

-- ================================================================================
-- Schema Creation Complete
-- ================================================================================
