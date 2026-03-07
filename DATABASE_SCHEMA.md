# Database Schema & Entity-Relationship (ER) Diagram

This document delineates the core Entity-Relationship architecture for the **Station Allotment** application, derived from the Drizzle ORM schema specifications.

## Entity-Relationship Diagram (Mermaid)

```mermaid
erDiagram
    %% Core Entities
    users {
        varchar id PK
        varchar username
        varchar email
        text password
        varchar role "central_admin | district_admin"
        varchar district
        varchar first_name
        boolean is_blocked
    }

    year_session {
        varchar id PK
        varchar session_name UK
        date start_date
        date end_date
        boolean is_current
        boolean is_active
        varchar created_by FK
    }

    counseling_rounds {
        varchar id PK
        varchar academic_year
        integer round_number
        varchar round_name
        timestamp start_date
        date end_date
        boolean is_active
        boolean is_completed
        boolean is_allocation_completed
        boolean is_allocation_finalized
        varchar allocation_finalized_by FK
    }

    schools {
        varchar udise_code PK
        varchar school_name UK
        varchar district
    }

    students {
        varchar id PK
        varchar academic_year
        varchar app_no UK
        integer merit_number UK
        varchar name
        varchar gender
        varchar category
        varchar stream
        varchar choice1
        varchar choice2
        varchar choice10
        varchar counseling_district
        varchar allotted_district
        varchar allotted_stream
        varchar allotted_school_udise FK
        varchar counseling_round_id FK
        varchar allocation_status "pending | allotted | vacated"
        boolean is_locked
        boolean is_released
    }

    vacancies {
        varchar id PK
        varchar academic_year
        varchar round_name
        varchar udise_code FK
        varchar district
        varchar stream
        varchar gender
        varchar category
        integer total_seats
        integer available_seats
    }

    students_entrance_result {
        varchar id PK
        varchar academic_year
        varchar round_name
        integer merit_no UK
        varchar application_no UK
        varchar roll_no UK
        varchar student_name
        integer marks
        varchar gender
        varchar category
        varchar stream
    }

    district_status {
        varchar id PK
        varchar district
        varchar counseling_round_id FK
        boolean is_finalized
        varchar finalized_by FK
    }

    file_uploads {
        varchar id PK
        varchar filename
        varchar type
        varchar academic_year
        varchar counseling_round_id FK
        varchar uploaded_by FK
        varchar status
    }

    audit_logs {
        varchar id PK
        varchar user_id FK
        varchar action
        varchar resource
        varchar resource_id
    }

    unlock_requests {
        varchar id PK
        varchar student_id FK
        varchar requested_by FK
        varchar status
        varchar reviewed_by FK
    }

    %% Relationships
    users ||--o{ year_session : "creates"
    users ||--o{ district_status : "finalizes"
    users ||--o{ audit_logs : "generates"
    users ||--o{ file_uploads : "uploads"
    users ||--o{ counseling_rounds : "finalizes_allocations"
    users ||--o{ unlock_requests : "requests / reviews"

    schools ||--o{ students : "hosts_allotted_students"
    schools ||--o{ vacancies : "has_open_seats"

    counseling_rounds ||--o{ students : "allocates_in_round"
    counseling_rounds ||--o{ district_status : "tracks_district_state"
    counseling_rounds ||--o{ file_uploads : "receives_files_during"

    students ||--o{ unlock_requests : "requires"
```

## Table Definitions & Relationships

### `users`
- **Purpose**: Tracks system identities, both `central_admin` (system-wide managers) and `district_admin` (focused on localized district inputs).
- **Relations**: 
  - Generates `audit_logs`.
  - Finalizes allocations in `counseling_rounds` and `district_status`.
  - Performs `file_uploads`.

### `year_session`
- **Purpose**: Forms the overarching "Academic Year" boundary (e.g., "2024-2025" or "2025-2026").
- **Notes**: Only one session is considered `isCurrent` at any time.

### `counseling_rounds`
- **Purpose**: Defines an iteration of the counseling process (e.g., Round 1, Round 2) within a specific academic year. 
- **Notes**: Allocations and status tracking happen relative to the active `CounselingRound`.

### `schools`
- **Purpose**: Static directory of physical schools located across 10 specific Punjab districts.
- **Relations**: Uniquely identified by `udiseCode`, which forms a Foreign Key relationship with `vacancies` and `students` (as `allottedSchoolUdise`).

### `students` & `students_entrance_result`
- **Purpose**: `students` holds dynamic user preference configurations, lock states, and final allocation assignments. `students_entrance_result` logs the raw, immutable merit test results imported by CSV.
- **Relations**: A student may be linked to a `school` upon allocation, and their allocation happens relative to a `counseling_round_id`.

### `vacancies`
- **Purpose**: Tracks available seats in specific schools per stream, gender, and category matrix.
- **Notes**: Contains dynamically updated `availableSeats` which deduct automatically upon `student` allocation, and restore upon "vacated" status.

### `district_status`
- **Purpose**: Tracks whether a `district_admin` has completely finished locking all student choices under their jurisdiction *for a specific counseling round*.

### Utilities (`file_uploads`, `audit_logs`, `settings`)
- Tracks user operations, CSV imports, security actions, and raw string configurations.
