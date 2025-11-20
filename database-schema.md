# Database Schema - ER Diagram

## Mermaid ER Diagram

```mermaid
erDiagram
    users ||--o{ audit_logs : "creates"
    users ||--o{ file_uploads : "uploads"
    users ||--o{ district_status : "finalizes"
    users ||--o{ unlock_requests : "requests"
    users ||--o{ unlock_requests : "reviews"
    
    schools ||--o{ vacancies : "has"
    schools ||--o{ students : "allocates"
    
    students ||--o{ unlock_requests : "has"
    
    users {
        varchar id PK
        varchar username UK
        varchar email
        text password
        varchar role
        varchar district
        varchar first_name
        varchar last_name
        varchar profile_image_url
        jsonb credentials
        boolean is_blocked
        timestamp created_at
        timestamp updated_at
    }
    
    students {
        varchar id PK
        varchar app_no UK
        integer merit_number UK
        varchar name
        varchar gender
        varchar category
        varchar stream
        varchar choice1
        varchar choice2
        varchar choice3
        varchar choice4
        varchar choice5
        varchar choice6
        varchar choice7
        varchar choice8
        varchar choice9
        varchar choice10
        varchar counseling_district
        varchar district_admin
        varchar allotted_district
        varchar allotted_stream
        varchar allotted_school_udise FK
        varchar allocation_status
        boolean is_locked
        varchar locked_by
        timestamp locked_at
        boolean is_released
        timestamp created_at
        timestamp updated_at
    }
    
    students_entrance_result {
        varchar id PK
        integer merit_no UK
        varchar application_no UK
        varchar roll_no UK
        varchar student_name
        integer marks
        varchar gender
        varchar category
        varchar stream
        timestamp created_at
        timestamp updated_at
    }
    
    schools {
        varchar udise_code PK
        varchar school_name
        varchar district
        timestamp created_at
        timestamp updated_at
    }
    
    vacancies {
        varchar id PK
        varchar udise_code FK
        varchar district
        varchar stream
        varchar gender
        varchar category
        integer total_seats
        integer available_seats
        timestamp created_at
        timestamp updated_at
    }
    
    district_status {
        varchar id PK
        varchar district UK
        boolean is_finalized
        integer total_students
        integer locked_students
        integer students_with_choices
        varchar finalized_by FK
        timestamp finalized_at
        timestamp created_at
        timestamp updated_at
    }
    
    settings {
        varchar id PK
        varchar key UK
        text value
        text description
        timestamp created_at
        timestamp updated_at
    }
    
    audit_logs {
        varchar id PK
        varchar user_id FK
        varchar action
        varchar resource
        varchar resource_id
        jsonb details
        varchar ip_address
        text user_agent
        timestamp timestamp
    }
    
    file_uploads {
        varchar id PK
        varchar filename
        varchar original_name
        varchar mime_type
        integer size
        varchar type
        varchar status
        jsonb validation_results
        varchar uploaded_by FK
        timestamp created_at
    }
    
    unlock_requests {
        varchar id PK
        varchar student_id FK
        varchar requested_by FK
        text reason
        varchar status
        varchar reviewed_by FK
        timestamp reviewed_at
        text review_comments
        timestamp created_at
        timestamp updated_at
    }
    
    sessions {
        varchar sid PK
        jsonb sess
        timestamp expire
    }
```

## Table Relationships

### Primary Relationships:
1. **users** → **audit_logs** (one-to-many): Users create audit log entries
2. **users** → **file_uploads** (one-to-many): Users upload files
3. **users** → **district_status** (one-to-many): Users finalize districts
4. **users** → **unlock_requests** (one-to-many): Users request/review unlock requests
5. **schools** → **vacancies** (one-to-many): Schools have multiple vacancies
6. **schools** → **students** (one-to-many): Schools allocate students
7. **students** → **unlock_requests** (one-to-many): Students have unlock requests

### Unique Constraints:
- **vacancies**: `UNIQUE(udise_code, stream, gender, category)` - One vacancy per school/stream/gender/category combination
- **users**: `UNIQUE(username)` - Unique username
- **students**: `UNIQUE(app_no)`, `UNIQUE(merit_number)` - Unique application and merit numbers
- **students_entrance_result**: `UNIQUE(merit_no)`, `UNIQUE(application_no)`, `UNIQUE(roll_no)` - Unique identifiers
- **district_status**: `UNIQUE(district)` - One status per district
- **settings**: `UNIQUE(key)` - Unique setting keys

### Foreign Key Constraints:
- **vacancies.udise_code** → **schools.udise_code** (RESTRICT on delete, CASCADE on update)
- **students.allotted_school_udise** → **schools.udise_code** (SET NULL on delete, CASCADE on update)
- **audit_logs.user_id** → **users.id**
- **file_uploads.uploaded_by** → **users.id**
- **district_status.finalized_by** → **users.id**
- **unlock_requests.student_id** → **students.id**
- **unlock_requests.requested_by** → **users.id**
- **unlock_requests.reviewed_by** → **users.id**

## Indexes

### Performance Indexes:
- `idx_schools_district` on `schools(district)`
- `idx_vacancies_udise_code` on `vacancies(udise_code)`
- `idx_vacancies_district` on `vacancies(district)`
- `idx_students_allotted_school_udise` on `students(allotted_school_udise)`
- `IDX_session_expire` on `sessions(expire)`

## Notes

- **UDISE Code**: Unique identifier for schools (11 digits)
- **Allocation**: Students are allocated to specific schools via `allotted_school_udise`
- **Vacancies**: Tracked at school level (one record per school/stream/gender/category)
- **Session Management**: Uses `connect-pg-simple` for session storage


