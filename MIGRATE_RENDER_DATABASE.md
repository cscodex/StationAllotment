# How to Migrate Render Database

## Problem
You're seeing errors like:
```
relation "counseling_rounds" does not exist
```

This means the Render deployment is using a database that hasn't been migrated yet.

## Solution: Run Migrations on Render's Database

### Step 1: Get Render's DATABASE_URL

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click on your service (e.g., `stationallotment`)
3. Go to **Environment** tab
4. Find `DATABASE_URL` in the environment variables
5. **Copy the entire connection string**

   It will look like:
   ```
   postgresql://neondb_owner:password@ep-xxxxx-xxxxx.region.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2: Run Migrations Locally

Open your terminal and run:

```bash
# Navigate to your project
cd /path/to/stationallotment

# Set the DATABASE_URL to Render's database
export DATABASE_URL="[paste-the-connection-string-from-render-here]"

# Verify connection (optional but recommended)
npx tsx check-database-health.ts

# Run all migrations
npm run db:migrate
```

### Step 3: Verify Migrations Succeeded

After migrations complete, verify:

```bash
npx tsx check-database-health.ts
```

You should see:
- ✅ All required tables exist
- ✅ All indexes created
- ✅ All constraints configured

### Step 4: Restart Render Service

1. Go back to Render Dashboard
2. Click on your service
3. Click **Manual Deploy** → **Clear build cache & deploy**
4. Or wait for the next auto-deploy

## Alternative: Run Migrations via Render Shell

If you prefer to run migrations directly on Render:

1. Go to Render Dashboard → Your Service
2. Click **Shell** tab (if available)
3. Run:
   ```bash
   npm run db:migrate
   ```

## Quick Checklist

- [ ] Got DATABASE_URL from Render environment variables
- [ ] Set DATABASE_URL locally: `export DATABASE_URL="..."`
- [ ] Ran migrations: `npm run db:migrate`
- [ ] Verified with: `npx tsx check-database-health.ts`
- [ ] Restarted Render service

## Troubleshooting

**"DATABASE_URL not set"**
- Make sure you copied the entire connection string from Render
- Check for any extra spaces or quotes

**"Connection refused" or "SSL error"**
- Verify the connection string is correct
- Ensure `sslmode=require` is in the connection string
- Check Neon dashboard to ensure database is active

**"Some tables still missing"**
- Run `npm run db:migrate` again (it's safe to run multiple times)
- Check the migration output for any errors
- Run `npx tsx check-database-health.ts` to see which tables are missing

