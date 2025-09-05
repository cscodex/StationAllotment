import {
  users,
  students,
  studentsEntranceResult,
  vacancies,
  settings,
  auditLogs,
  fileUploads,
  type User,
  type InsertUser,
  type Student,
  type InsertStudent,
  type StudentsEntranceResult,
  type InsertStudentsEntranceResult,
  type Vacancy,
  type InsertVacancy,
  type Setting,
  type InsertSetting,
  type AuditLog,
  type InsertAuditLog,
  type FileUpload,
  type InsertFileUpload,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, asc, sql, or, ilike } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Student operations
  getStudents(limit?: number, offset?: number): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  getStudentByMeritNumber(meritNumber: number): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student>;
  bulkCreateStudents(students: InsertStudent[]): Promise<Student[]>;
  deleteAllStudents(): Promise<void>;
  getStudentsCount(): Promise<number>;
  getStudentsByStatus(status: string): Promise<Student[]>;

  // Students entrance result operations
  getStudentsEntranceResults(limit?: number, offset?: number): Promise<StudentsEntranceResult[]>;
  getStudentsEntranceResult(id: string): Promise<StudentsEntranceResult | undefined>;
  getStudentsEntranceResultsCount(): Promise<number>;
  searchStudentsEntranceResults(query: string): Promise<StudentsEntranceResult[]>;
  createStudentsEntranceResult(result: InsertStudentsEntranceResult): Promise<StudentsEntranceResult>;
  bulkCreateStudentsEntranceResults(results: InsertStudentsEntranceResult[]): Promise<StudentsEntranceResult[]>;
  updateStudentPreferences(studentId: string, preferences: {
    choice1?: string; choice2?: string; choice3?: string; choice4?: string; choice5?: string;
    choice6?: string; choice7?: string; choice8?: string; choice9?: string; choice10?: string;
    counselingDistrict?: string; districtAdmin?: string;
  }): Promise<Student>;

  // Vacancy operations
  getVacancies(): Promise<Vacancy[]>;
  getVacancyByDistrict(district: string): Promise<Vacancy | undefined>;
  createVacancy(vacancy: InsertVacancy): Promise<Vacancy>;
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
    const [user] = await db.select().from(users).where(eq(users.username, username));
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
  async getStudents(limit = 50, offset = 0): Promise<Student[]> {
    return db.select().from(students)
      .orderBy(asc(students.meritNumber))
      .limit(limit)
      .offset(offset);
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

  async getStudentsCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(students);
    return result.count;
  }

  async getStudentsByStatus(status: string): Promise<Student[]> {
    return db.select().from(students)
      .where(eq(students.allocationStatus, status))
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
  }): Promise<Student> {
    const [updated] = await db
      .update(students)
      .set({ ...preferences, updatedAt: new Date() })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  }

  // Vacancy operations
  async getVacancies(): Promise<Vacancy[]> {
    return db.select().from(vacancies).orderBy(asc(vacancies.district));
  }

  async getVacancyByDistrict(district: string): Promise<Vacancy | undefined> {
    const [vacancy] = await db.select().from(vacancies)
      .where(eq(vacancies.district, district));
    return vacancy;
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
      const [result] = await db
        .insert(vacancies)
        .values({ ...vacancy, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [vacancies.district, vacancies.stream, vacancies.gender, vacancies.category],
          set: { 
            totalSeats: vacancy.totalSeats,
            availableSeats: vacancy.availableSeats,
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
}

export const storage = new DatabaseStorage();
