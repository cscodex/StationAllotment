# Punjab Seat Allotment System - Project Report

## Project Overview

The **Punjab Seat Allotment System** is a comprehensive full-stack web application designed to manage student seat allocation across 23 districts in Punjab, India. It handles the complete lifecycle of seat allocation from data import (student choices and vacancies) to final allocation and export of results.

### Key Features
- **Merit-based Allocation Algorithm**: Processes students in order of merit numbers and allocates them to their highest available preference
- **Multi-round Counseling Support**: Supports multiple counseling rounds per academic year
- **Role-based Access Control**: Central admins have full system access; district admins manage their respective districts
- **Excel/CSV Import**: Bulk upload of student data and vacancies via file processing
- **Real-time Vacancy Tracking**: Dynamic seat availability management at school level (UDISE code based)
- **Audit Logging**: Complete activity tracking for compliance and monitoring
- **Export Functionality**: PDF and CSV exports for allocation results

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI Framework |
| **TypeScript** | Type-safe development |
| **Vite** | Build tooling and dev server |
| **TanStack Query** | Server state management |
| **Wouter** | Client-side routing |
| **shadcn/ui + Radix UI** | Component library |
| **Tailwind CSS** | Styling |
| **React Hook Form + Zod** | Form handling and validation |

### Backend
| Technology | Purpose |
|------------|---------|
| **Express.js** | Web server framework |
| **TypeScript** | Type-safe development |
| **Drizzle ORM** | Database ORM with type-safety |
| **express-session** | Session management |
| **bcrypt** | Password hashing |
| **Multer** | File upload handling |
| **XLSX** | Excel file processing |
| **PDFKit** | PDF generation |

### Database
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary database |
| **Neon** | Serverless PostgreSQL (production) |
| **connect-pg-simple** | PostgreSQL session store |

---

## Project Structure

```
StationAllotment/
├── client/                    # React frontend
│   └── src/
│       ├── components/        # 60+ UI components
│       ├── pages/             # 20 page components
│       ├── hooks/             # Custom React hooks
│       └── lib/               # Utility functions
├── server/                    # Express backend
│   ├── index.ts               # Server entry point
│   ├── routes.ts              # API routes (~142KB)
│   ├── storage.ts             # Data access layer
│   ├── db.ts                  # Database connection
│   └── services/              # Business logic services
├── shared/                    # Shared code
│   └── schema.ts              # Drizzle ORM schema
├── migrations/                # Database migrations (10 files)
├── schema.sql                 # Consolidated database schema
├── data.sql                   # Seed data (users + settings)
├── render.yaml                # Render deployment config
└── package.json               # Dependencies
```

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | Admin users (central + 23 districts) |
| `students` | Student records with 10 preference choices |
| `vacancies` | School seat availability by stream/gender/category |
| `schools` | UDISE code to school name mapping |
| `counseling_rounds` | Academic year/round tracking |
| `students_entrance_result` | Merit-based entrance exam results |
| `district_status` | District finalization tracking |
| `settings` | System configuration |
| `audit_logs` | Activity tracking |
| `file_uploads` | Uploaded file processing status |
| `unlock_requests` | Student record unlock workflow |
| `sessions` | User session storage |

### Key Relationships
- Students reference schools via `allotted_school_udise`
- Vacancies reference schools via `udise_code`
- Students track allocation round via `counseling_round_id`
- All data is scoped by `academic_year` and `round_name`

---

## SQL Files for Deployment

### schema.sql
Complete database schema including:
- All 12 tables with proper relationships
- Foreign key constraints with CASCADE options
- Indexes for optimized queries
- Idempotent creation (IF NOT EXISTS patterns)

### data.sql
Seed data including:
- System settings
- 1 Central Admin user (central_admin / admin123)
- 23 District Admin users (admin_[district] / district123)
- Safe re-run support (ON CONFLICT DO NOTHING)

---

## Deployment Instructions

### Render + Neon Deployment

#### Step 1: Set Up Neon Database
1. Create account at https://console.neon.tech/
2. Create a new database project
3. Copy the connection string from Dashboard → Connection Details
4. Format: `postgresql://[user]:[password]@[host]/[database]?sslmode=require`

#### Step 2: Initialize Database Schema
```bash
# Option 1: Run consolidated SQL files
# In Neon SQL Editor, execute:
# 1. First run schema.sql
# 2. Then run data.sql

# Option 2: Use migration runner
export DATABASE_URL="your-neon-connection-string"
npm install
npm run db:migrate
```

#### Step 3: Deploy to Render
1. Connect GitHub repository to Render
2. Create a Web Service with these settings:
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node

3. Configure environment variables in Render Dashboard:
   ```
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require
   SESSION_SECRET=[generate-64-char-hex]
   NPM_CONFIG_PRODUCTION=false
   ```

4. Deploy and verify at your Render URL

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL (local) or Neon database access

### Quick Start
```bash
# Clone and install
cd StationAllotment
npm install

# Create .env file
# Set DATABASE_URL to your database connection string
echo "DATABASE_URL=postgresql://user:pass@host/db" > .env
echo "SESSION_SECRET=your-secret-here" >> .env

# Run migrations
npm run db:migrate

# Start development server
npm run dev

# Access at http://localhost:5000
```

### Available Scripts
| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run db:migrate` | Run all migrations |
| `npm run db:health` | Check database health |
| `npm run check` | TypeScript type checking |

---

## Current Working State

### ✅ What Works
- User authentication (session-based)
- Role-based access control
- Student data management (CRUD)
- Vacancy management (CRUD)
- File upload and processing (Excel/CSV)
- Seat allocation algorithm
- Multi-counseling round support
- Export to PDF/CSV
- Audit logging
- UDISE code-based school tracking

### ⚠️ Known Limitations
- No automated tests
- No CI/CD pipeline configured
- Large routes.ts file (142KB) needs refactoring
- No API documentation (Swagger/OpenAPI)
- Default passwords in seed data (should be changed in production)

---

## Improvements Needed

### 🔴 Critical (Security)

1. **Change Default Passwords**
   - Central admin and district admin passwords are hardcoded
   - Implement password change requirement on first login
   - Add password complexity requirements

2. **Rate Limiting**
   - No rate limiting on API endpoints
   - Vulnerable to brute-force attacks on login

3. **Input Validation**
   - Ensure all API inputs are validated with Zod
   - Add SQL injection protection tests

### 🟡 Important (Architecture)

1. **Refactor routes.ts**
   - 142KB single file is unmaintainable
   - Split into route modules (auth, students, vacancies, etc.)
   - Use Express Router pattern

2. **Add API Documentation**
   - Implement Swagger/OpenAPI specification
   - Document all endpoints with request/response schemas

3. **Add Automated Tests**
   - Unit tests for allocation algorithm
   - Integration tests for API endpoints
   - E2E tests for critical user flows

4. **Implement CI/CD**
   - GitHub Actions for automated testing
   - Automated deployments to Render
   - Database migration checks

### 🟢 Nice to Have (Features)

1. **Notification System**
   - Email notifications for allocation results
   - SMS integration for critical updates

2. **Analytics Dashboard**
   - Visual charts for allocation statistics
   - District-wise comparison reports

3. **Backup & Recovery**
   - Automated database backups
   - Point-in-time recovery capability

4. **Performance Optimization**
   - Database query optimization
   - Redis caching for frequently accessed data
   - CDN for static assets

5. **Accessibility**
   - WCAG compliance audit
   - Screen reader support
   - Keyboard navigation

6. **Localization**
   - Punjabi language support
   - Hindi language support

---

## Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Central Admin | `central_admin` | `admin123` |
| District Admin (any) | `admin_[district]` | `district123` |

**Examples:**
- `admin_amritsar` / `district123`
- `admin_ludhiana` / `district123`
- `admin_patiala` / `district123`

> ⚠️ **IMPORTANT**: Change all default passwords before using in production!

---

## Conclusion

The Punjab Seat Allotment System is a well-structured full-stack application with robust core functionality. The main areas for improvement are:

1. **Security hardening** (password policies, rate limiting)
2. **Code organization** (refactor massive routes.ts)
3. **Testing infrastructure** (unit, integration, E2E tests)
4. **DevOps maturity** (CI/CD, automated backups)

The `schema.sql` and `data.sql` files provide a clean, idempotent way to initialize the Neon database for deployment to Render.
