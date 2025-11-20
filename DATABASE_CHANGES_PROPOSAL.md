# Database Changes Proposal: UDISE Code Addition

## Current State Analysis

### Vacancies Table - Current Unique Constraint

**Current Structure:**
```sql
CREATE TABLE vacancies (
    id VARCHAR PRIMARY KEY,
    district VARCHAR NOT NULL,
    stream VARCHAR NOT NULL,
    gender VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    total_seats INTEGER DEFAULT 0,
    available_seats INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(district, stream, gender, category)  -- Current unique constraint
);
```

**Current Behavior:**
- One record per combination of: `(district, stream, gender, category)`
- Vacancies are aggregated at district level
- Allocation algorithm uses district-level aggregation
- Key format: `"district|stream|gender|category"`

**Implications:**
- Currently, if multiple schools in the same district have vacancies for the same stream/gender/category, they are combined into one record
- The system doesn't track which specific school a student is allocated to
- Allocation is district-based, not school-based

---

## Proposed Changes

### Option 1: School-Level Vacancies (Recommended)

**Add UDISE Code to Vacancies Table:**
- Makes each vacancy record school-specific
- Allows tracking which school a student is allocated to
- More granular vacancy management

**Changes Required:**
1. Add `udise_code` column to `vacancies` table
2. Add `school_name` column (optional, for display)
3. Update unique constraint to include UDISE code
4. Update allocation algorithm to work with school-level vacancies
5. Add `allotted_school_udise` to `students` table to track allocation

**New Unique Constraint:**
```sql
UNIQUE(udise_code, stream, gender, category)
```

**Pros:**
- More accurate tracking
- Can identify specific schools
- Better reporting capabilities
- More granular control

**Cons:**
- Requires allocation algorithm changes
- More complex vacancy management
- File upload format changes needed

---

### Option 2: District-Level with UDISE Metadata

**Add UDISE Code as Optional Metadata:**
- Keep district-level aggregation
- Add UDISE code for reference only
- Allocation remains district-based

**Changes Required:**
1. Add `udise_code` column to `vacancies` table (nullable)
2. Keep current unique constraint: `UNIQUE(district, stream, gender, category)`
3. No allocation algorithm changes needed

**Pros:**
- Minimal code changes
- Backward compatible
- Simple implementation

**Cons:**
- Cannot track specific school allocations
- UDISE code is just metadata
- Less granular reporting

---

## Recommended Approach: Option 1 (School-Level)

### Tables to Modify

#### 1. Vacancies Table
```sql
ALTER TABLE vacancies 
ADD COLUMN udise_code VARCHAR NOT NULL,
ADD COLUMN school_name VARCHAR;

-- Remove old unique constraint
ALTER TABLE vacancies 
DROP CONSTRAINT IF EXISTS vacancies_district_stream_gender_category_key;

-- Add new unique constraint with UDISE code
ALTER TABLE vacancies 
ADD CONSTRAINT vacancies_udise_stream_gender_category_unique 
UNIQUE(udise_code, stream, gender, category);

-- Add index for faster lookups
CREATE INDEX idx_vacancies_udise_code ON vacancies(udise_code);
CREATE INDEX idx_vacancies_district ON vacancies(district);
```

**New Structure:**
```sql
CREATE TABLE vacancies (
    id VARCHAR PRIMARY KEY,
    udise_code VARCHAR NOT NULL,           -- NEW: School UDISE code
    school_name VARCHAR,                    -- NEW: School name (optional)
    district VARCHAR NOT NULL,
    stream VARCHAR NOT NULL,
    gender VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    total_seats INTEGER DEFAULT 0,
    available_seats INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(udise_code, stream, gender, category)  -- NEW: School-level uniqueness
);
```

#### 2. Students Table
```sql
ALTER TABLE students 
ADD COLUMN allotted_school_udise VARCHAR,
ADD COLUMN allotted_school_name VARCHAR;

-- Add foreign key reference (optional)
ALTER TABLE students 
ADD CONSTRAINT fk_students_allotted_school 
FOREIGN KEY (allotted_school_udise) 
REFERENCES vacancies(udise_code);
```

**New Columns:**
- `allotted_school_udise`: UDISE code of allocated school
- `allotted_school_name`: School name (for display)

#### 3. Students Entrance Result Table
**No changes needed** - UDISE code not relevant here

#### 4. District Status Table
**No changes needed** - District-level tracking remains

---

## Impact Analysis

### Code Changes Required

#### 1. Schema Changes (`shared/schema.ts`)
```typescript
export const vacancies = pgTable("vacancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  udiseCode: varchar("udise_code").notNull(),        // NEW
  schoolName: varchar("school_name"),                // NEW
  district: varchar("district").notNull(),
  stream: varchar("stream").notNull(),
  gender: varchar("gender").notNull(),
  category: varchar("category").notNull(),
  totalSeats: integer("total_seats").default(0),
  availableSeats: integer("available_seats").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.udiseCode, table.stream, table.gender, table.category)  // CHANGED
]);

export const students = pgTable("students", {
  // ... existing fields ...
  allottedSchoolUdise: varchar("allotted_school_udise"),      // NEW
  allottedSchoolName: varchar("allotted_school_name"),         // NEW
  // ... rest of fields ...
});
```

#### 2. Allocation Service Changes (`server/services/allocationService.ts`)

**Current Key Format:**
```typescript
const key = `${vacancy.district}|${vacancy.stream}|${vacancy.gender}|${vacancy.category}`;
```

**New Key Format (Option A - School-Level):**
```typescript
// Group vacancies by district first, then allocate to specific school
const vacancyMap = new Map<string, Vacancy[]>(); // Array of vacancies per key

vacancies.forEach(vacancy => {
  const key = `${vacancy.district}|${vacancy.stream}|${vacancy.gender}|${vacancy.category}`;
  if (!vacancyMap.has(key)) {
    vacancyMap.set(key, []);
  }
  vacancyMap.get(key)!.push(vacancy);
});

// During allocation, select first available school from the array
```

**New Key Format (Option B - District Aggregation with School Tracking):**
```typescript
// Keep district-level aggregation but track which school
const vacancyMap = new Map<string, { count: number, schools: Vacancy[] }>();

vacancies.forEach(vacancy => {
  const key = `${vacancy.district}|${vacancy.stream}|${vacancy.gender}|${vacancy.category}`;
  if (!vacancyMap.has(key)) {
    vacancyMap.set(key, { count: 0, schools: [] });
  }
  const entry = vacancyMap.get(key)!;
  entry.count += vacancy.availableSeats;
  entry.schools.push(vacancy);
});
```

#### 3. File Service Changes (`server/services/fileService.ts`)

**Vacancy File Template Update:**
```typescript
generateVacanciesTemplate(): string {
  const headers = [
    'UDISE Code',      // NEW
    'School Name',     // NEW (optional)
    'District',
    'Stream',
    'Gender',
    'Category',
    'Total Seats',
    'Available Seats'
  ];
  // ... rest of template
}
```

**Vacancy File Parsing:**
- Add UDISE code validation
- Validate UDISE code format (typically 11 digits)
- Ensure UDISE code is present

#### 4. Frontend Changes

**Vacancies Page (`client/src/pages/vacancies.tsx`):**
- Add UDISE code column to table
- Add school name column
- Update filters if needed

**Reports Page:**
- Add school-wise allocation reports
- Show school details in allocation results

**Student Details:**
- Display allocated school UDISE code and name

---

## Migration Strategy

### Step 1: Add Columns (Non-Breaking)
```sql
-- Add new columns as nullable first
ALTER TABLE vacancies 
ADD COLUMN udise_code VARCHAR,
ADD COLUMN school_name VARCHAR;

ALTER TABLE students 
ADD COLUMN allotted_school_udise VARCHAR,
ADD COLUMN allotted_school_name VARCHAR;
```

### Step 2: Data Migration
- Update existing vacancies with UDISE codes (if available)
- Or mark as "DISTRICT_AGGREGATE" for existing records

### Step 3: Make Columns Required
```sql
-- After data migration, make UDISE code required
ALTER TABLE vacancies 
ALTER COLUMN udise_code SET NOT NULL;
```

### Step 4: Update Constraints
```sql
-- Remove old constraint
ALTER TABLE vacancies 
DROP CONSTRAINT IF EXISTS vacancies_district_stream_gender_category_key;

-- Add new constraint
ALTER TABLE vacancies 
ADD CONSTRAINT vacancies_udise_stream_gender_category_unique 
UNIQUE(udise_code, stream, gender, category);
```

### Step 5: Update Application Code
- Update schema definitions
- Update allocation algorithm
- Update file processing
- Update frontend components

---

## Questions for Approval

### 1. Allocation Strategy
**Question:** Should allocation be:
- **A)** School-specific (student allocated to specific school with UDISE code)
- **B)** District-aggregated (student allocated to district, UDISE code is metadata)

**Recommendation:** Option A (School-specific) for better tracking

### 2. UDISE Code Format
**Question:** What is the expected UDISE code format?
- Length: 11 digits (standard format)?
- Format: Numeric only or alphanumeric?
- Validation rules?

**Recommendation:** 11-digit numeric code with validation

### 3. School Name
**Question:** Should we store school name in addition to UDISE code?
- **A)** Yes, for better display and reporting
- **B)** No, UDISE code is sufficient (can be looked up)

**Recommendation:** Option A (Store school name)

### 4. Backward Compatibility
**Question:** How should we handle existing data?
- **A)** Migrate existing vacancies to have UDISE codes
- **B)** Allow null UDISE codes temporarily
- **C)** Create placeholder UDISE codes for existing data

**Recommendation:** Option C (Create placeholder codes like "DISTRICT_AGGREGATE_<district>")

### 5. File Upload Format
**Question:** Should UDISE code be:
- **A)** Required in vacancy upload file
- **B)** Optional (can be added later)

**Recommendation:** Option A (Required) for new uploads

---

## Proposed Implementation Plan

### Phase 1: Database Schema Updates
1. Add `udise_code` and `school_name` to `vacancies` table
2. Add `allotted_school_udise` and `allotted_school_name` to `students` table
3. Update unique constraints
4. Add indexes

### Phase 2: Code Updates
1. Update TypeScript schemas
2. Update allocation algorithm
3. Update file processing
4. Update API endpoints

### Phase 3: Frontend Updates
1. Update vacancy display
2. Update student allocation display
3. Update reports
4. Update file upload templates

### Phase 4: Testing
1. Test with sample data
2. Test allocation algorithm
3. Test file uploads
4. Test reporting

---

## Approval Checklist

Please review and approve:

- [ ] **Allocation Strategy**: School-specific (Option A) or District-aggregated (Option B)
- [ ] **UDISE Code Format**: Confirm format and validation rules
- [ ] **School Name Storage**: Yes or No
- [ ] **Backward Compatibility**: How to handle existing data
- [ ] **File Upload**: UDISE code required or optional
- [ ] **Migration Approach**: Approve migration steps
- [ ] **Implementation Timeline**: Any timeline constraints?

---

## Next Steps After Approval

1. Create migration SQL script
2. Update schema definitions
3. Update allocation algorithm
4. Update file processing
5. Update frontend components
6. Test thoroughly
7. Deploy changes

---

**Status**: ⏳ Awaiting Approval  
**Created**: 2025-11-17  
**Version**: 1.0

