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
  isBlocked: boolean("is_blocked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Students entrance results table
export const studentsEntranceResult = pgTable("students_entrance_result", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
});

// Students table
export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  allocationStatus: varchar("allocation_status").default('pending'), // 'pending' | 'allotted' | 'not_allotted'
  isLocked: boolean("is_locked").default(false), // Whether preferences are locked for editing
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Vacancies table
export const vacancies = pgTable("vacancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  district: varchar("district").notNull(),
  stream: varchar("stream").notNull(), // 'Medical' | 'Commerce' | 'NonMedical'
  gender: varchar("gender").notNull(), // 'Male' | 'Female' | 'Other'
  category: varchar("category").notNull(), // 'Open' | 'WHH' | 'Disabled' | 'Private'
  totalSeats: integer("total_seats").default(0),
  availableSeats: integer("available_seats").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.district, table.stream, table.gender, table.category)
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
  type: varchar("type").notNull(), // 'student_choices' | 'vacancies'
  status: varchar("status").default('uploaded'), // 'uploaded' | 'validated' | 'processed' | 'failed'
  validationResults: jsonb("validation_results"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
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

export const insertDistrictStatusSchema = createInsertSchema(districtStatus).omit({
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
export type DistrictStatus = typeof districtStatus.$inferSelect;
export type InsertDistrictStatus = z.infer<typeof insertDistrictStatusSchema>;

// Constants - All 23 districts of Punjab
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
