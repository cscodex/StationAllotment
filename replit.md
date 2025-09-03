# Overview

This is a full-stack web application for a **Seat Allotment System** designed to manage student allocation to districts based on their preferences and available vacancies. The system supports two types of users: Central Admins who manage the overall allocation process and District Admins who can update student preferences within their jurisdiction.

The application handles the complete lifecycle of seat allocation from data import (student choices and vacancies) to final allocation and export of results. It implements a merit-based allocation algorithm that processes students in order of their merit numbers and allocates them to their highest available choice.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React with TypeScript** using Vite for development and build tooling
- **Component-based UI** built with shadcn/ui components and Radix UI primitives
- **Styling** handled by Tailwind CSS with custom design tokens and CSS variables
- **State Management** using TanStack Query for server state and React hooks for local state
- **Routing** implemented with Wouter for client-side navigation
- **Form Handling** using React Hook Form with Zod validation schemas

## Backend Architecture
- **Express.js server** with TypeScript support
- **Session-based authentication** using express-session with PostgreSQL session store
- **File upload handling** with Multer for processing Excel/CSV files
- **Service layer pattern** with dedicated services for:
  - File processing and validation (FileService)
  - Seat allocation algorithm (AllocationService) 
  - Export functionality (ExportService)
  - Audit logging (AuditService)
- **Role-based access control** distinguishing between central_admin and district_admin users

## Data Storage Solutions
- **PostgreSQL database** using Neon serverless with connection pooling
- **Drizzle ORM** for type-safe database queries and schema management
- **Schema-driven development** with shared types between frontend and backend
- **Migration system** using Drizzle Kit for database schema versioning

## Authentication and Authorization
- **Session-based authentication** with secure HTTP-only cookies
- **Password hashing** using bcrypt for secure credential storage
- **Role-based middleware** protecting routes based on user permissions
- **Session persistence** using PostgreSQL session store for scalability

## Key Data Models
- **Users**: Central and district administrators with role-based permissions
- **Students**: Merit-based records with 10 district choices and allocation status
- **Vacancies**: District-wise seat availability by stream (Medical, Commerce, NonMedical)
- **Audit Logs**: Complete activity tracking for compliance and monitoring
- **File Uploads**: Processing status and validation results for imported data

## Allocation Algorithm
- **Merit-based processing** sorting students by merit number (ascending = higher merit first)
- **Sequential choice evaluation** checking choices 1-10 until a match is found
- **Real-time vacancy tracking** decrementing available seats upon allocation
- **Stream-specific allocation** matching student streams to district vacancies
- **Comprehensive result tracking** with allocation status and assignment details

# External Dependencies

## Database Services
- **Neon PostgreSQL** serverless database with WebSocket support for real-time connections
- **Connection pooling** using @neondatabase/serverless for efficient database access

## UI Component Libraries
- **Radix UI** comprehensive set of accessible, unstyled UI primitives
- **shadcn/ui** pre-built component library built on top of Radix UI
- **Lucide React** icon library for consistent iconography

## File Processing
- **Multer** for handling multipart/form-data file uploads
- **XLSX library** for parsing Excel files and CSV processing
- **File validation** with size limits and type checking

## Development Tools
- **Vite** for fast development and optimized production builds
- **TypeScript** for type safety across the entire application
- **ESBuild** for server-side bundling in production
- **Tailwind CSS** for utility-first styling with custom design system

## Authentication & Security
- **express-session** for server-side session management
- **connect-pg-simple** for PostgreSQL session storage
- **bcrypt** for secure password hashing
- **CORS handling** and security middleware

## Data Validation
- **Zod** for runtime type validation and schema definition
- **React Hook Form resolvers** for form validation integration
- **Shared validation schemas** between client and server

## Export Functionality
- **PDFKit** for generating PDF reports of allocation results
- **CSV generation** for spreadsheet-compatible data export
- **Custom export services** with formatted output