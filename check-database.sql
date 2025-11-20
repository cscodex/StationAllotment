-- Check Counseling Rounds in Database
-- Run this to verify the counseling system is working

-- 1. Check all counseling rounds
SELECT 
    id,
    academic_year,
    round_name,
    round_number,
    start_date,
    end_date,
    is_active,
    is_completed,
    created_at
FROM counseling_rounds
ORDER BY academic_year, round_name, round_number;

-- 2. Check rounds for specific academic year
SELECT 
    round_name AS "Counseling Title",
    round_number AS "Round No.",
    start_date AS "Start Date",
    end_date AS "End Date",
    CASE 
        WHEN is_active THEN 'Active'
        WHEN is_completed THEN 'Completed'
        ELSE 'Inactive'
    END AS "Status",
    created_at AS "Created At"
FROM counseling_rounds
WHERE academic_year = '2024-2025'
ORDER BY round_name, round_number;

-- 3. Count rounds per counseling
SELECT 
    academic_year,
    round_name,
    COUNT(*) AS total_rounds,
    SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_rounds,
    SUM(CASE WHEN is_completed THEN 1 ELSE 0 END) AS completed_rounds
FROM counseling_rounds
GROUP BY academic_year, round_name
ORDER BY academic_year, round_name;

-- 4. Check students associated with rounds
SELECT 
    cr.round_name,
    cr.round_number,
    COUNT(s.id) AS students_count
FROM counseling_rounds cr
LEFT JOIN students s ON s.counseling_round_id = cr.id
GROUP BY cr.id, cr.round_name, cr.round_number
ORDER BY cr.academic_year, cr.round_name, cr.round_number;

-- 5. Check unique constraint (should show no duplicates)
SELECT 
    academic_year,
    round_name,
    round_number,
    COUNT(*) AS count
FROM counseling_rounds
GROUP BY academic_year, round_name, round_number
HAVING COUNT(*) > 1;

