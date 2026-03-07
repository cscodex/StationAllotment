CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"action" varchar NOT NULL,
	"resource" varchar NOT NULL,
	"resource_id" varchar,
	"details" jsonb,
	"ip_address" varchar,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "counseling_rounds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year" varchar NOT NULL,
	"round_number" integer NOT NULL,
	"round_name" varchar NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT false,
	"is_completed" boolean DEFAULT false,
	"is_suspended" boolean DEFAULT false,
	"is_allocation_completed" boolean DEFAULT false,
	"is_allocation_finalized" boolean DEFAULT false,
	"allocation_finalized_at" timestamp,
	"allocation_finalized_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "counseling_rounds_academic_year_round_name_round_number_unique" UNIQUE("academic_year","round_name","round_number")
);
--> statement-breakpoint
CREATE TABLE "district_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district" varchar NOT NULL,
	"counseling_round_id" varchar,
	"is_finalized" boolean DEFAULT false,
	"total_students" integer DEFAULT 0,
	"locked_students" integer DEFAULT 0,
	"students_with_choices" integer DEFAULT 0,
	"finalized_by" varchar,
	"finalized_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "district_status_district_counseling_round_id_unique" UNIQUE("district","counseling_round_id")
);
--> statement-breakpoint
CREATE TABLE "file_uploads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" varchar NOT NULL,
	"original_name" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"size" integer NOT NULL,
	"type" varchar NOT NULL,
	"status" varchar DEFAULT 'uploaded',
	"validation_results" jsonb,
	"academic_year" varchar,
	"counseling_round_id" varchar,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"udise_code" varchar PRIMARY KEY NOT NULL,
	"school_name" varchar NOT NULL,
	"district" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "schools_school_name_unique" UNIQUE("school_name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year" varchar,
	"app_no" varchar NOT NULL,
	"merit_number" integer NOT NULL,
	"name" varchar NOT NULL,
	"gender" varchar NOT NULL,
	"category" varchar NOT NULL,
	"stream" varchar NOT NULL,
	"choice1" varchar,
	"choice2" varchar,
	"choice3" varchar,
	"choice4" varchar,
	"choice5" varchar,
	"choice6" varchar,
	"choice7" varchar,
	"choice8" varchar,
	"choice9" varchar,
	"choice10" varchar,
	"counseling_district" varchar,
	"district_admin" varchar,
	"allotted_district" varchar,
	"allotted_stream" varchar,
	"allotted_school_udise" varchar,
	"counseling_round_id" varchar,
	"counseling_round_number" integer,
	"preferences_updated_at" timestamp,
	"allocation_status" varchar DEFAULT 'pending',
	"is_locked" boolean DEFAULT false,
	"locked_by" varchar,
	"locked_at" timestamp,
	"is_released" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "students_app_no_unique" UNIQUE("app_no"),
	CONSTRAINT "students_merit_number_unique" UNIQUE("merit_number")
);
--> statement-breakpoint
CREATE TABLE "students_entrance_result" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year" varchar,
	"round_name" varchar,
	"merit_no" integer NOT NULL,
	"application_no" varchar NOT NULL,
	"roll_no" varchar NOT NULL,
	"student_name" varchar NOT NULL,
	"marks" integer NOT NULL,
	"gender" varchar NOT NULL,
	"category" varchar NOT NULL,
	"stream" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "students_entrance_result_merit_no_unique" UNIQUE("merit_no"),
	CONSTRAINT "students_entrance_result_application_no_unique" UNIQUE("application_no"),
	CONSTRAINT "students_entrance_result_roll_no_unique" UNIQUE("roll_no")
);
--> statement-breakpoint
CREATE TABLE "unlock_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"requested_by" varchar NOT NULL,
	"reason" text NOT NULL,
	"status" varchar DEFAULT 'pending',
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_comments" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar NOT NULL,
	"email" varchar,
	"password" text NOT NULL,
	"role" varchar NOT NULL,
	"district" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"credentials" jsonb,
	"is_blocked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vacancies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year" varchar,
	"round_name" varchar,
	"udise_code" varchar,
	"district" varchar NOT NULL,
	"stream" varchar NOT NULL,
	"gender" varchar NOT NULL,
	"category" varchar NOT NULL,
	"total_seats" integer DEFAULT 0,
	"available_seats" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "vacancies_academic_year_round_name_udise_code_stream_gender_category_unique" UNIQUE("academic_year","round_name","udise_code","stream","gender","category")
);
--> statement-breakpoint
CREATE TABLE "year_session" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_name" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "year_session_session_name_unique" UNIQUE("session_name")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counseling_rounds" ADD CONSTRAINT "counseling_rounds_allocation_finalized_by_users_id_fk" FOREIGN KEY ("allocation_finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_status" ADD CONSTRAINT "district_status_counseling_round_id_counseling_rounds_id_fk" FOREIGN KEY ("counseling_round_id") REFERENCES "public"."counseling_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_status" ADD CONSTRAINT "district_status_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_counseling_round_id_counseling_rounds_id_fk" FOREIGN KEY ("counseling_round_id") REFERENCES "public"."counseling_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_allotted_school_udise_schools_udise_code_fk" FOREIGN KEY ("allotted_school_udise") REFERENCES "public"."schools"("udise_code") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_counseling_round_id_counseling_rounds_id_fk" FOREIGN KEY ("counseling_round_id") REFERENCES "public"."counseling_rounds"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "unlock_requests" ADD CONSTRAINT "unlock_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlock_requests" ADD CONSTRAINT "unlock_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlock_requests" ADD CONSTRAINT "unlock_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_udise_code_schools_udise_code_fk" FOREIGN KEY ("udise_code") REFERENCES "public"."schools"("udise_code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "year_session" ADD CONSTRAINT "year_session_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_counseling_rounds_academic_year" ON "counseling_rounds" USING btree ("academic_year");--> statement-breakpoint
CREATE INDEX "idx_counseling_rounds_round_name" ON "counseling_rounds" USING btree ("round_name");--> statement-breakpoint
CREATE INDEX "idx_counseling_rounds_active" ON "counseling_rounds" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_district_status_district" ON "district_status" USING btree ("district");--> statement-breakpoint
CREATE INDEX "idx_district_status_counseling_round_id" ON "district_status" USING btree ("counseling_round_id");--> statement-breakpoint
CREATE INDEX "idx_file_uploads_academic_year" ON "file_uploads" USING btree ("academic_year");--> statement-breakpoint
CREATE INDEX "idx_file_uploads_counseling_round_id" ON "file_uploads" USING btree ("counseling_round_id");--> statement-breakpoint
CREATE INDEX "idx_schools_district" ON "schools" USING btree ("district");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_students_allotted_school_udise" ON "students" USING btree ("allotted_school_udise");--> statement-breakpoint
CREATE INDEX "idx_students_academic_year" ON "students" USING btree ("academic_year");--> statement-breakpoint
CREATE INDEX "idx_students_counseling_round_id" ON "students" USING btree ("counseling_round_id");--> statement-breakpoint
CREATE INDEX "idx_students_counseling_round_number" ON "students" USING btree ("counseling_round_number");--> statement-breakpoint
CREATE INDEX "idx_students_entrance_result_academic_year" ON "students_entrance_result" USING btree ("academic_year");--> statement-breakpoint
CREATE INDEX "idx_students_entrance_result_round_name" ON "students_entrance_result" USING btree ("round_name");--> statement-breakpoint
CREATE INDEX "idx_vacancies_udise_code" ON "vacancies" USING btree ("udise_code");--> statement-breakpoint
CREATE INDEX "idx_vacancies_district" ON "vacancies" USING btree ("district");--> statement-breakpoint
CREATE INDEX "idx_vacancies_academic_year" ON "vacancies" USING btree ("academic_year");--> statement-breakpoint
CREATE INDEX "idx_vacancies_round_name" ON "vacancies" USING btree ("round_name");--> statement-breakpoint
CREATE INDEX "idx_year_session_session_name" ON "year_session" USING btree ("session_name");--> statement-breakpoint
CREATE INDEX "idx_year_session_active" ON "year_session" USING btree ("is_active");