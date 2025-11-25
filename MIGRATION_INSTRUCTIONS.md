# Database Migration Instructions

## Pending Migrations

The following schema changes have been made but **migrations have not been run yet**:

1. **Change `start_date` from DATE to TIMESTAMP**
   - File: `migrations/change_start_date_to_timestamp.sql`
   - Purpose: Support datetime values with time component for counseling round start dates
   - Impact: Existing date values will be converted to timestamps at midnight (00:00:00)

2. **Add `is_suspended` column to `counseling_rounds` table**
   - File: `migrations/add_is_suspended_to_counseling_rounds.sql`
   - Purpose: Allow admins to suspend subsequent round auto-creation for a counseling title
   - Impact: Adds a new boolean column (default: false) to control round auto-creation

## How to Run Migrations

### Option 1: Run All Migrations (Recommended)

This will run all migrations including the new ones:

```bash
# Make sure DATABASE_URL is set
export DATABASE_URL="your-database-connection-string"

# Run all migrations
npm run db:migrate
```

### Option 2: Run Individual Migrations

If you only need to run the new migrations:

```bash
# Set DATABASE_URL
export DATABASE_URL="your-database-connection-string"

# Run the start_date migration
npx tsx run-migration.ts migrations/change_start_date_to_timestamp.sql

# Run the is_suspended migration
npx tsx run-migration.ts migrations/add_is_suspended_to_counseling_rounds.sql
```

### Option 3: Run via Database Client

You can also run the SQL files directly using your database client (psql, DBeaver, etc.):

1. Connect to your database
2. Open and execute `migrations/change_start_date_to_timestamp.sql`
3. Open and execute `migrations/add_is_suspended_to_counseling_rounds.sql`

## Verify Migrations

After running migrations, verify they succeeded:

```bash
npx tsx check-database-health.ts
```

Or manually check:

```sql
-- Verify start_date is TIMESTAMP
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'counseling_rounds' AND column_name = 'start_date';

-- Verify is_suspended column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'counseling_rounds' AND column_name = 'is_suspended';
```

## Important Notes

- **Backup your database** before running migrations in production
- The `change_start_date_to_timestamp.sql` migration includes error handling and will skip if already migrated
- The `add_is_suspended_to_counseling_rounds.sql` migration uses `IF NOT EXISTS` so it's safe to run multiple times
- If you get permission errors, you may need to run as a database superuser or grant ALTER TABLE permissions

## For Render/Production Deployment

If deploying to Render:

1. Get your `DATABASE_URL` from Render Dashboard → Environment
2. Set it locally: `export DATABASE_URL="your-render-database-url"`
3. Run migrations: `npm run db:migrate`
4. Verify: `npx tsx check-database-health.ts`
5. Restart your Render service

