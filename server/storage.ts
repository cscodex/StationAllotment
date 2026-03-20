import {
  users,
  students,
  studentsEntranceResult,
  vacancies,
  schools,
  counselingRounds,
  settings,
  auditLogs,
  fileUploads,
  districtStatus,
  unlockRequests,
  yearSession,
  unfinalizeRequests,
  type User,
  type InsertUser,
  type Student,
  type InsertStudent,
  type StudentsEntranceResult,
  type InsertStudentsEntranceResult,
  type Vacancy,
  type InsertVacancy,
  type School,
  type InsertSchool,
  type CounselingRound,
  type InsertCounselingRound,
  type Setting,
  type InsertSetting,
  type AuditLog,
  type InsertAuditLog,
  type FileUpload,
  type InsertFileUpload,
  type DistrictStatus,
  type InsertDistrictStatus,
  type UnlockRequest,
  type InsertUnlockRequest,
  type UnfinalizeRequest,
  type InsertUnfinalizeRequest,
  type YearSession,
  type InsertYearSession,
  type AppDocument,
  type InsertAppDocument,
} from "@shared/schema";
import { db } from "./db";
import { appDocuments } from "@shared/schema";
import { eq, desc, and, asc, sql, or, ilike, isNull, isNotNull } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Student operations
  getStudents(limit?: number, offset?: number, academicYear?: string, roundNumber?: number, districtAdminUsername?: string, excludeUnassigned?: boolean): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  getStudentByMeritNumber(meritNumber: number): Promise<Student | undefined>;
  getStudentsByYearAndRound(academicYear: string, roundNumber: number): Promise<Student[]>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student>;
  bulkCreateStudents(students: InsertStudent[], onProgress?: (processed: number, total: number) => void): Promise<Student[]>;
  deleteAllStudents(): Promise<void>;
  getStudentsCount(academicYear?: string, districtAdminUsername?: string, excludeUnassigned?: boolean): Promise<number>;
  getStudentsByStatus(status: string, academicYear?: string): Promise<Student[]>;

  // Students entrance result operations
  getStudentsEntranceResults(limit?: number, offset?: number): Promise<StudentsEntranceResult[]>;
  getStudentsEntranceResult(id: string): Promise<StudentsEntranceResult | undefined>;
  getStudentsEntranceResultByMeritNumber(meritNumber: number): Promise<StudentsEntranceResult | undefined>;
  getStudentsEntranceResultsCount(): Promise<number>;
  getStudentsEntranceResultsByRound(academicYear: string, roundName: string): Promise<StudentsEntranceResult[]>;
  searchStudentsEntranceResults(query: string): Promise<StudentsEntranceResult[]>;
  createStudentsEntranceResult(result: InsertStudentsEntranceResult): Promise<StudentsEntranceResult>;
  bulkCreateStudentsEntranceResults(results: InsertStudentsEntranceResult[], onProgress?: (processed: number, total: number) => void): Promise<StudentsEntranceResult[]>;
  updateStudentPreferences(studentId: string, preferences: {
    choice1?: string; choice2?: string; choice3?: string; choice4?: string; choice5?: string;
    choice6?: string; choice7?: string; choice8?: string; choice9?: string; choice10?: string;
    counselingDistrict?: string; districtAdmin?: string;
    counselingRoundId?: string;
    counselingRoundNumber?: number;
    preferencesUpdatedAt?: Date;
  }): Promise<Student>;
  checkStudentDistrictConflict(studentId: string, newDistrict: string): Promise<{ hasConflict: boolean, currentDistrict?: string }>;
  releaseAssignment(studentId: string): Promise<Student>;

  // School operations
  getSchool(udiseCode: string): Promise<School | undefined>;
  getSchoolByName(schoolName: string): Promise<School | undefined>;
  getAllSchools(): Promise<School[]>;
  getSchoolsByDistrict(district: string): Promise<School[]>;
  createSchool(school: InsertSchool): Promise<School>;
  bulkUpsertSchools(schools: InsertSchool[]): Promise<School[]>;

  // Counseling round operations
  getCounselingRounds(academicYear?: string): Promise<CounselingRound[]>;
  getCounselingRound(id: string): Promise<CounselingRound | undefined>;
  getActiveCounselingRound(academicYear?: string): Promise<CounselingRound | undefined>;
  createCounselingRound(round: InsertCounselingRound): Promise<CounselingRound>;
  bulkCreateCounselingRounds(rounds: InsertCounselingRound[]): Promise<CounselingRound[]>;
  updateCounselingRound(id: string, updates: Partial<CounselingRound>): Promise<CounselingRound>;
  deleteCounselingRound(id: string): Promise<void>;
  activateCounselingRound(id: string, academicYear: string): Promise<CounselingRound>;
  completeCounselingRound(id: string): Promise<CounselingRound>;
  getStudentsByCounselingRound(counselingRoundId: string): Promise<Student[]>;

  // Vacancy operations
  getVacancies(academicYear?: string, roundName?: string): Promise<Vacancy[]>;
  getVacancyByDistrict(district: string, academicYear?: string, roundName?: string): Promise<Vacancy | undefined>;
  getVacanciesByUdiseCode(udiseCode: string, academicYear?: string, roundName?: string): Promise<Vacancy[]>;
  getVacanciesByYear(academicYear: string, roundName?: string): Promise<Vacancy[]>;
  createVacancy(vacancy: InsertVacancy): Promise<Vacancy>;
  checkIfAllSeatsFilled(academicYear: string, roundName: string): Promise<boolean>;
  checkVacancyAvailability(academicYear: string, roundName: string): Promise<{
    hasVacancies: boolean;
    totalAvailableSeats: number;
    vacancyCount: number;
  }>;
  getPrerequisitesStatus(academicYear: string, roundName: string): Promise<{
    hasVacancyData: boolean;
    vacancyCount: number;
    totalAvailableSeats: number;
    hasEntranceResults: boolean;
    entranceResultsCount: number;
    hasStudentChoices: boolean;
    studentsWithChoicesCount: number;
    allPrerequisitesMet: boolean;
  }>;
  resetAllocation(academicYear: string, roundName: string): Promise<void>;
  updateVacancy(id: string, vacancy: Partial<InsertVacancy>): Promise<Vacancy>;
  bulkUpsertVacancies(vacancies: InsertVacancy[], onProgress?: (processed: number, total: number) => void): Promise<Vacancy[]>;
  deleteAllVacancies(): Promise<void>;

  // Settings operations
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(setting: InsertSetting): Promise<Setting>;
  getSettings(): Promise<Setting[]>;

  // Audit log operations
  createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number, offset?: number): Promise<AuditLog[]>;
  getAuditLogsByUser(userId: string, limit?: number): Promise<AuditLog[]>;

  // File upload operations
  createFileUpload(fileUpload: InsertFileUpload): Promise<FileUpload>;
  getFileUploads(limit?: number): Promise<FileUpload[]>;
  updateFileUpload(id: string, fileUpload: Partial<InsertFileUpload>): Promise<FileUpload>;
  getFileUploadsByType(type: string): Promise<FileUpload[]>;

  // App Document operations (for PDFs like counseling flow)
  getAppDocument(name: string): Promise<AppDocument | undefined>;
  saveAppDocument(doc: InsertAppDocument): Promise<AppDocument>;

  // District status operations
  getDistrictStatus(district: string, counselingRoundId?: string): Promise<DistrictStatus | undefined>;
  getAllDistrictStatuses(counselingRoundId?: string): Promise<DistrictStatus[]>;
  createOrUpdateDistrictStatus(status: InsertDistrictStatus): Promise<DistrictStatus>;
  finalizeDistrict(district: string, userId: string, counselingRoundId?: string): Promise<DistrictStatus>;
  unfinalizeDistrict(district: string): Promise<DistrictStatus | undefined>;

  // Student locking operations
  lockStudent(studentId: string, userId: string): Promise<Student>;
  unlockStudent(studentId: string): Promise<Student>;
  canEditStudent(studentId: string, userId: string): Promise<boolean>;
  lockStudentForEdit(studentId: string, userId: string): Promise<{ success: boolean; message: string; student?: Student }>;
  getStudentsByDistrict(district: string, limit?: number, offset?: number): Promise<{ students: Student[], total: number }>;
  autoLoadEntranceStudents(district: string): Promise<{ loaded: number; skipped: number }>;
  releaseStudentFromDistrict(studentId: string): Promise<Student>;
  fetchStudentToDistrict(studentId: string, counselingDistrict: string, districtAdmin: string): Promise<Student>;

  // Unlock request operations
  createUnlockRequest(request: InsertUnlockRequest): Promise<UnlockRequest>;
  getUnlockRequests(): Promise<UnlockRequest[]>;
  getUnlockRequestsByDistrict(district: string): Promise<UnlockRequest[]>;
  updateUnlockRequest(id: string, updates: Partial<UnlockRequest>): Promise<UnlockRequest>;
  getPendingUnlockRequests(): Promise<UnlockRequest[]>;

  // Unfinalize request operations
  createUnfinalizeRequest(request: InsertUnfinalizeRequest): Promise<UnfinalizeRequest>;
  getUnfinalizeRequests(): Promise<UnfinalizeRequest[]>;
  getUnfinalizeRequestsByDistrict(district: string): Promise<UnfinalizeRequest[]>;
  updateUnfinalizeRequest(id: string, updates: Partial<UnfinalizeRequest>): Promise<UnfinalizeRequest>;
  getPendingUnfinalizeRequests(): Promise<UnfinalizeRequest[]>;

  // Statistics
  getDashboardStats(): Promise<{
    totalStudents: number;
    totalVacancies: number;
    pendingAllocations: number;
    completionRate: number;
  }>;

  // Year Session operations
  getYearSessions(): Promise<YearSession[]>;
  getYearSession(id: string): Promise<YearSession | undefined>;
  getCurrentYearSession(): Promise<YearSession | undefined>;
  getYearSessionByName(sessionName: string): Promise<YearSession | undefined>;
  createYearSession(session: InsertYearSession): Promise<YearSession>;
  updateYearSession(id: string, updates: Partial<InsertYearSession>): Promise<YearSession>;
  setCurrentYearSession(id: string): Promise<YearSession>;

  // Database Health
  pingDatabase(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Database Health
  async pingDatabase(): Promise<void> {
    await db.execute(sql`SELECT 1`);
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(asc(users.username));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ ...insertUser, updatedAt: new Date() })
      .returning();
    return user;
  }

  async updateUser(id: string, insertUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...insertUser, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Student operations
  async getStudents(limit?: number, offset?: number, academicYear?: string, roundNumber?: number, districtAdminUsername?: string, excludeUnassigned: boolean = false): Promise<Student[]> {
    const conditions = [];
    if (academicYear) {
      conditions.push(eq(students.academicYear, academicYear));
    }
    if (roundNumber !== undefined) {
      conditions.push(eq(students.counselingRoundNumber, roundNumber));
    }
    if (districtAdminUsername) {
      if (excludeUnassigned) {
        conditions.push(eq(students.districtAdmin, districtAdminUsername));
      } else {
        conditions.push(
          or(
            isNull(students.districtAdmin),
            eq(students.districtAdmin, districtAdminUsername)
          )
        );
      }
    }

    const query = db.select().from(students);

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    return query
      .orderBy(asc(students.meritNumber))
      .limit(limit || 50)
      .offset(offset || 0);
  }

  async getStudentsByYearAndRound(academicYear: string, roundNumber: number): Promise<Student[]> {
    return db.select().from(students)
      .where(and(
        eq(students.academicYear, academicYear),
        eq(students.counselingRoundNumber, roundNumber)
      ))
      .orderBy(asc(students.meritNumber));
  }

  async getStudent(id: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student;
  }

  async getStudentByMeritNumber(meritNumber: number): Promise<Student | undefined> {
    const [student] = await db.select().from(students)
      .where(eq(students.meritNumber, meritNumber));
    return student;
  }

  async createStudent(student: InsertStudent): Promise<Student> {
    const [created] = await db
      .insert(students)
      .values({ ...student, updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({ ...student, updatedAt: new Date() })
      .where(eq(students.id, id))
      .returning();
    return updated;
  }

  async bulkCreateStudents(studentsList: InsertStudent[], onProgress?: (processed: number, total: number) => void): Promise<Student[]> {
    const results = [];
    const total = studentsList.length;
    const BATCH_SIZE = 50; // Process in batches of 50

    for (let i = 0; i < studentsList.length; i += BATCH_SIZE) {
      const batch = studentsList.slice(i, i + BATCH_SIZE);
      for (const student of batch) {
        const [result] = await db
          .insert(students)
          .values({ ...student, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [students.appNo], // Use appNo as unique identifier
            set: {
              name: student.name,
              meritNumber: student.meritNumber,
              gender: student.gender,
              category: student.category,
              stream: student.stream,
              choice1: student.choice1,
              choice2: student.choice2,
              choice3: student.choice3,
              choice4: student.choice4,
              choice5: student.choice5,
              choice6: student.choice6,
              choice7: student.choice7,
              choice8: student.choice8,
              choice9: student.choice9,
              choice10: student.choice10,
              academicYear: student.academicYear,
              counselingRoundId: student.counselingRoundId,
              counselingRoundNumber: student.counselingRoundNumber,
              updatedAt: new Date(),
            },
          })
          .returning();
        results.push(result);
      }

      // Report progress after each batch
      if (onProgress) {
        onProgress(results.length, total);
      }
    }
    return results;
  }

  async deleteAllStudents(): Promise<void> {
    await db.delete(students);
  }

  async getStudentsCount(academicYear?: string, districtAdminUsername?: string, excludeUnassigned: boolean = false): Promise<number> {
    const conditions = [];
    if (academicYear) {
      conditions.push(eq(students.academicYear, academicYear));
    }
    if (districtAdminUsername) {
      if (excludeUnassigned) {
        conditions.push(eq(students.districtAdmin, districtAdminUsername));
      } else {
        conditions.push(
          or(
            isNull(students.districtAdmin),
            eq(students.districtAdmin, districtAdminUsername)
          )
        );
      }
    }

    const query = db.select({ count: sql<number>`count(*)` }).from(students);
    
    if (conditions.length > 0) {
      query.where(and(...conditions));
    }
    
    const [result] = await query;
    return Number(result.count);
  }

  async getStudentsByStatus(status: string, academicYear?: string): Promise<Student[]> {
    const conditions = [eq(students.allocationStatus, status)];
    if (academicYear) {
      conditions.push(eq(students.academicYear, academicYear));
    }
    return db.select().from(students)
      .where(and(...conditions))
      .orderBy(asc(students.meritNumber));
  }

  // Students entrance result operations
  async getStudentsEntranceResults(limit = 50, offset = 0): Promise<StudentsEntranceResult[]> {
    return db.select().from(studentsEntranceResult)
      .orderBy(asc(studentsEntranceResult.meritNo))
      .limit(limit)
      .offset(offset);
  }

  async getStudentsEntranceResult(id: string): Promise<StudentsEntranceResult | undefined> {
    const [result] = await db.select().from(studentsEntranceResult).where(eq(studentsEntranceResult.id, id));
    return result;
  }

  async getStudentsEntranceResultByMeritNumber(meritNumber: number): Promise<StudentsEntranceResult | undefined> {
    const [result] = await db.select().from(studentsEntranceResult).where(eq(studentsEntranceResult.meritNo, meritNumber));
    return result;
  }

  async getStudentsEntranceResultsCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(studentsEntranceResult);
    return Number(result.count);
  }

  async getStudentsEntranceResultsByRound(academicYear: string, roundName: string): Promise<StudentsEntranceResult[]> {
    return db.select().from(studentsEntranceResult)
      .where(
        and(
          eq(studentsEntranceResult.academicYear, academicYear),
          eq(studentsEntranceResult.roundName, roundName)
        )
      )
      .orderBy(asc(studentsEntranceResult.meritNo));
  }

  async searchStudentsEntranceResults(query: string): Promise<StudentsEntranceResult[]> {
    return db.select().from(studentsEntranceResult)
      .where(
        or(
          ilike(studentsEntranceResult.studentName, `%${query}%`),
          ilike(studentsEntranceResult.applicationNo, `%${query}%`),
          ilike(studentsEntranceResult.rollNo, `%${query}%`),
          sql`${studentsEntranceResult.meritNo}::text ILIKE ${'%' + query + '%'}`
        )
      )
      .orderBy(asc(studentsEntranceResult.meritNo))
      .limit(20);
  }

  async createStudentsEntranceResult(result: InsertStudentsEntranceResult): Promise<StudentsEntranceResult> {
    const [created] = await db
      .insert(studentsEntranceResult)
      .values({ ...result, updatedAt: new Date() })
      .returning();
    return created;
  }

  async bulkCreateStudentsEntranceResults(results: InsertStudentsEntranceResult[], onProgress?: (processed: number, total: number) => void): Promise<StudentsEntranceResult[]> {
    // Use upsert to handle duplicates - update if any unique field (merit_no, application_no, roll_no) already exists
    const inserted = [];
    const total = results.length;
    const BATCH_SIZE = 50; // Process in batches of 50

    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);
      for (const result of batch) {
        // Check if record exists by any unique field (single query with OR)
        const existing = await db.select()
          .from(studentsEntranceResult)
          .where(or(
            eq(studentsEntranceResult.meritNo, result.meritNo),
            eq(studentsEntranceResult.applicationNo, result.applicationNo),
            eq(studentsEntranceResult.rollNo, result.rollNo)
          ))
          .limit(1);

        if (existing.length > 0) {
          // Update existing record (use the id from the found record)
          const [updated] = await db
            .update(studentsEntranceResult)
            .set({
              meritNo: result.meritNo,
              applicationNo: result.applicationNo,
              rollNo: result.rollNo,
              studentName: result.studentName,
              marks: result.marks,
              gender: result.gender,
              category: result.category,
              stream: result.stream,
              academicYear: result.academicYear,
              roundName: result.roundName,
              updatedAt: new Date(),
            })
            .where(eq(studentsEntranceResult.id, existing[0].id))
            .returning();
          inserted.push(updated);
        } else {
          // Insert new record
          const [newRecord] = await db
            .insert(studentsEntranceResult)
            .values({ ...result, updatedAt: new Date() })
            .returning();
          inserted.push(newRecord);
        }
      }

      // Report progress after each batch
      if (onProgress) {
        onProgress(inserted.length, total);
      }
    }
    return inserted;
  }

  async updateStudentsEntranceResult(id: string, updateData: Partial<InsertStudentsEntranceResult>): Promise<StudentsEntranceResult> {
    const [updated] = await db
      .update(studentsEntranceResult)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(studentsEntranceResult.id, id))
      .returning();
    return updated;
  }

  async updateStudentPreferences(studentId: string, preferences: {
    choice1?: string; choice2?: string; choice3?: string; choice4?: string; choice5?: string;
    choice6?: string; choice7?: string; choice8?: string; choice9?: string; choice10?: string;
    counselingDistrict?: string; districtAdmin?: string;
    counselingRoundId?: string;
    counselingRoundNumber?: number;
    preferencesUpdatedAt?: Date;
  }): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({
        ...preferences,
        preferencesUpdatedAt: preferences.preferencesUpdatedAt || new Date(),
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  async releaseAssignment(studentId: string): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({
        counselingDistrict: null,
        districtAdmin: null,
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  // Counseling round operations
  async getCounselingRounds(academicYear?: string): Promise<CounselingRound[]> {
    let rounds: CounselingRound[];
    if (academicYear) {
      rounds = await db.select().from(counselingRounds)
        .where(eq(counselingRounds.academicYear, academicYear))
        .orderBy(asc(counselingRounds.roundName), asc(counselingRounds.roundNumber));
    } else {
      rounds = await db.select().from(counselingRounds)
        .orderBy(desc(counselingRounds.academicYear), asc(counselingRounds.roundName), asc(counselingRounds.roundNumber));
    }

    // Debug: Log what Drizzle returns
    if (rounds.length > 0) {
      console.log('🔍 Drizzle returned rounds:', rounds.map(r => {
        let startDateValue: string;
        try {
          if (r.startDate instanceof Date) {
            if (!isNaN(r.startDate.getTime())) {
              startDateValue = r.startDate.toISOString();
            } else {
              startDateValue = 'Invalid Date (NaN)';
            }
          } else {
            startDateValue = String(r.startDate);
          }
        } catch (e) {
          startDateValue = `Error: ${String(e)}`;
        }

        return {
          id: r.id,
          startDate: r.startDate,
          startDateType: typeof r.startDate,
          startDateIsDate: r.startDate instanceof Date,
          startDateValue: startDateValue
        };
      }));
    }

    return rounds;
  }

  async getCounselingRound(id: string): Promise<CounselingRound | undefined> {
    const [round] = await db.select().from(counselingRounds)
      .where(eq(counselingRounds.id, id));
    return round;
  }

  async counselingTitleExists(academicYear: string, roundName: string): Promise<boolean> {
    const existing = await db.select().from(counselingRounds)
      .where(and(
        eq(counselingRounds.academicYear, academicYear),
        eq(counselingRounds.roundName, roundName)
      ))
      .limit(1);
    return existing.length > 0;
  }

  async getLatestRoundForCounseling(academicYear: string, roundName: string): Promise<CounselingRound | undefined> {
    const rounds = await db.select().from(counselingRounds)
      .where(and(
        eq(counselingRounds.academicYear, academicYear),
        eq(counselingRounds.roundName, roundName)
      ))
      .orderBy(desc(counselingRounds.roundNumber))
      .limit(1);
    return rounds[0];
  }

  async toggleSuspendCounseling(academicYear: string, roundName: string, suspend: boolean): Promise<CounselingRound[]> {
    const updated = await db
      .update(counselingRounds)
      .set({
        isSuspended: suspend,
        updatedAt: new Date()
      })
      .where(and(
        eq(counselingRounds.academicYear, academicYear),
        eq(counselingRounds.roundName, roundName)
      ))
      .returning();
    return updated;
  }

  async getActiveCounselingRound(academicYear?: string): Promise<CounselingRound | undefined> {
    const conditions = [eq(counselingRounds.isActive, true)];
    if (academicYear) {
      conditions.push(eq(counselingRounds.academicYear, academicYear));
    }
    
    let [round] = await db.select().from(counselingRounds)
      .where(and(...conditions))
      .orderBy(desc(counselingRounds.createdAt))
      .limit(1);

    // Safe fallback: If academic year was specified but no round found, 
    // try to find ANY active round across the system before giving up.
    if (!round && academicYear) {
       console.warn(`[CounselingRound] No active round found for ${academicYear}, falling back to any active round.`);
       const [anyRound] = await db.select().from(counselingRounds)
        .where(eq(counselingRounds.isActive, true))
        .orderBy(desc(counselingRounds.createdAt))
        .limit(1);
       round = anyRound;
    }

    return round;
  }

  async createCounselingRound(round: InsertCounselingRound): Promise<CounselingRound> {
    // Validate that roundName is provided (required for identifying the counseling)
    if (!round.roundName) {
      throw new Error("Round name (counseling title) is required");
    }

    // Auto-increment round number if not provided
    // Round numbers start at 1 for each counseling (roundName) within an academic year
    let finalRoundNumber = round.roundNumber;
    if (!finalRoundNumber || finalRoundNumber <= 0) {
      // Find the max round number for this counseling (roundName) within this academic year
      const existingRounds = await db.select().from(counselingRounds)
        .where(and(
          eq(counselingRounds.academicYear, round.academicYear),
          eq(counselingRounds.roundName, round.roundName)
        ))
        .orderBy(desc(counselingRounds.roundNumber))
        .limit(1);

      if (existingRounds.length > 0) {
        finalRoundNumber = (existingRounds[0].roundNumber || 0) + 1;
      } else {
        finalRoundNumber = 1; // First round for this counseling
      }
    }

    // Debug logging
    console.log('💾 Storing counseling round:', {
      academicYear: round.academicYear,
      roundName: round.roundName,
      startDate: round.startDate,
      startDateType: typeof round.startDate,
      startDateValue: round.startDate instanceof Date ? round.startDate.toISOString() : round.startDate,
      endDate: round.endDate,
      endDateType: typeof round.endDate
    });

    const [created] = await db
      .insert(counselingRounds)
      .values({ ...round, roundNumber: finalRoundNumber, updatedAt: new Date() })
      .returning();

    // Debug logging after creation
    console.log('✅ Created counseling round:', {
      id: created.id,
      startDate: created.startDate,
      startDateType: typeof created.startDate,
      startDateValue: created.startDate instanceof Date ? created.startDate.toISOString() : String(created.startDate),
      endDate: created.endDate
    });

    return created;
  }

  async updateCounselingRound(id: string, updates: Partial<CounselingRound>): Promise<CounselingRound> {
    const [updated] = await db
      .update(counselingRounds)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(counselingRounds.id, id))
      .returning();
    return updated;
  }

  async activateCounselingRound(id: string, academicYear: string): Promise<CounselingRound> {
    // First, deactivate all other rounds for this academic year
    await db
      .update(counselingRounds)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(counselingRounds.academicYear, academicYear),
        eq(counselingRounds.isActive, true)
      ));

    // Then activate the specified round
    const [activated] = await db
      .update(counselingRounds)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(counselingRounds.id, id))
      .returning();
    return activated;
  }

  async completeCounselingRound(id: string): Promise<CounselingRound> {
    const [completed] = await db
      .update(counselingRounds)
      .set({
        isCompleted: true,
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(counselingRounds.id, id))
      .returning();
    return completed;
  }

  async autoCreateNextRound(academicYear: string, roundName: string, defaultStartDate: Date): Promise<CounselingRound | null> {
    // Get the latest round for this counseling
    const latestRound = await this.getLatestRoundForCounseling(academicYear, roundName);

    if (!latestRound) {
      return null; // No existing rounds, should create first round instead
    }

    // Check if suspended
    if (latestRound.isSuspended) {
      console.log(`⏸️  Auto-creation skipped: Counseling "${roundName}" is suspended`);
      return null;
    }

    // Check if latest round is completed
    if (!latestRound.isCompleted) {
      return null; // Latest round not completed yet
    }

    // Check if vacancies exist
    const vacancyAvailability = await this.checkVacancyAvailability(academicYear, roundName);
    if (!vacancyAvailability.hasVacancies) {
      console.log(`⏸️  Auto-creation skipped: No vacancies available for "${roundName}"`);
      return null;
    }

    // Create next round
    const nextRoundNumber = latestRound.roundNumber + 1;
    const newRound = await this.createCounselingRound({
      academicYear,
      roundNumber: nextRoundNumber,
      roundName,
      startDate: defaultStartDate,
      endDate: undefined,
      isActive: false,
      isCompleted: false,
    });

    // Copy isSuspended from previous round
    if (latestRound.isSuspended) {
      await db
        .update(counselingRounds)
        .set({ isSuspended: true, updatedAt: new Date() })
        .where(eq(counselingRounds.id, newRound.id));
      newRound.isSuspended = true;
    }

    console.log(`✅ Auto-created Round ${nextRoundNumber} for "${roundName}"`);
    return newRound;
  }

  async bulkCreateCounselingRounds(rounds: InsertCounselingRound[]): Promise<CounselingRound[]> {
    const createdRounds: CounselingRound[] = [];

    for (const round of rounds) {
      // Validate that roundName is provided
      if (!round.roundName) {
        throw new Error("Round name (counseling title) is required for all rounds");
      }

      // Auto-increment round number for each round
      let finalRoundNumber = round.roundNumber;
      if (!finalRoundNumber || finalRoundNumber <= 0) {
        // Find the max round number for this counseling (roundName) within this academic year
        const existingRounds = await db.select().from(counselingRounds)
          .where(and(
            eq(counselingRounds.academicYear, round.academicYear),
            eq(counselingRounds.roundName, round.roundName)
          ))
          .orderBy(desc(counselingRounds.roundNumber))
          .limit(1);

        if (existingRounds.length > 0) {
          finalRoundNumber = (existingRounds[0].roundNumber || 0) + 1;
        } else {
          finalRoundNumber = 1; // First round for this counseling
        }
      }

      const [created] = await db
        .insert(counselingRounds)
        .values({ ...round, roundNumber: finalRoundNumber, updatedAt: new Date() })
        .returning();

      createdRounds.push(created);
    }

    return createdRounds;
  }

  async deleteCounselingRound(id: string): Promise<void> {
    // Check if round has any students allocated
    const students = await this.getStudentsByCounselingRound(id);
    if (students.length > 0) {
      throw new Error(`Cannot delete counseling round: ${students.length} student(s) are allocated in this round`);
    }

    // Check if round is active
    const round = await this.getCounselingRound(id);
    if (round?.isActive) {
      throw new Error("Cannot delete an active counseling round. Please deactivate it first.");
    }

    await db.delete(counselingRounds).where(eq(counselingRounds.id, id));
  }

  async getStudentsByCounselingRound(counselingRoundId: string): Promise<Student[]> {
    return db.select().from(students)
      .where(eq(students.counselingRoundId, counselingRoundId));
  }

  // Vacancy operations
  async getVacancies(academicYear?: string, roundName?: string): Promise<Vacancy[]> {
    const conditions = [];
    if (academicYear) {
      conditions.push(eq(vacancies.academicYear, academicYear));
    }
    if (roundName) {
      conditions.push(eq(vacancies.roundName, roundName));
    }

    if (conditions.length > 0) {
      return db.select().from(vacancies)
        .where(and(...conditions))
        .orderBy(asc(vacancies.district));
    }
    return db.select().from(vacancies).orderBy(asc(vacancies.district));
  }

  async getVacancyByDistrict(district: string, academicYear?: string, roundName?: string): Promise<Vacancy | undefined> {
    const conditions = [eq(vacancies.district, district)];
    if (academicYear) {
      conditions.push(eq(vacancies.academicYear, academicYear));
    }
    if (roundName) {
      conditions.push(eq(vacancies.roundName, roundName));
    }
    const [vacancy] = await db.select().from(vacancies)
      .where(and(...conditions));
    return vacancy;
  }

  async getVacanciesByYear(academicYear: string, roundName?: string): Promise<Vacancy[]> {
    const conditions = [eq(vacancies.academicYear, academicYear)];
    if (roundName) {
      conditions.push(eq(vacancies.roundName, roundName));
    }
    return db.select().from(vacancies)
      .where(and(...conditions))
      .orderBy(asc(vacancies.district));
  }

  async checkIfAllSeatsFilled(academicYear: string, roundName: string): Promise<boolean> {
    // Get all vacancies for this academic year and round name
    const allVacancies = await this.getVacancies(academicYear, roundName);

    // If no vacancies exist, allow creating rounds (vacancies can be uploaded later)
    if (allVacancies.length === 0) {
      return false;
    }

    // Check if any vacancy has available seats
    const hasAvailableSeats = allVacancies.some(v => (v.availableSeats || 0) > 0);

    // If no vacancies have available seats, all seats are filled
    return !hasAvailableSeats;
  }

  async checkVacancyAvailability(academicYear: string, roundName: string): Promise<{
    hasVacancies: boolean;
    totalAvailableSeats: number;
    vacancyCount: number;
  }> {
    const allVacancies = await this.getVacancies(academicYear, roundName);
    const totalAvailableSeats = allVacancies.reduce((sum, v) => sum + (v.availableSeats || 0), 0);

    return {
      hasVacancies: totalAvailableSeats > 0,
      totalAvailableSeats,
      vacancyCount: allVacancies.length,
    };
  }

  async getPrerequisitesStatus(academicYear: string, roundName: string): Promise<{
    hasVacancyData: boolean;
    vacancyCount: number;
    totalAvailableSeats: number;
    hasEntranceResults: boolean;
    entranceResultsCount: number;
    hasStudentChoices: boolean;
    studentsWithChoicesCount: number;
    allPrerequisitesMet: boolean;
  }> {
    // Check vacancy data
    const vacancies = await this.getVacancies(academicYear, roundName);
    const totalAvailableSeats = vacancies.reduce((sum, v) => sum + (v.availableSeats || 0), 0);
    const hasVacancyData = totalAvailableSeats > 0;

    // Check entrance results
    const allEntranceResults = await db.select().from(studentsEntranceResult)
      .where(and(
        eq(studentsEntranceResult.academicYear, academicYear),
        eq(studentsEntranceResult.roundName, roundName)
      ));
    const hasEntranceResults = allEntranceResults.length > 0;

    // Check students with choices (choice1 filled)
    const allStudents = await db.select().from(students)
      .where(eq(students.academicYear, academicYear));
    const studentsWithChoices = allStudents.filter(s => s.choice1 && s.choice1.trim() !== '');
    const hasStudentChoices = studentsWithChoices.length > 0;

    return {
      hasVacancyData,
      vacancyCount: vacancies.length,
      totalAvailableSeats,
      hasEntranceResults,
      entranceResultsCount: allEntranceResults.length,
      hasStudentChoices,
      studentsWithChoicesCount: studentsWithChoices.length,
      allPrerequisitesMet: hasVacancyData && hasEntranceResults && hasStudentChoices,
    };
  }

  async createVacancy(vacancy: InsertVacancy): Promise<Vacancy> {
    const [created] = await db
      .insert(vacancies)
      .values({ ...vacancy, updatedAt: new Date() })
      .returning();
    return created;
  }

  async resetAllocation(academicYear: string, roundName: string): Promise<void> {
    // 1. Restore all vacancy availableSeats to totalSeats
    await db.update(vacancies)
      .set({ availableSeats: sql`${vacancies.totalSeats}` })
      .where(and(
        eq(vacancies.academicYear, academicYear),
        eq(vacancies.roundName, roundName)
      ));

    // 2. Reset student allocation status for this year
    await db.update(students)
      .set({
        allocationStatus: 'pending',
        allottedDistrict: null,
        allottedStream: null,
        allottedSchoolUdise: null,
        counselingRoundId: null,
        counselingRoundNumber: null
      })
      .where(eq(students.academicYear, academicYear));

    // 3. Reset the round-level allocation flags so re-runs work
    await db.update(counselingRounds)
      .set({
        isAllocationCompleted: false,
        isAllocationFinalized: false,
        allocationFinalizedAt: null,
        allocationFinalizedBy: null
      })
      .where(and(
        eq(counselingRounds.academicYear, academicYear),
        eq(counselingRounds.roundName, roundName)
      ));
  }

  async updateVacancy(id: string, vacancy: Partial<InsertVacancy>): Promise<Vacancy> {
    const [updated] = await db
      .update(vacancies)
      .set({ ...vacancy, updatedAt: new Date() })
      .where(eq(vacancies.id, id))
      .returning();
    return updated;
  }

  async bulkUpsertVacancies(vacanciesList: InsertVacancy[], onProgress?: (processed: number, total: number) => void): Promise<Vacancy[]> {
    const results = [];
    const total = vacanciesList.length;
    const BATCH_SIZE = 50; // Process in batches of 50

    for (let i = 0; i < vacanciesList.length; i += BATCH_SIZE) {
      const batch = vacanciesList.slice(i, i + BATCH_SIZE);
      for (const vacancy of batch) {
        // Use the constraint that doesn't include nullable columns: district, stream, gender, category
        // Note: udiseCode, academicYear, and roundName are nullable, so we can't use them in ON CONFLICT
        // We'll use district-based constraint and handle academicYear/roundName/udiseCode in the SET clause

        if (!vacancy.district || !vacancy.stream || !vacancy.gender || !vacancy.category) {
          console.warn('Skipping vacancy with missing required fields:', vacancy);
          continue;
        }

        // Check if vacancy already exists based on district, stream, gender, category
        // and also match academicYear, roundName, and udiseCode if provided
        const conditions = [
          eq(vacancies.district, vacancy.district),
          eq(vacancies.stream, vacancy.stream),
          eq(vacancies.gender, vacancy.gender),
          eq(vacancies.category, vacancy.category),
        ];

        // Add nullable field conditions
        if (vacancy.academicYear) {
          conditions.push(eq(vacancies.academicYear, vacancy.academicYear));
        } else {
          conditions.push(isNull(vacancies.academicYear));
        }

        if (vacancy.roundName) {
          conditions.push(eq(vacancies.roundName, vacancy.roundName));
        } else {
          conditions.push(isNull(vacancies.roundName));
        }

        if (vacancy.udiseCode) {
          conditions.push(eq(vacancies.udiseCode, vacancy.udiseCode));
        } else {
          conditions.push(isNull(vacancies.udiseCode));
        }

        const existing = await db.select()
          .from(vacancies)
          .where(and(...conditions))
          .limit(1);

        if (existing.length > 0) {
          // Update existing vacancy
          const [updated] = await db
            .update(vacancies)
            .set({
              totalSeats: vacancy.totalSeats,
              availableSeats: vacancy.availableSeats,
              academicYear: vacancy.academicYear,
              roundName: vacancy.roundName,
              udiseCode: vacancy.udiseCode,
              updatedAt: new Date(),
            })
            .where(eq(vacancies.id, existing[0].id))
            .returning();
          results.push(updated);
        } else {
          // Insert new vacancy
          const [inserted] = await db
            .insert(vacancies)
            .values({ ...vacancy, updatedAt: new Date() })
            .returning();
          results.push(inserted);
        }
      }

      // Report progress after each batch
      if (onProgress) {
        onProgress(results.length, total);
      }
    }
    return results;
  }

  async deleteAllVacancies(): Promise<void> {
    await db.delete(vacancies);
  }

  // School operations
  async getSchool(udiseCode: string): Promise<School | undefined> {
    const [school] = await db.select().from(schools).where(eq(schools.udiseCode, udiseCode));
    return school;
  }

  async getSchoolByName(schoolName: string): Promise<School | undefined> {
    const [school] = await db.select().from(schools).where(eq(schools.schoolName, schoolName));
    return school;
  }

  async getAllSchools(): Promise<School[]> {
    return db.select().from(schools).orderBy(asc(schools.district), asc(schools.schoolName));
  }

  async getSchoolsByDistrict(district: string): Promise<School[]> {
    return db.select().from(schools)
      .where(eq(schools.district, district))
      .orderBy(asc(schools.schoolName));
  }

  async createSchool(school: InsertSchool): Promise<School> {
    const [created] = await db
      .insert(schools)
      .values({ ...school, updatedAt: new Date() })
      .returning();
    return created;
  }

  async bulkUpsertSchools(schoolsList: InsertSchool[]): Promise<School[]> {
    const results = [];
    for (const school of schoolsList) {
      // Check if school with this name already exists (school_name is unique)
      const existingByName = await this.getSchoolByName(school.schoolName);
      if (existingByName) {
        // School name exists - update it if UDISE code matches, otherwise skip (can't change UDISE code)
        if (existingByName.udiseCode === school.udiseCode) {
          // Same UDISE code - update district if needed
          const [updated] = await db
            .update(schools)
            .set({
              district: school.district,
              updatedAt: new Date(),
            })
            .where(eq(schools.udiseCode, school.udiseCode))
            .returning();
          results.push(updated);
        } else {
          // Different UDISE code - can't insert (school_name unique constraint)
          console.warn(`School "${school.schoolName}" already exists with UDISE code ${existingByName.udiseCode}, skipping new UDISE code ${school.udiseCode}`);
          results.push(existingByName);
        }
      } else {
        // School name doesn't exist - insert/update based on UDISE code
        const [result] = await db
          .insert(schools)
          .values({ ...school, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [schools.udiseCode],
            set: {
              schoolName: school.schoolName,
              district: school.district,
              updatedAt: new Date(),
            },
          })
          .returning();
        results.push(result);
      }
    }
    return results;
  }

  async getVacanciesByUdiseCode(udiseCode: string, academicYear?: string, roundName?: string): Promise<Vacancy[]> {
    const conditions = [eq(vacancies.udiseCode, udiseCode)];
    if (academicYear) {
      conditions.push(eq(vacancies.academicYear, academicYear));
    }
    if (roundName) {
      conditions.push(eq(vacancies.roundName, roundName));
    }
    if (conditions.length > 0) {
      return db.select().from(vacancies)
        .where(and(...conditions))
        .orderBy(asc(vacancies.stream), asc(vacancies.gender), asc(vacancies.category));
    }
    return db.select().from(vacancies)
      .where(eq(vacancies.udiseCode, udiseCode))
      .orderBy(asc(vacancies.stream), asc(vacancies.gender), asc(vacancies.category));
  }

  // Settings operations
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings)
      .where(eq(settings.key, key));
    return setting;
  }

  async setSetting(setting: InsertSetting): Promise<Setting> {
    const [result] = await db
      .insert(settings)
      .values({ ...setting, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: setting.value,
          description: setting.description,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getSettings(): Promise<Setting[]> {
    return db.select().from(settings).orderBy(asc(settings.key));
  }

  // Audit log operations
  async createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db
      .insert(auditLogs)
      .values(auditLog)
      .returning();
    return created;
  }

  async getAuditLogs(limit = 50, offset = 0): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);
  }

  async getAuditLogsByUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  // File upload operations
  async createFileUpload(fileUpload: InsertFileUpload): Promise<FileUpload> {
    const [created] = await db
      .insert(fileUploads)
      .values(fileUpload)
      .returning();
    return created;
  }

  async getFileUploads(limit = 50): Promise<FileUpload[]> {
    return db.select().from(fileUploads)
      .orderBy(desc(fileUploads.createdAt))
      .limit(limit);
  }

  async updateFileUpload(id: string, fileUpload: Partial<InsertFileUpload>): Promise<FileUpload> {
    const [updated] = await db
      .update(fileUploads)
      .set(fileUpload)
      .where(eq(fileUploads.id, id))
      .returning();
    return updated;
  }

  async getFileUploadsByType(type: string): Promise<FileUpload[]> {
    return db.select().from(fileUploads)
      .where(eq(fileUploads.type, type))
      .orderBy(desc(fileUploads.createdAt));
  }

  // Statistics
  async getDashboardStats(user?: import("@shared/schema").User): Promise<{
    totalStudents: number;
    totalVacancies: number;
    pendingAllocations: number;
    pendingWithPreferences: number;
    completionRate: number;
    vacatedSeats: number;
    lockedStudents: number;
    unlockedStudents: number;
    studentsWithPreferences: number;
    studentsWithoutPreferences: number;
    streamBreakdown: Record<string, number>;
    districtBreakdown: { district: string; locked: number; unlocked: number }[];
  }> {
    // Determine scoping based on user role
    const isDistrictAdmin = user?.role === 'district_admin';
    const districtFilter = isDistrictAdmin ? user.district : null;

    let totalStudents = 0;
    if (isDistrictAdmin) {
      const [districtStudentsCount] = await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.counselingDistrict, districtFilter!));
      totalStudents = Number(districtStudentsCount.count);
    } else {
      const [entranceResultsCount] = await db.select({ count: sql<number>`count(*)` }).from(studentsEntranceResult);
      totalStudents = Number(entranceResultsCount.count);
    }

    // Get allocation status counts from students table
    const [studentsWithPreferencesCount] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.counselingDistrict, districtFilter!))
      : await db.select({ count: sql<number>`count(*)` }).from(students);

    const [pendingCount] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` }).from(students).where(and(eq(students.allocationStatus, 'pending'), eq(students.counselingDistrict, districtFilter!)))
      : await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.allocationStatus, 'pending'));
    
    // New metric: Pending with filled preferences (stream and choice1)
    const [pendingWithPreferencesCount] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(and(
          eq(students.allocationStatus, 'pending'),
          isNotNull(students.stream),
          isNotNull(students.choice1),
          eq(students.counselingDistrict, districtFilter!)
        ))
      : await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(and(
          eq(students.allocationStatus, 'pending'),
          isNotNull(students.stream),
          isNotNull(students.choice1)
        ));

    const [allottedCount] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` }).from(students).where(and(eq(students.allocationStatus, 'allotted'), eq(students.counselingDistrict, districtFilter!)))
      : await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.allocationStatus, 'allotted'));

    const [notAllottedCount] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` }).from(students).where(and(eq(students.allocationStatus, 'not_allotted'), eq(students.counselingDistrict, districtFilter!)))
      : await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.allocationStatus, 'not_allotted'));

    const [vacatedCount] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` }).from(students).where(and(eq(students.allocationStatus, 'vacated'), eq(students.counselingDistrict, districtFilter!)))
      : await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.allocationStatus, 'vacated'));

    const vacancyResults = isDistrictAdmin
      ? await db.select({ total: sql<number>`sum(total_seats)` }).from(vacancies).where(eq(vacancies.district, districtFilter!))
      : await db.select({ total: sql<number>`sum(total_seats)` }).from(vacancies);

    const totalVacancies = Number(vacancyResults[0]?.total || 0);
    
    // Lock Counts
    const [lockedCountObj] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` }).from(students).where(and(eq(students.isLocked, true), eq(students.counselingDistrict, districtFilter!)))
      : await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.isLocked, true));
    const lockedStudents = Number(lockedCountObj.count);
    const unlockedStudents = Math.max(0, totalStudents - lockedStudents);

    // Preferences Counts
    const [withPrefsObj] = isDistrictAdmin
      ? await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(and(isNotNull(students.choice1), isNotNull(students.stream), eq(students.counselingDistrict, districtFilter!)))
      : await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(and(isNotNull(students.choice1), isNotNull(students.stream)));
    const studentsWithPreferences = Number(withPrefsObj.count);
    const studentsWithoutPreferences = Math.max(0, totalStudents - studentsWithPreferences);

    // Stream Breakdown
    const streamGroups = isDistrictAdmin
      ? await db.select({ stream: students.stream, count: sql<number>`count(*)` }).from(students).where(and(isNotNull(students.stream), eq(students.counselingDistrict, districtFilter!))).groupBy(students.stream)
      : await db.select({ stream: students.stream, count: sql<number>`count(*)` }).from(students).where(isNotNull(students.stream)).groupBy(students.stream);
    
    const streamBreakdown = streamGroups.reduce((acc: Record<string, number>, row: any) => {
      if (!row.stream) return acc;
      const key = row.stream === 'Non-Medical' ? 'NonMedical' : row.stream;
      acc[key] = (acc[key] || 0) + Number(row.count);
      return acc;
    }, {} as Record<string, number>);

    // District Breakdown
    const districtGroups = isDistrictAdmin
      ? await db.select({ district: students.counselingDistrict, isLocked: students.isLocked, count: sql<number>`count(*)` })
          .from(students)
          .where(eq(students.counselingDistrict, districtFilter!))
          .groupBy(students.counselingDistrict, students.isLocked)
      : await db.select({ district: students.counselingDistrict, isLocked: students.isLocked, count: sql<number>`count(*)` })
          .from(students)
          .groupBy(students.counselingDistrict, students.isLocked);

    const districtBreakdownMap: Record<string, { district: string, locked: number, unlocked: number }> = {};
    for (const row of districtGroups) {
      const dist = row.district || 'Unassigned';
      if (!districtBreakdownMap[dist]) {
        districtBreakdownMap[dist] = { district: dist, locked: 0, unlocked: 0 };
      }
      if (row.isLocked) {
        districtBreakdownMap[dist].locked += Number(row.count);
      } else {
        districtBreakdownMap[dist].unlocked += Number(row.count);
      }
    }
    const districtBreakdown = Object.values(districtBreakdownMap).sort((a,b) => a.district.localeCompare(b.district));

    // Pending allocations = students without preferences + students with pending status
    const pendingAllocations = studentsWithoutPreferences + Number(pendingCount.count);
    const completionRate = totalStudents > 0 ? (Number(allottedCount.count) / totalStudents) * 100 : 0;

    return {
      totalStudents,
      totalVacancies,
      pendingAllocations, // Traditional calculation
      pendingWithPreferences: Number(pendingWithPreferencesCount.count), // New specific metric
      completionRate: Math.round(completionRate * 10) / 10,
      vacatedSeats: Number(vacatedCount.count),
      lockedStudents,
      unlockedStudents,
      studentsWithPreferences,
      studentsWithoutPreferences,
      streamBreakdown,
      districtBreakdown,
    };
  }

  // District status operations
  async getDistrictStatus(district: string, counselingRoundId?: string): Promise<DistrictStatus | undefined> {
    const conditions = [eq(districtStatus.district, district)];
    if (counselingRoundId) {
      conditions.push(eq(districtStatus.counselingRoundId, counselingRoundId));
    }
    const [status] = await db.select().from(districtStatus)
      .where(and(...conditions))
      .orderBy(desc(districtStatus.updatedAt)); // Get the most recent if counselingRoundId is not provided
    return status;
  }

  async getAllDistrictStatuses(counselingRoundId?: string): Promise<DistrictStatus[]> {
    if (counselingRoundId) {
      return db.select().from(districtStatus)
        .where(
          or(
            eq(districtStatus.counselingRoundId, counselingRoundId),
            isNull(districtStatus.counselingRoundId)
          )
        )
        .orderBy(asc(districtStatus.district));
    }
    return db.select().from(districtStatus)
      .orderBy(asc(districtStatus.district), desc(districtStatus.updatedAt));
  }

  async createOrUpdateDistrictStatus(status: InsertDistrictStatus): Promise<DistrictStatus> {
    const existing = await this.getDistrictStatus(status.district, status.counselingRoundId || undefined);

    if (existing) {
      const [updated] = await db
        .update(districtStatus)
        .set({ ...status, updatedAt: new Date() })
        .where(eq(districtStatus.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(districtStatus)
        .values({ ...status, updatedAt: new Date() })
        .returning();
      return created;
    }
  }

  async finalizeDistrict(district: string, userId: string, counselingRoundId?: string): Promise<DistrictStatus> {
    // Get current district student stats for the status record
    const districtStudents = await this.getStudentsByDistrict(district);

    // Only consider students that belong to this district AND have district admin assigned AND have preference data
    const eligibleStudents = districtStudents.students.filter(s =>
      s.counselingDistrict === district && s.districtAdmin && s.choice1 // Must belong to district, have district admin and at least first choice
    );

    const lockedEligibleStudents = eligibleStudents.filter(s => s.isLocked).length;
    const studentsWithChoices = districtStudents.students.filter(s => s.choice1).length;

    // Create or update district status with finalization
    const statusData: InsertDistrictStatus = {
      district,
      counselingRoundId: counselingRoundId || null,
      isFinalized: true,
      totalStudents: eligibleStudents.length, // Only count eligible students
      lockedStudents: lockedEligibleStudents,
      studentsWithChoices,
      finalizedBy: userId,
      finalizedAt: new Date(),
    };

    return await this.createOrUpdateDistrictStatus(statusData);
  }

  async unfinalizeDistrict(district: string): Promise<DistrictStatus | undefined> {
    const existing = await this.getDistrictStatus(district);
    if (!existing) return undefined;

    const [updated] = await db
      .update(districtStatus)
      .set({ 
        isFinalized: false, 
        finalizedAt: null, 
        finalizedBy: null,
        updatedAt: new Date() 
      })
      .where(eq(districtStatus.district, district))
      .returning();
      
    return updated;
  }

  // Student locking operations
  async lockStudent(studentId: string, userId: string): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({
        isLocked: true,
        lockedBy: userId,
        lockedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  async unlockStudent(studentId: string): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  // Check if a user can edit a specific student (exclusive lock system)
  async canEditStudent(studentId: string, userId: string): Promise<boolean> {
    const [student] = await db.select().from(students).where(eq(students.id, studentId));
    if (!student) return false;

    // Student can be edited if:
    // 1. Not locked by anyone (lockedBy is null)
    // 2. OR locked by the same user requesting to edit
    return !student.lockedBy || student.lockedBy === userId;
  }

  // Attempt to lock a student for exclusive editing
  async lockStudentForEdit(studentId: string, userId: string): Promise<{ success: boolean; message: string; student?: Student }> {
    const [student] = await db.select().from(students).where(eq(students.id, studentId));
    if (!student) {
      return { success: false, message: "Student not found" };
    }

    // Check if student is already locked by another user
    if (student.lockedBy && student.lockedBy !== userId) {
      const [lockingUser] = await db.select({ username: users.username })
        .from(users)
        .where(eq(users.id, student.lockedBy));

      return {
        success: false,
        message: `Student is currently being edited by ${lockingUser?.username || 'another admin'}. Please try again later.`
      };
    }

    // Lock the student for this user
    const [updated] = await db
      .update(students)
      .set({
        isLocked: true,
        lockedBy: userId,
        lockedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();

    return { success: true, message: "Student locked for editing", student: updated };
  }

  async getStudentsByDistrict(district: string, limit = 50, offset = 0): Promise<{ students: Student[], total: number }> {
    // District admins can see:
    // 1. Students assigned to their district (counselingDistrict = district)
    // 2. Students not assigned to any district (counselingDistrict is null)
    // 3. Students that are not released (isReleased = false)
    const studentsResult = await db.select().from(students)
      .where(and(
        or(
          eq(students.counselingDistrict, district),
          sql`${students.counselingDistrict} IS NULL`
        ),
        eq(students.isReleased, false)
      ))
      .orderBy(asc(students.meritNumber))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(students)
      .where(and(
        or(
          eq(students.counselingDistrict, district),
          sql`${students.counselingDistrict} IS NULL`
        ),
        eq(students.isReleased, false)
      ));

    return {
      students: studentsResult,
      total: countResult.count
    };
  }

  async autoLoadEntranceStudents(district: string): Promise<{ loaded: number; skipped: number }> {
    // Get all entrance exam results
    const entranceResults = await db.select().from(studentsEntranceResult)
      .orderBy(asc(studentsEntranceResult.meritNo));

    // Check which students already exist in the preference table
    const existingStudents = await db.select({ appNo: students.appNo })
      .from(students);
    const existingAppNos = new Set(existingStudents.map(s => s.appNo));

    // Filter out students that already exist
    const newStudents = entranceResults.filter(result => !existingAppNos.has(result.applicationNo));

    if (newStudents.length === 0) {
      return { loaded: 0, skipped: entranceResults.length };
    }

    // Convert entrance results to student preference records
    const studentsToInsert = newStudents.map(result => ({
      appNo: result.applicationNo,
      meritNumber: result.meritNo,
      rollNo: result.rollNo,
      name: result.studentName,
      marks: result.marks,
      gender: result.gender,
      category: result.category,
      stream: result.stream || 'NA', // Default to NA if not specified
      counselingDistrict: district,
      choice1: '',
      choice2: '',
      choice3: '',
      choice4: '',
      choice5: '',
      choice6: '',
      choice7: '',
      choice8: '',
      choice9: '',
      choice10: '',
      isLocked: false,
      isReleased: false,
      allocationStatus: 'pending',
    }));

    // Insert the new student records
    const inserted = await db.insert(students)
      .values(studentsToInsert)
      .returning();

    return {
      loaded: inserted.length,
      skipped: entranceResults.length - newStudents.length
    };
  }

  async releaseStudentFromDistrict(studentId: string): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({
        counselingDistrict: null,
        districtAdmin: null,
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
        isReleased: false, // Set to false so student appears in other district admin's lists
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  async fetchStudentToDistrict(studentId: string, counselingDistrict: string, districtAdmin: string): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({
        counselingDistrict: counselingDistrict,
        districtAdmin: districtAdmin,
        isReleased: false,
        stream: sql`COALESCE(${students.stream}, 'NA')`, // Set default stream to NA if null
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  async checkStudentDistrictConflict(studentId: string, newDistrict: string): Promise<{ hasConflict: boolean, currentDistrict?: string }> {
    const student = await this.getStudent(studentId);

    if (!student) {
      return { hasConflict: false };
    }

    // Check if student is already allotted to a district
    if (student.allottedDistrict) {
      return {
        hasConflict: true,
        currentDistrict: student.allottedDistrict
      };
    }

    // Check if student is already selected by another district (and not released)
    if (student.counselingDistrict && student.counselingDistrict !== newDistrict && !student.isReleased) {
      return {
        hasConflict: true,
        currentDistrict: student.counselingDistrict
      };
    }

    return { hasConflict: false };
  }

  // Unlock request operations
  async createUnlockRequest(request: InsertUnlockRequest): Promise<UnlockRequest> {
    const [created] = await db.insert(unlockRequests).values(request).returning();
    return created;
  }

  async getUnlockRequests(): Promise<UnlockRequest[]> {
    return db.select().from(unlockRequests).orderBy(desc(unlockRequests.createdAt));
  }

  async getUnlockRequestsByDistrict(district: string): Promise<UnlockRequest[]> {
    return db.select({
      id: unlockRequests.id,
      studentId: unlockRequests.studentId,
      requestedBy: unlockRequests.requestedBy,
      reason: unlockRequests.reason,
      status: unlockRequests.status,
      reviewedBy: unlockRequests.reviewedBy,
      reviewedAt: unlockRequests.reviewedAt,
      reviewComments: unlockRequests.reviewComments,
      createdAt: unlockRequests.createdAt,
      updatedAt: unlockRequests.updatedAt,
    }).from(unlockRequests)
      .innerJoin(students, eq(unlockRequests.studentId, students.id))
      .where(eq(students.counselingDistrict, district))
      .orderBy(desc(unlockRequests.createdAt));
  }

  async updateUnlockRequest(id: string, updates: Partial<UnlockRequest>): Promise<UnlockRequest> {
    const [updated] = await db
      .update(unlockRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(unlockRequests.id, id))
      .returning();
    return updated;
  }

  async getPendingUnlockRequests(): Promise<UnlockRequest[]> {
    return db.select().from(unlockRequests)
      .where(eq(unlockRequests.status, 'pending'))
      .orderBy(desc(unlockRequests.createdAt));
  }

  // Unfinalize request operations
  async createUnfinalizeRequest(request: InsertUnfinalizeRequest): Promise<UnfinalizeRequest> {
    const [created] = await db.insert(unfinalizeRequests).values(request).returning();
    return created;
  }

  async getUnfinalizeRequests(): Promise<UnfinalizeRequest[]> {
    return db.select().from(unfinalizeRequests).orderBy(desc(unfinalizeRequests.createdAt));
  }

  async getUnfinalizeRequestsByDistrict(district: string): Promise<UnfinalizeRequest[]> {
    return db.select().from(unfinalizeRequests)
      .where(eq(unfinalizeRequests.district, district))
      .orderBy(desc(unfinalizeRequests.createdAt));
  }

  async updateUnfinalizeRequest(id: string, updates: Partial<UnfinalizeRequest>): Promise<UnfinalizeRequest> {
    const [updated] = await db
      .update(unfinalizeRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(unfinalizeRequests.id, id))
      .returning();
    return updated;
  }

  async getPendingUnfinalizeRequests(): Promise<UnfinalizeRequest[]> {
    return db.select().from(unfinalizeRequests)
      .where(eq(unfinalizeRequests.status, 'pending'))
      .orderBy(desc(unfinalizeRequests.createdAt));
  }

  // Year Session operations
  async getYearSessions(): Promise<YearSession[]> {
    return db.select().from(yearSession)
      .orderBy(desc(yearSession.startDate));
  }

  async getYearSession(id: string): Promise<YearSession | undefined> {
    const [session] = await db.select().from(yearSession)
      .where(eq(yearSession.id, id));
    return session;
  }

  async getCurrentYearSession(): Promise<YearSession | undefined> {
    const [session] = await db.select().from(yearSession)
      .where(eq(yearSession.isCurrent, true));
    return session;
  }

  async getYearSessionByName(sessionName: string): Promise<YearSession | undefined> {
    const [session] = await db.select().from(yearSession)
      .where(eq(yearSession.sessionName, sessionName));
    return session;
  }

  async createYearSession(session: InsertYearSession): Promise<YearSession> {
    const [created] = await db
      .insert(yearSession)
      .values({ ...session, updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateYearSession(id: string, updates: Partial<InsertYearSession>): Promise<YearSession> {
    const [updated] = await db
      .update(yearSession)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(yearSession.id, id))
      .returning();
    return updated;
  }

  async setCurrentYearSession(id: string): Promise<YearSession> {
    // First, unset all current sessions
    await db
      .update(yearSession)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(eq(yearSession.isCurrent, true));

    // Then set the specified session as current
    const [updated] = await db
      .update(yearSession)
      .set({ isCurrent: true, updatedAt: new Date() })
      .where(eq(yearSession.id, id))
      .returning();
    return updated;
  }

  // App Document operations
  async getAppDocument(name: string): Promise<AppDocument | undefined> {
    const [doc] = await db.select().from(appDocuments)
      .where(eq(appDocuments.name, name));
    return doc;
  }

  async saveAppDocument(doc: InsertAppDocument): Promise<AppDocument> {
    const existing = await this.getAppDocument(doc.name);
    if (existing) {
      const [updated] = await db.update(appDocuments)
        .set({ ...doc, updatedAt: new Date() })
        .where(eq(appDocuments.name, doc.name))
        .returning();
      return updated;
    }
    const [created] = await db.insert(appDocuments)
      .values(doc)
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
