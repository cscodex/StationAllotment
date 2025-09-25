-- Punjab Seat Allotment System Database Creation Script
-- Execute this script on your Neon database server to create all required tables

-- Enable UUID extension for generating random UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table for session management
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
);

-- Create index on expire column for sessions table
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- Users table for authentication
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

-- Students entrance results table
CREATE TABLE IF NOT EXISTS students_entrance_result (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Students table
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    app_no VARCHAR NOT NULL UNIQUE, -- Application number as first data column
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
    allocation_status VARCHAR DEFAULT 'pending', -- 'pending' | 'allotted' | 'not_allotted'
    is_locked BOOLEAN DEFAULT FALSE, -- Whether preferences are locked for editing
    locked_by VARCHAR, -- User ID of the admin who has exclusive edit lock
    locked_at TIMESTAMP, -- When the student was locked for editing
    is_released BOOLEAN DEFAULT FALSE, -- Whether student is released from district
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Vacancies table
CREATE TABLE IF NOT EXISTS vacancies (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    district VARCHAR NOT NULL,
    stream VARCHAR NOT NULL, -- 'Medical' | 'Commerce' | 'NonMedical'
    gender VARCHAR NOT NULL, -- 'Male' | 'Female' | 'Other'
    category VARCHAR NOT NULL, -- 'Open' | 'WHH' | 'Disabled' | 'Private'
    total_seats INTEGER DEFAULT 0,
    available_seats INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(district, stream, gender, category)
);

-- District status table for tracking finalization
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

-- Settings table for system configuration
CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs table for compliance tracking
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

-- File uploads table
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
    created_at TIMESTAMP DEFAULT NOW()
);

-- Unlock requests table for district admin unlock requests
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

-- Insert initial system settings
INSERT INTO settings (key, value, description) 
VALUES 
    ('allocation_enabled', 'false', 'Whether seat allocation is currently enabled'),
    ('counseling_start_date', '', 'Start date for counseling process'),
    ('counseling_end_date', '', 'End date for counseling process'),
    ('system_message', '', 'System-wide message to display to users')
ON CONFLICT (key) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_merit_number ON students (merit_number);
CREATE INDEX IF NOT EXISTS idx_students_counseling_district ON students (counseling_district);
CREATE INDEX IF NOT EXISTS idx_students_allocation_status ON students (allocation_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_file_uploads_type ON file_uploads (type);
CREATE INDEX IF NOT EXISTS idx_unlock_requests_status ON unlock_requests (status);

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_username;

-- Database creation completed successfully
-- You can now run your application with this database structure