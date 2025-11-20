/**
 * Session Utilities
 * 
 * Session is defined as April of current year to March of next year.
 * Example: Session 2024-2025 runs from April 1, 2024 to March 31, 2025
 */

/**
 * Get the current session based on today's date
 * Session runs from April 1 to March 31 of next year
 * @returns Current session in format "YYYY-YYYY" (e.g., "2024-2025")
 */
export function getCurrentSession(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12 (Jan = 1, Dec = 12)
  
  // If we're in April (4) or later, current session is currentYear-nextYear
  // If we're in Jan-Mar (1-3), current session is (currentYear-1)-currentYear
  if (currentMonth >= 4) {
    // April to December: Session is currentYear-nextYear
    return `${currentYear}-${currentYear + 1}`;
  } else {
    // January to March: Session is (currentYear-1)-currentYear
    return `${currentYear - 1}-${currentYear}`;
  }
}

/**
 * Get the session for a given date
 * @param date - Date to check
 * @returns Session in format "YYYY-YYYY"
 */
export function getSessionForDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  
  if (month >= 4) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Parse academic year string to extract start and end years
 * @param academicYear - Academic year in format "YYYY-YYYY"
 * @returns Object with startYear and endYear, or null if invalid
 */
export function parseAcademicYear(academicYear: string): { startYear: number; endYear: number } | null {
  const match = academicYear.match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  
  const startYear = parseInt(match[1], 10);
  const endYear = parseInt(match[2], 10);
  
  // Validate: endYear should be startYear + 1
  if (endYear !== startYear + 1) return null;
  
  return { startYear, endYear };
}

/**
 * Check if an academic year is the current session
 * @param academicYear - Academic year in format "YYYY-YYYY"
 * @returns true if the academic year matches the current session
 */
export function isCurrentSession(academicYear: string): boolean {
  const currentSession = getCurrentSession();
  return academicYear === currentSession;
}

/**
 * Check if an academic year is a previous session
 * @param academicYear - Academic year in format "YYYY-YYYY"
 * @returns true if the academic year is before the current session
 */
export function isPreviousSession(academicYear: string): boolean {
  const currentSession = getCurrentSession();
  const current = parseAcademicYear(currentSession);
  const check = parseAcademicYear(academicYear);
  
  if (!current || !check) return false;
  
  return check.startYear < current.startYear;
}

/**
 * Check if an academic year is a future session
 * @param academicYear - Academic year in format "YYYY-YYYY"
 * @returns true if the academic year is after the current session
 */
export function isFutureSession(academicYear: string): boolean {
  const currentSession = getCurrentSession();
  const current = parseAcademicYear(currentSession);
  const check = parseAcademicYear(academicYear);
  
  if (!current || !check) return false;
  
  return check.startYear > current.startYear;
}

/**
 * Get the start date of a session (April 1 of start year)
 * @param academicYear - Academic year in format "YYYY-YYYY"
 * @returns Date object for April 1 of the start year
 */
export function getSessionStartDate(academicYear: string): Date | null {
  const parsed = parseAcademicYear(academicYear);
  if (!parsed) return null;
  
  return new Date(parsed.startYear, 3, 1); // Month 3 = April (0-indexed)
}

/**
 * Get the end date of a session (March 31 of end year)
 * @param academicYear - Academic year in format "YYYY-YYYY"
 * @returns Date object for March 31 of the end year
 */
export function getSessionEndDate(academicYear: string): Date | null {
  const parsed = parseAcademicYear(academicYear);
  if (!parsed) return null;
  
  return new Date(parsed.endYear, 2, 31); // Month 2 = March (0-indexed), day 31
}

/**
 * Validate that a date falls within a session
 * @param date - Date to check
 * @param academicYear - Academic year in format "YYYY-YYYY"
 * @returns true if the date is within the session
 */
export function isDateInSession(date: Date, academicYear: string): boolean {
  const parsed = parseAcademicYear(academicYear);
  if (!parsed) return false;
  
  const sessionStart = new Date(parsed.startYear, 3, 1); // April 1
  const sessionEnd = new Date(parsed.endYear, 2, 31, 23, 59, 59, 999); // March 31, end of day
  
  return date >= sessionStart && date <= sessionEnd;
}


