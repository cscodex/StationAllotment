-- SQL script to insert test data schools with UDISE codes
-- These match the UDISE codes used in the test data file generation

-- Insert schools for test data (using ON CONFLICT to handle duplicates)
-- Both udise_code and school_name are unique, so we handle conflicts on both
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

-- Verify the insert
SELECT udise_code, school_name, district FROM schools ORDER BY district;

