import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  unique,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").notNull().unique(),
  email: varchar("email"),
  password: text("password").notNull(),
  role: varchar("role").notNull(), // 'central_admin' | 'district_admin'
  district: varchar("district"), // null for central_admin
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  credentials: jsonb("credentials"), // Store credentials data from credentials.json
  isBlocked: boolean("is_blocked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Counseling rounds table
export const counselingRounds = pgTable("counseling_rounds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academicYear: varchar("academic_year").notNull(), // '2024-2025'
  roundNumber: integer("round_number").notNull(), // 1, 2, 3, etc. (within each counseling)
  roundName: varchar("round_name").notNull(), // 'First Counseling', 'Second Counseling' - Counseling title
  startDate: timestamp("start_date").notNull(), // Changed to timestamp for datetime support
  endDate: date("end_date"), // Made optional - rounds are completed manually
  isActive: boolean("is_active").default(false),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.academicYear, table.roundName, table.roundNumber), // Unique per academic year, counseling title, and round number
  index("idx_counseling_rounds_academic_year").on(table.academicYear),
  index("idx_counseling_rounds_round_name").on(table.roundName),
  index("idx_counseling_rounds_active").on(table.isActive),
]);

// Students entrance results table
export const studentsEntranceResult = pgTable("students_entrance_result", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academicYear: varchar("academic_year"), // Link to academic year
  meritNo: integer("merit_no").notNull().unique(),
  applicationNo: varchar("application_no").notNull().unique(),
  rollNo: varchar("roll_no").notNull().unique(),
  studentName: varchar("student_name").notNull(),
  marks: integer("marks").notNull(),
  gender: varchar("gender").notNull(), // 'Male' | 'Female' | 'Other'
  category: varchar("category").notNull(), // 'Open' | 'WHH' | 'Disabled' | 'Private'
  stream: varchar("stream"), // 'Medical' | 'Commerce' | 'NonMedical' - optional field
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_students_entrance_result_academic_year").on(table.academicYear),
]);

// Schools table for UDISE code and school name mapping
export const schools = pgTable("schools", {
  udiseCode: varchar("udise_code").primaryKey(),
  schoolName: varchar("school_name").notNull(),
  district: varchar("district").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_schools_district").on(table.district),
]);

// Students table
export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academicYear: varchar("academic_year"), // Which year the student belongs to
  appNo: varchar("app_no").notNull().unique(), // Application number as first data column
  meritNumber: integer("merit_number").notNull().unique(),
  name: varchar("name").notNull(),
  gender: varchar("gender").notNull(), // 'Male' | 'Female' | 'Other'
  category: varchar("category").notNull(), // 'Open' | 'WHH' | 'Disabled' | 'Private'
  stream: varchar("stream").notNull(), // 'Medical' | 'Commerce' | 'NonMedical'
  choice1: varchar("choice1"),
  choice2: varchar("choice2"),
  choice3: varchar("choice3"),
  choice4: varchar("choice4"),
  choice5: varchar("choice5"),
  choice6: varchar("choice6"),
  choice7: varchar("choice7"),
  choice8: varchar("choice8"),
  choice9: varchar("choice9"),
  choice10: varchar("choice10"),
  counselingDistrict: varchar("counseling_district"), // District where counseling was done
  districtAdmin: varchar("district_admin"), // Name of the district admin who set preferences
  allottedDistrict: varchar("allotted_district"),
  allottedStream: varchar("allotted_stream"),
  allottedSchoolUdise: varchar("allotted_school_udise").references(() => schools.udiseCode, { onDelete: 'set null', onUpdate: 'cascade' }), // UDISE code of allocated school
  counselingRoundId: varchar("counseling_round_id").references(() => counselingRounds.id, { onDelete: 'set null', onUpdate: 'cascade' }), // Round when allocated
  counselingRoundNumber: integer("counseling_round_number"), // Round number for quick lookup
  preferencesUpdatedAt: timestamp("preferences_updated_at"), // When preferences were last updated
  allocationStatus: varchar("allocation_status").default('pending'), // 'pending' | 'allotted' | 'not_allotted'
  isLocked: boolean("is_locked").default(false), // Whether preferences are locked for editing
  lockedBy: varchar("locked_by"), // User ID of the admin who has exclusive edit lock
  lockedAt: timestamp("locked_at"), // When the student was locked for editing
  isReleased: boolean("is_released").default(false), // Whether student is released from district
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_students_allotted_school_udise").on(table.allottedSchoolUdise),
  index("idx_students_academic_year").on(table.academicYear),
  index("idx_students_counseling_round_id").on(table.counselingRoundId),
  index("idx_students_counseling_round_number").on(table.counselingRoundNumber),
]);

// Vacancies table
export const vacancies = pgTable("vacancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academicYear: varchar("academic_year"), // Academic year for this vacancy
  udiseCode: varchar("udise_code").references(() => schools.udiseCode, { onDelete: 'restrict', onUpdate: 'cascade' }), // UDISE code of the school (nullable initially for migration)
  district: varchar("district").notNull(),
  stream: varchar("stream").notNull(), // 'Medical' | 'Commerce' | 'NonMedical'
  gender: varchar("gender").notNull(), // 'Male' | 'Female' | 'Other'
  category: varchar("category").notNull(), // 'Open' | 'WHH' | 'Disabled' | 'Private'
  totalSeats: integer("total_seats").default(0),
  availableSeats: integer("available_seats").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.academicYear, table.udiseCode, table.stream, table.gender, table.category), // Unique per year/school/stream/gender/category
  index("idx_vacancies_udise_code").on(table.udiseCode),
  index("idx_vacancies_district").on(table.district),
  index("idx_vacancies_academic_year").on(table.academicYear),
]);

// District status table for tracking finalization
export const districtStatus = pgTable("district_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  district: varchar("district").notNull().unique(),
  isFinalized: boolean("is_finalized").default(false),
  totalStudents: integer("total_students").default(0),
  lockedStudents: integer("locked_students").default(0),
  studentsWithChoices: integer("students_with_choices").default(0),
  finalizedBy: varchar("finalized_by").references(() => users.id),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Settings table for system configuration
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit logs table for compliance tracking
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: varchar("action").notNull(),
  resource: varchar("resource").notNull(),
  resourceId: varchar("resource_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// File uploads table
export const fileUploads = pgTable("file_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: varchar("filename").notNull(),
  originalName: varchar("original_name").notNull(),
  mimeType: varchar("mime_type").notNull(),
  size: integer("size").notNull(),
  type: varchar("type").notNull(), // 'student_choices' | 'vacancies' | 'entrance_results'
  status: varchar("status").default('uploaded'), // 'uploaded' | 'validated' | 'processed' | 'failed'
  validationResults: jsonb("validation_results"),
  academicYear: varchar("academic_year"), // Academic year this file is associated with
  counselingRoundId: varchar("counseling_round_id").references(() => counselingRounds.id), // Active counseling round when file was uploaded
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_file_uploads_academic_year").on(table.academicYear),
  index("idx_file_uploads_counseling_round_id").on(table.counselingRoundId),
]);

// Unlock requests table for district admin unlock requests
export const unlockRequests = pgTable("unlock_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => students.id).notNull(),
  requestedBy: varchar("requested_by").references(() => users.id).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status").default('pending'), // 'pending' | 'approved' | 'rejected'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  auditLogs: many(auditLogs),
  fileUploads: many(fileUploads),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const fileUploadsRelations = relations(fileUploads, ({ one }) => ({
  uploadedByUser: one(users, {
    fields: [fileUploads.uploadedBy],
    references: [users.id],
  }),
}));

export const districtStatusRelations = relations(districtStatus, ({ one }) => ({
  finalizedByUser: one(users, {
    fields: [districtStatus.finalizedBy],
    references: [users.id],
  }),
}));

export const schoolsRelations = relations(schools, ({ many }) => ({
  vacancies: many(vacancies),
  allocatedStudents: many(students),
}));

export const vacanciesRelations = relations(vacancies, ({ one }) => ({
  school: one(schools, {
    fields: [vacancies.udiseCode],
    references: [schools.udiseCode],
  }),
}));

export const counselingRoundsRelations = relations(counselingRounds, ({ many }) => ({
  allocatedStudents: many(students),
}));

export const studentsRelations = relations(students, ({ one }) => ({
  allottedSchool: one(schools, {
    fields: [students.allottedSchoolUdise],
    references: [schools.udiseCode],
  }),
  counselingRound: one(counselingRounds, {
    fields: [students.counselingRoundId],
    references: [counselingRounds.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudentsEntranceResultSchema = createInsertSchema(studentsEntranceResult).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVacancySchema = createInsertSchema(vacancies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  timestamp: true,
});

export const insertFileUploadSchema = createInsertSchema(fileUploads).omit({
  id: true,
  createdAt: true,
});

export const insertUnlockRequestSchema = createInsertSchema(unlockRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDistrictStatusSchema = createInsertSchema(districtStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSchoolSchema = createInsertSchema(schools).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertCounselingRoundSchema = createInsertSchema(counselingRounds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type StudentsEntranceResult = typeof studentsEntranceResult.$inferSelect;
export type InsertStudentsEntranceResult = z.infer<typeof insertStudentsEntranceResultSchema>;
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Vacancy = typeof vacancies.$inferSelect;
export type InsertVacancy = z.infer<typeof insertVacancySchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type FileUpload = typeof fileUploads.$inferSelect;
export type InsertFileUpload = z.infer<typeof insertFileUploadSchema>;
export type UnlockRequest = typeof unlockRequests.$inferSelect;
export type InsertUnlockRequest = z.infer<typeof insertUnlockRequestSchema>;
export type DistrictStatus = typeof districtStatus.$inferSelect;
export type InsertDistrictStatus = z.infer<typeof insertDistrictStatusSchema>;
export type School = typeof schools.$inferSelect;
export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type CounselingRound = typeof counselingRounds.$inferSelect;
export type InsertCounselingRound = z.infer<typeof insertCounselingRoundSchema>;

// Constants - All 23 districts of Punjab (Counseling Districts)
export const DISTRICTS = [
  'Amritsar',
  'Barnala', 
  'Bathinda',
  'Faridkot',
  'Fatehgarh Sahib',
  'Fazilka',
  'Ferozepur',
  'Gurdaspur',
  'Hoshiarpur',
  'Jalandhar',
  'Kapurthala',
  'Ludhiana',
  'Mansa',
  'Moga',
  'Muktsar',
  'Nawanshahr',
  'Pathankot',
  'Patiala',
  'Rupnagar',
  'SAS Nagar',
  'Sangrur',
  'Tarn Taran',
  'Talwara'
] as const;

// School Districts - Only 10 districts have schools
export const SCHOOL_DISTRICTS = [
  'Amritsar',
  'Bathinda', 
  'Ferozepur',
  'Gurdaspur',
  'Jalandhar',
  'Ludhiana',
  'Patiala',
  'Pathankot',
  'SAS Nagar',
  'Sangrur'
] as const;

// Counseling Districts - All 23 districts with district admins
export const COUNSELING_DISTRICTS = DISTRICTS;

export const STREAMS = ['Medical', 'Commerce', 'NonMedical'] as const;
export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const CATEGORIES = ['Open', 'WHH', 'Disabled', 'Private'] as const;
export const USER_ROLES = ['central_admin', 'district_admin'] as const;

// Gender-specific categories
export const FEMALE_CATEGORIES = ['WHH', 'Private', 'Disabled', 'Open'] as const;
export const MALE_CATEGORIES = ['Private', 'Open', 'Disabled'] as const;

// Helper function to get categories based on gender
export function getCategoriesForGender(gender: string): readonly string[] {
  if (gender === 'Female') {
    return FEMALE_CATEGORIES;
  }
  return MALE_CATEGORIES;
}
