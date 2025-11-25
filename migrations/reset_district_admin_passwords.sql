-- ================================================================================
-- Migration: Reset All District Admin Passwords to "Password123"
-- ================================================================================
-- This migration sets the password "Password123" for all district admin users
-- Password is bcrypt hashed with 10 salt rounds
-- 
-- IMPORTANT: 
-- - This will update ALL users with role 'district_admin'
-- - The password hash is: $2b$10$EVOrYy7RSRbA8MuBkbl.fOBJzxNwJbG5qvu9K8EGOAfTWBa7DKZCa
-- - All district admins will be able to login with: Password123
-- - They should change their password after first login
-- ================================================================================

-- Update all district admin passwords
UPDATE users 
SET 
  password = '$2b$10$EVOrYy7RSRbA8MuBkbl.fOBJzxNwJbG5qvu9K8EGOAfTWBa7DKZCa',
  updated_at = NOW()
WHERE role = 'district_admin';

-- Verify the update
-- Uncomment the following to see how many district admins were updated:
-- SELECT 
--   username, 
--   email, 
--   district, 
--   role,
--   updated_at
-- FROM users 
-- WHERE role = 'district_admin'
-- ORDER BY district;

-- ================================================================================
-- Summary:
-- - Password: Password123
-- - Hash: $2b$10$EVOrYy7RSRbA8MuBkbl.fOBJzxNwJbG5qvu9K8EGOAfTWBa7DKZCa
-- - All district admins can now login with this password
-- ================================================================================

