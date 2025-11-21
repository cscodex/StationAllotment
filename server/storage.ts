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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, asc, sql, or, ilike } from "drizzle-orm";

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
  getStudents(limit?: number, offset?: number, academicYear?: string, roundNumber?: number): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  getStudentByMeritNumber(meritNumber: number): Promise<Student | undefined>;
  getStudentsByYearAndRound(academicYear: string, roundNumber: number): Promise<Student[]>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student>;
  bulkCreateStudents(students: InsertStudent[]): Promise<Student[]>;
  deleteAllStudents(): Promise<void>;
  getStudentsCount(academicYear?: string): Promise<number>;
  getStudentsByStatus(status: string, academicYear?: string): Promise<Student[]>;

  // Students entrance result operations
  getStudentsEntranceResults(limit?: number, offset?: number): Promise<StudentsEntranceResult[]>;
  getStudentsEntranceResult(id: string): Promise<StudentsEntranceResult | undefined>;
  getStudentsEntranceResultByMeritNumber(meritNumber: number): Promise<StudentsEntranceResult | undefined>;
  getStudentsEntranceResultsCount(): Promise<number>;
  searchStudentsEntranceResults(query: string): Promise<StudentsEntranceResult[]>;
  createStudentsEntranceResult(result: InsertStudentsEntranceResult): Promise<StudentsEntranceResult>;
  bulkCreateStudentsEntranceResults(results: InsertStudentsEntranceResult[]): Promise<StudentsEntranceResult[]>;
  updateStudentPreferences(studentId: string, preferences: {
    choice1?: string; choice2?: string; choice3?: string; choice4?: string; choice5?: string;
    choice6?: string; choice7?: string; choice8?: string; choice9?: string; choice10?: string;
    counselingDistrict?: string; districtAdmin?: string;
    counselingRoundId?: string;
    counselingRoundNumber?: number;
    preferencesUpdatedAt?: Date;
  }): Promise<Student>;
  checkStudentDistrictConflict(studentId: string, newDistrict: string): Promise<{hasConflict: boolean, currentDistrict?: string}>;
  releaseAssignment(studentId: string): Promise<Student>;

  // School operations
  getSchool(udiseCode: string): Promise<School | undefined>;
  getAllSchools(): Promise<School[]>;
  getSchoolsByDistrict(district: string): Promise<School[]>;
  createSchool(school: InsertSchool): Promise<School>;
  bulkUpsertSchools(schools: InsertSchool[]): Promise<School[]>;

  // Counseling round operations
  getCounselingRounds(academicYear?: string): Promise<CounselingRound[]>;
  getCounselingRound(id: string): Promise<CounselingRound | undefined>;
  getActiveCounselingRound(academicYear: string): Promise<CounselingRound | undefined>;
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
  updateVacancy(id: string, vacancy: Partial<InsertVacancy>): Promise<Vacancy>;
  bulkUpsertVacancies(vacancies: InsertVacancy[]): Promise<Vacancy[]>;
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

  // District status operations
  getDistrictStatus(district: string): Promise<DistrictStatus | undefined>;
  getAllDistrictStatuses(): Promise<DistrictStatus[]>;
  createOrUpdateDistrictStatus(status: InsertDistrictStatus): Promise<DistrictStatus>;
  finalizeDistrict(district: string, userId: string): Promise<DistrictStatus>;

  // Student locking operations
  lockStudent(studentId: string, userId: string): Promise<Student>;
  unlockStudent(studentId: string): Promise<Student>;
  canEditStudent(studentId: string, userId: string): Promise<boolean>;
  lockStudentForEdit(studentId: string, userId: string): Promise<{ success: boolean; message: string; student?: Student }>;
  getStudentsByDistrict(district: string, limit?: number, offset?: number): Promise<{students: Student[], total: number}>;
  autoLoadEntranceStudents(district: string): Promise<{ loaded: number; skipped: number }>;
  releaseStudentFromDistrict(studentId: string): Promise<Student>;
  fetchStudentToDistrict(studentId: string, counselingDistrict: string, districtAdmin: string): Promise<Student>;

  // Unlock request operations
  createUnlockRequest(request: InsertUnlockRequest): Promise<UnlockRequest>;
  getUnlockRequests(): Promise<UnlockRequest[]>;
  getUnlockRequestsByDistrict(district: string): Promise<UnlockRequest[]>;
  updateUnlockRequest(id: string, updates: Partial<UnlockRequest>): Promise<UnlockRequest>;
  getPendingUnlockRequests(): Promise<UnlockRequest[]>;

  // Statistics
  getDashboardStats(): Promise<{
    totalStudents: number;
    totalVacancies: number;
    pendingAllocations: number;
    completionRate: number;
  }>;
}

export class DatabaseStorage implements IStorage {
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
  async getStudents(limit?: number, offset?: number, academicYear?: string, roundNumber?: number): Promise<Student[]> {
    const conditions = [];
    if (academicYear) {
      conditions.push(eq(students.academicYear, academicYear));
    }
    if (roundNumber !== undefined) {
      conditions.push(eq(students.counselingRoundNumber, roundNumber));
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

  async bulkCreateStudents(studentsList: InsertStudent[]): Promise<Student[]> {
    return db
      .insert(students)
      .values(studentsList.map(s => ({ ...s, updatedAt: new Date() })))
      .returning();
  }

  async deleteAllStudents(): Promise<void> {
    await db.delete(students);
  }

  async getStudentsCount(academicYear?: string): Promise<number> {
    if (academicYear) {
      const [result] = await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.academicYear, academicYear));
      return result.count;
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(students);
    return result.count;
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
    return result.count;
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

  async bulkCreateStudentsEntranceResults(results: InsertStudentsEntranceResult[]): Promise<StudentsEntranceResult[]> {
    return db
      .insert(studentsEntranceResult)
      .values(results.map(r => ({ ...r, updatedAt: new Date() })))
      .returning();
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
    if (academicYear) {
      return db.select().from(counselingRounds)
        .where(eq(counselingRounds.academicYear, academicYear))
        .orderBy(asc(counselingRounds.roundName), asc(counselingRounds.roundNumber));
    }
    return db.select().from(counselingRounds)
      .orderBy(desc(counselingRounds.academicYear), asc(counselingRounds.roundName), asc(counselingRounds.roundNumber));
  }

  async getCounselingRound(id: string): Promise<CounselingRound | undefined> {
    const [round] = await db.select().from(counselingRounds)
      .where(eq(counselingRounds.id, id));
    return round;
  }

  async getActiveCounselingRound(academicYear: string): Promise<CounselingRound | undefined> {
    const [round] = await db.select().from(counselingRounds)
      .where(and(
        eq(counselingRounds.academicYear, academicYear),
        eq(counselingRounds.isActive, true)
      ))
      .limit(1);
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
    
    if (allVacancies.length === 0) {
      // No vacancies means seats are "filled" (nothing to fill)
      return true;
    }
    
    // Check if any vacancy has available seats
    const hasAvailableSeats = allVacancies.some(v => (v.availableSeats || 0) > 0);
    
    // If no vacancies have available seats, all seats are filled
    return !hasAvailableSeats;
  }

  async createVacancy(vacancy: InsertVacancy): Promise<Vacancy> {
    const [created] = await db
      .insert(vacancies)
      .values({ ...vacancy, updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateVacancy(id: string, vacancy: Partial<InsertVacancy>): Promise<Vacancy> {
    const [updated] = await db
      .update(vacancies)
      .set({ ...vacancy, updatedAt: new Date() })
      .where(eq(vacancies.id, id))
      .returning();
    return updated;
  }

  async bulkUpsertVacancies(vacanciesList: InsertVacancy[]): Promise<Vacancy[]> {
    const results = [];
    for (const vacancy of vacanciesList) {
      // New unique constraint: academicYear, udiseCode, stream, gender, category
      if (!vacancy.udiseCode) {
        // Skip vacancies without UDISE code (should not happen in production)
        console.warn('Skipping vacancy without UDISE code:', vacancy);
        continue;
      }
      if (!vacancy.academicYear) {
        console.warn('Skipping vacancy without academic year:', vacancy);
        continue;
      }
      const [result] = await db
        .insert(vacancies)
        .values({ ...vacancy, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [vacancies.academicYear, vacancies.udiseCode, vacancies.stream, vacancies.gender, vacancies.category],
          set: { 
            totalSeats: vacancy.totalSeats,
            availableSeats: vacancy.availableSeats,
            district: vacancy.district, // Update district in case it changed
            updatedAt: new Date(),
          },
        })
        .returning();
      results.push(result);
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
  async getDashboardStats(): Promise<{
    totalStudents: number;
    totalVacancies: number;
    pendingAllocations: number;
    completionRate: number;
  }> {
    // Get total students from entrance results (all students who took the entrance exam)
    const [entranceResultsCount] = await db.select({ count: sql<number>`count(*)` }).from(studentsEntranceResult);
    
    // Get allocation status counts from students table (only those with preferences set)
    const [studentsWithPreferencesCount] = await db.select({ count: sql<number>`count(*)` }).from(students);
    const [pendingCount] = await db.select({ count: sql<number>`count(*)` })
      .from(students)
      .where(eq(students.allocationStatus, 'pending'));
    const [allottedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(students)
      .where(eq(students.allocationStatus, 'allotted'));
    const [notAllottedCount] = await db.select({ count: sql<number>`count(*)` })
      .from(students)
      .where(eq(students.allocationStatus, 'not_allotted'));

    const vacancyResults = await db.select({
      total: sql<number>`sum(total_seats)`
    }).from(vacancies);

    const totalVacancies = vacancyResults[0]?.total || 0;
    const totalStudents = entranceResultsCount.count; // Use entrance results count
    // Pending allocations = students without preferences + students with pending status
    const studentsWithoutPreferences = totalStudents - studentsWithPreferencesCount.count;
    const pendingAllocations = studentsWithoutPreferences + pendingCount.count;
    const completionRate = totalStudents > 0 ? (allottedCount.count / totalStudents) * 100 : 0;

    return {
      totalStudents, // Total from entrance results
      totalVacancies,
      pendingAllocations, // Students without preferences + pending students
      completionRate: Math.round(completionRate * 10) / 10,
    };
  }

  // District status operations
  async getDistrictStatus(district: string): Promise<DistrictStatus | undefined> {
    const [status] = await db.select().from(districtStatus).where(eq(districtStatus.district, district));
    return status;
  }

  async getAllDistrictStatuses(): Promise<DistrictStatus[]> {
    return db.select().from(districtStatus).orderBy(asc(districtStatus.district));
  }

  async createOrUpdateDistrictStatus(status: InsertDistrictStatus): Promise<DistrictStatus> {
    const existing = await this.getDistrictStatus(status.district);
    
    if (existing) {
      const [updated] = await db
        .update(districtStatus)
        .set({ ...status, updatedAt: new Date() })
        .where(eq(districtStatus.district, status.district))
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

  async finalizeDistrict(district: string, userId: string): Promise<DistrictStatus> {
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
      isFinalized: true,
      totalStudents: eligibleStudents.length, // Only count eligible students
      lockedStudents: lockedEligibleStudents,
      studentsWithChoices,
      finalizedBy: userId,
      finalizedAt: new Date(),
    };

    return await this.createOrUpdateDistrictStatus(statusData);
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

  async getStudentsByDistrict(district: string, limit = 50, offset = 0): Promise<{students: Student[], total: number}> {
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
      stream: result.stream || 'NonMedical', // Default to NonMedical if not specified
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
        stream: sql`COALESCE(${students.stream}, 'Non-Medical')`, // Set default stream to Non-Medical if null
        updatedAt: new Date()
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  async checkStudentDistrictConflict(studentId: string, newDistrict: string): Promise<{hasConflict: boolean, currentDistrict?: string}> {
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
}

export const storage = new DatabaseStorage();
