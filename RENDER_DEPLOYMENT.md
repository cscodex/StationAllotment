# Render Deployment Guide

## ⚠️ Important: Deployment Order

**CRITICAL**: You MUST run database migrations BEFORE deploying to Render. The application will fail with database errors if tables don't exist.

**Correct Order**:
1. ✅ Create Neon database
2. ✅ Run database migrations (Step 1)
3. ✅ Verify database tables exist
4. ✅ Deploy to Render
5. ✅ Configure environment variables

**If you see "relation does not exist" errors**: You skipped Step 1. Stop the deployment, run migrations, then redeploy.

## Prerequisites
- Render account (https://render.com)
- Neon PostgreSQL database (or any PostgreSQL database)
- GitHub repository with your code
- Local machine with Node.js 20+ (to run migrations)

## Step 1: Database Setup

⚠️ **CRITICAL**: Database migrations MUST be run BEFORE deploying the application. The app will fail with "relation does not exist" errors if migrations are not run first.

1. **Create Neon Database** (if not already done):
   - Go to https://console.neon.tech/
   - Create a new database
   - Copy the connection string from the dashboard
   - Format: `postgresql://[username]:[password]@[ep-xxxxx-xxxxx.region.aws.neon.tech]/[database]?sslmode=require`
   - Example: `postgresql://neondb_owner:AbCdEf123456@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require`

2. **Run Database Migrations** (REQUIRED):
   
   ⚠️ **IMPORTANT**: You need to run migrations on the SAME database that Render uses. If you already deployed to Render, get the `DATABASE_URL` from Render's environment variables.
   
   **Step 1: Get Your Render Database URL**
   - Go to Render Dashboard → Your Service → Environment
   - Copy the `DATABASE_URL` value (or get it from Neon dashboard if you know which database Render uses)
   - This is the database you need to migrate
   
   **Step 2: Run Migrations Locally Against Render Database**
   ```bash
   # Clone the repository locally (if not already)
   git clone https://github.com/cscodex/StationAllotment.git
   cd StationAllotment
   
   # Install dependencies
   npm install
   
   # Set DATABASE_URL to your RENDER database connection string
   export DATABASE_URL="postgresql://[username]:[password]@[ep-xxxxx-xxxxx.region.aws.neon.tech]/[database]?sslmode=require"
   
   # Verify you're connecting to the right database
   npx tsx check-database-health.ts
   
   # Run all migrations in correct order
   npm run db:migrate
   # OR
   npx tsx run-all-migrations.ts
   ```
   
   **After migrations complete**:
   ```bash
   # Verify migrations succeeded
   npx tsx check-database-health.ts
   ```
   
   You should see all tables listed as "EXISTS". Then restart your Render service.
   
   **Option 2: Run migrations individually**:
   ```bash
   # Set DATABASE_URL environment variable
   export DATABASE_URL="your-neon-connection-string"
   
   # Run initial database creation
   npx tsx run-migration.ts create_database.sql
   
   # Run counseling rounds migration
   npx tsx run-migration.ts migrations/add_counseling_rounds.sql
   
   # Run UDISE code migration
   npx tsx run-migration.ts migrations/add_udise_code.sql
   
   # Run unique constraint update
   npx tsx run-migration.ts migrations/update_counseling_rounds_unique_constraint.sql
   ```
   
   **What gets created**:
   - All base tables (users, students, vacancies, schools, etc.)
   - Counseling rounds table
   - Academic year columns
   - UDISE code columns
   - Indexes and constraints
   
   **Verify migrations succeeded**:
   - You should see "✅ All migrations completed successfully!" message
   - Check Neon dashboard to confirm tables exist

## Step 2: Verify Database is Ready

Before proceeding to Render setup, verify your database has all tables:

1. **Check in Neon Dashboard**:
   - Go to your Neon project → SQL Editor
   - Run: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
   - You should see tables like: `users`, `students`, `vacancies`, `schools`, `counseling_rounds`, etc.

2. **Or test connection**:
   ```bash
   export DATABASE_URL="your-neon-connection-string"
   npx tsx verify-migration.ts
   ```

## Step 3: Render Service Setup

1. **Create New Web Service**:
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**:
   - **Name**: `stationallotment` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter (or higher)
   
   **Note**: The build command uses `npm ci --include=dev` to ensure devDependencies (like `vite` and `esbuild`) are installed, which are required for the build process.

3. **Environment Variables**:
   Set these in Render Dashboard → Environment:
   
   **Option 1: Copy from `render.env.example` file** (recommended):
   - Open `render.env.example` in this repository
   - Copy each line (excluding comments starting with `#`)
   - In Render Dashboard → Environment → Add Environment Variable
   - For each variable, paste the KEY=VALUE pair
   - Replace placeholder values `[username]`, `[password]`, etc. with your actual values
   
   **Option 2: Manual Setup**:
   ```
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=postgresql://[username]:[password]@[ep-xxxxx-xxxxx.region.aws.neon.tech]/[database]?sslmode=require
   SESSION_SECRET=[generate-a-random-secret]
   ```
   
   **To generate SESSION_SECRET**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   
   **How to add variables in Render Dashboard**:
   1. Go to your Render service → Environment tab
   2. Click "Add Environment Variable"
   3. For each variable from `render.env.example`:
      - **Key**: Copy the part before `=` (e.g., `NODE_ENV`)
      - **Value**: Copy the part after `=` (e.g., `production`)
      - For `DATABASE_URL`: Replace `[username]`, `[password]`, `[ep-xxxxx-xxxxx.region.aws.neon.tech]`, and `[database]` with your actual Neon credentials
      - For `SESSION_SECRET`: Generate using the command above and paste the result
   4. Click "Save Changes"
   
   **Important**: 
   - Replace all placeholder values `[username]`, `[password]`, `[ep-xxxxx-xxxxx.region.aws.neon.tech]`, and `[database]` with your actual Neon database credentials
   - Never commit actual credentials to Git
   - The `render.env.example` file contains placeholders only

## Step 4: Build Configuration

The project uses:
- **Build Command**: `npm ci --include=dev && npm run build`
  - `npm ci --include=dev`: Installs all dependencies including devDependencies (required for vite, esbuild)
  - `npm run build`: Builds both frontend (vite) and backend (esbuild)
- **Start Command**: `npm start` (runs production server)
- **Port**: Uses `PORT` environment variable (default: 5000, Render uses 10000)

**Important**: The build requires devDependencies (`vite`, `esbuild`, `typescript`, etc.) to compile the code, so they must be installed during the build phase.

## Step 5: Database Connection

The application uses Neon PostgreSQL with:
- Connection pooling enabled
- SSL required (`sslmode=require`)
- Environment variable: `DATABASE_URL`

## Step 6: Verify Deployment

1. **Check Build Logs**:
   - Ensure build completes successfully
   - Check for any TypeScript errors

2. **Check Runtime Logs**:
   - Server should start on port 10000
   - Check for database connection errors

3. **Test Application**:
   - Visit your Render URL
   - Login as `central_admin` / `admin123`
   - Test counseling rounds creation

## Troubleshooting

### Build Fails

**Error: "vite: not found" or "esbuild: not found"**
- **Cause**: devDependencies are not being installed during build
- **Solution**: Ensure build command is `npm ci --include=dev && npm run build`
- **Alternative**: Set `NPM_CONFIG_PRODUCTION=false` environment variable in Render
- The `render.yaml` file already includes this configuration

**Other Build Issues**:
- Check Node.js version (should be 20+)
- Verify all dependencies in `package.json`
- Check build logs for specific errors
- Ensure `package-lock.json` is committed to repository

### Database Connection Fails
- Verify `DATABASE_URL` is set correctly
- Ensure SSL is enabled (`sslmode=require`)
- Check database firewall settings
- Verify connection string format

### Application Crashes

**Error: "relation 'counseling_rounds' does not exist" or "relation 'X' does not exist"**
- **Cause**: Database migrations have not been run on the Render database
- **Solution**: 
  1. **Get Render's DATABASE_URL**:
     - Go to Render Dashboard → Your Service → Environment
     - Copy the `DATABASE_URL` value
     - This is the database Render is using (may be different from your local database)
  
  2. **Run migrations on Render's database**:
     ```bash
     # Set DATABASE_URL to Render's database
     export DATABASE_URL="[paste-render-database-url-here]"
     
     # Run migrations
     npm run db:migrate
     
     # Verify
     npx tsx check-database-health.ts
     ```
  
  3. **Restart Render service**:
     - Go to Render Dashboard → Your Service → Manual Deploy → Clear build cache & deploy
     - Or just wait for auto-deploy after verifying migrations
  
- **Prevention**: Always run migrations on the production database BEFORE deploying the application
- **Note**: If you have multiple databases (local dev, staging, production), make sure you're migrating the correct one!

**Other Application Issues**:
- Check runtime logs
- Verify all environment variables are set
- Check database migrations are run
- Verify `SESSION_SECRET` is set
- Verify `DATABASE_URL` is correct and accessible

### Port Issues
- Render uses port 10000 by default
- Application reads from `PORT` environment variable
- Ensure `PORT=10000` is set in Render

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `production` |
| `PORT` | Yes | Server port | `10000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://neondb_owner:password@ep-xxxxx-xxxxx.region.aws.neon.tech/neondb?sslmode=require` |
| `SESSION_SECRET` | Yes | Session encryption secret | Random 64 character hex string (use command below to generate) |
| `NPM_CONFIG_PRODUCTION` | No* | Install devDependencies during build | `false` (only needed if not using `render.yaml`) |

## Quick Reference: Environment Variables for Render

Copy these to Render Dashboard → Environment (replace placeholders):

```
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://[username]:[password]@[ep-xxxxx-xxxxx.region.aws.neon.tech]/[database]?sslmode=require
SESSION_SECRET=[generate-using-command-below]
NPM_CONFIG_PRODUCTION=false
```

**Note**: If you're using `render.yaml` (recommended), `NPM_CONFIG_PRODUCTION` is already configured. You only need to set it manually if not using `render.yaml`.

**Generate SESSION_SECRET**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Get DATABASE_URL from Neon**:
1. Go to https://console.neon.tech/
2. Select your project
3. Go to "Connection Details"
4. Copy the connection string (it will look like: `postgresql://neondb_owner:password@ep-xxxxx-xxxxx.region.aws.neon.tech/neondb?sslmode=require`)

## Notes

- Render automatically provides HTTPS
- Static files are served from `dist/public`
- API routes are served from `/api/*`
- Sessions are stored in PostgreSQL (via `connect-pg-simple`)
- See `render.env.example` file for detailed variable descriptions


