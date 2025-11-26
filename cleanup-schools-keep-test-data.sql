-- ================================================================================
-- SQL Script: Remove all schools except those in vacancy test data
-- ================================================================================
-- This script will:
-- 1. Delete all vacancies that reference schools NOT in the test data list
-- 2. Delete all schools that are NOT in the test data list
-- 3. Insert/update the test data schools
-- ================================================================================

-- Step 1: Delete vacancies that reference schools NOT in the test data UDISE codes
-- ================================================================================
DELETE FROM vacancies
WHERE udise_code IS NOT NULL
  AND udise_code NOT IN (
    '03010100001', -- Amritsar
    '03020100002', -- Bathinda
    '03030100003', -- Ferozepur
    '03040100004', -- Gurdaspur
    '03050100005', -- Jalandhar
    '03090508916', -- Ludhiana
    '03070100007', -- Patiala
    '03090100009', -- SAS Nagar
    '03100100010', -- Sangrur
    '03110100011'  -- Talwara
  );

-- Step 2: Update students' allotted_school_udise to NULL if they reference deleted schools
-- ================================================================================
UPDATE students
SET allotted_school_udise = NULL
WHERE allotted_school_udise IS NOT NULL
  AND allotted_school_udise NOT IN (
    '03010100001', -- Amritsar
    '03020100002', -- Bathinda
    '03030100003', -- Ferozepur
    '03040100004', -- Gurdaspur
    '03050100005', -- Jalandhar
    '03090508916', -- Ludhiana
    '03070100007', -- Patiala
    '03090100009', -- SAS Nagar
    '03100100010', -- Sangrur
    '03110100011'  -- Talwara
  );

-- Step 3: Delete all schools that are NOT in the test data list
-- ================================================================================
DELETE FROM schools
WHERE udise_code NOT IN (
  '03010100001', -- Amritsar
  '03020100002', -- Bathinda
  '03030100003', -- Ferozepur
  '03040100004', -- Gurdaspur
  '03050100005', -- Jalandhar
  '03090508916', -- Ludhiana
  '03070100007', -- Patiala
  '03090100009', -- SAS Nagar
  '03100100010', -- Sangrur
  '03110100011'  -- Talwara
);

-- Step 4: Insert/update test data schools (ensures they exist)
-- ================================================================================
INSERT INTO schools (udise_code, school_name, district, created_at, updated_at)
VALUES
  ('03010100001', 'Government Senior Secondary School, Amritsar', 'Amritsar', NOW(), NOW()),
  ('03020100002', 'Government Senior Secondary School, Bathinda', 'Bathinda', NOW(), NOW()),
  ('03030100003', 'Government Senior Secondary School, Ferozepur', 'Ferozepur', NOW(), NOW()),
  ('03040100004', 'Government Senior Secondary School, Gurdaspur', 'Gurdaspur', NOW(), NOW()),
  ('03050100005', 'Government Senior Secondary School, Jalandhar', 'Jalandhar', NOW(), NOW()),
  ('03090508916', 'Government Senior Secondary School, Ludhiana', 'Ludhiana', NOW(), NOW()),
  ('03070100007', 'Government Senior Secondary School, Patiala', 'Patiala', NOW(), NOW()),
  ('03090100009', 'Government Senior Secondary School, SAS Nagar', 'SAS Nagar', NOW(), NOW()),
  ('03100100010', 'Government Senior Secondary School, Sangrur', 'Sangrur', NOW(), NOW()),
  ('03110100011', 'Government Senior Secondary School, Talwara', 'Talwara', NOW(), NOW())
ON CONFLICT (udise_code) 
DO UPDATE SET
  school_name = EXCLUDED.school_name,
  district = EXCLUDED.district,
  updated_at = NOW();

-- Step 5: Verify the cleanup
-- ================================================================================
SELECT 
  'Total schools remaining' AS description,
  COUNT(*) AS count
FROM schools;

SELECT 
  udise_code,
  school_name,
  district
FROM schools
ORDER BY district;

