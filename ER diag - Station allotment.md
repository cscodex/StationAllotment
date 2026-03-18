# ER Diagram - Station Allotment System

This diagram illustrates the relationships between the core entities in the Station Allotment database.

```mermaid
erDiagram
    USERS ||--o{ AUDIT_LOGS : "performs"
    USERS ||--o{ FILE_UPLOADS : "manages"
    USERS ||--o{ DISTRICT_STATUS : "finalizes"
    USERS ||--o{ UNLOCK_REQUESTS : "requests/reviews"
    USERS ||--o{ UNFINALIZE_REQUESTS : "requests/reviews"
    USERS ||--o{ YEAR_SESSION : "creates"

    COUNSELING_ROUNDS ||--o{ STUDENTS : "allocates during"
    COUNSELING_ROUNDS ||--o{ DISTRICT_STATUS : "tracks status for"
    COUNSELING_ROUNDS ||--o{ FILE_UPLOADS : "associated with"
    COUNSELING_ROUNDS ||--o{ UNFINALIZE_REQUESTS : "subject of"

    SCHOOLS ||--o{ STUDENTS : "receives allotment"
    SCHOOLS ||--o{ VACANCIES : "has capacity in"

    STUDENTS ||--o{ UNLOCK_REQUESTS : "targeted by"

    USERS {
        varchar id PK
        varchar username
        varchar role
        varchar district
        jsonb credentials
        boolean isBlocked
    }

    COUNSELING_ROUNDS {
        varchar id PK
        varchar academicYear
        integer roundNumber
        varchar roundName
        boolean isActive
        boolean isAllocationFinalized
        timestamp start_date
    }

    STUDENTS {
        varchar id PK
        varchar appNo
        integer meritNumber
        varchar name
        varchar stream
        varchar choice1_10
        boolean isLocked
        text omrImageUrl
        varchar allottedSchoolUdise FK
        varchar counselingRoundId FK
    }

    SCHOOLS {
        varchar udiseCode PK
        varchar schoolName
        varchar district
    }

    VACANCIES {
        varchar id PK
        varchar academicYear
        varchar udiseCode FK
        varchar district
        varchar stream
        integer availableSeats
    }

    DISTRICT_STATUS {
        varchar id PK
        varchar district
        varchar counselingRoundId FK
        boolean isFinalized
    }

    AUDIT_LOGS {
        varchar id PK
        varchar userId FK
        varchar action
        varchar resource
        jsonb details
        timestamp timestamp
    }

    FILE_UPLOADS {
        varchar id PK
        varchar filename
        varchar type
        varchar status
        varchar uploadedBy FK
        varchar counselingRoundId FK
    }

    UNLOCK_REQUESTS {
        varchar id PK
        varchar studentId FK
        varchar requestedBy FK
        varchar status
        text reason
    }

    UNFINALIZE_REQUESTS {
        varchar id PK
        varchar district
        varchar requestedBy FK
        varchar status
    }

    SESSIONS {
        varchar sid PK
        jsonb sess
        timestamp expire
    }

    APP_DOCUMENTS {
        varchar id PK
        varchar name
        text dataBase64
    }
```

## Entity Descriptions

- **USERS**: System administrators (Central and District).
- **STUDENTS**: Core student data including their merit, preferences (1-10), and allotment results.
- **SCHOOLS**: Master list of schools with UDISE codes.
- **VACANCIES**: Available seats per school, stream, gender, and category.
- **COUNSELING_ROUNDS**: Defines specific phases of the allocation process.
- **DISTRICT_STATUS**: Tracks whether a district has finalized their allocations for a specific round.
- **UNLOCK/UNFINALIZE_REQUESTS**: Workflow entities for requesting administrative overrides.
- **AUDIT_LOGS**: Comprehensive tracking of all administrative actions for compliance.
- **APP_DOCUMENTS**: Storage for static system assets like flow diagrams.
