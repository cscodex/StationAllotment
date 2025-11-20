# Render Deployment Guide

## Prerequisites
- Render account (https://render.com)
- Neon PostgreSQL database (or any PostgreSQL database)
- GitHub repository with your code

## Step 1: Database Setup

1. **Create Neon Database** (if not already done):
   - Go to https://console.neon.tech/
   - Create a new database
   - Copy the connection string
   - Format: `postgresql://user:password@host/database?sslmode=require`

2. **Run Database Migrations**:
   ```bash
   # Set DATABASE_URL environment variable
   export DATABASE_URL="your-neon-connection-string"
   
   # Run initial database creation
   npx tsx run-migration.ts create_database.sql
   
   # Run counseling rounds migration
   npx tsx run-migration.ts migrations/add_counseling_rounds.sql
   
   # Run unique constraint update
   npx tsx run-migration.ts migrations/update_counseling_rounds_unique_constraint.sql
   ```

## Step 2: Render Service Setup

1. **Create New Web Service**:
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**:
   - **Name**: `stationallotment` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter (or higher)

3. **Environment Variables**:
   Set these in Render Dashboard → Environment:
   
   ```
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=postgresql://user:password@host/database?sslmode=require
   SESSION_SECRET=<generate-a-random-secret>
   ```
   
   **To generate SESSION_SECRET**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Step 3: Build Configuration

The project uses:
- **Build**: `npm run build` (builds both frontend and backend)
- **Start**: `npm start` (runs production server)
- **Port**: Uses `PORT` environment variable (default: 5000, Render uses 10000)

## Step 4: Database Connection

The application uses Neon PostgreSQL with:
- Connection pooling enabled
- SSL required (`sslmode=require`)
- Environment variable: `DATABASE_URL`

## Step 5: Verify Deployment

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
- Check Node.js version (should be 20+)
- Verify all dependencies in `package.json`
- Check build logs for specific errors

### Database Connection Fails
- Verify `DATABASE_URL` is set correctly
- Ensure SSL is enabled (`sslmode=require`)
- Check database firewall settings
- Verify connection string format

### Application Crashes
- Check runtime logs
- Verify all environment variables are set
- Check database migrations are run
- Verify `SESSION_SECRET` is set

### Port Issues
- Render uses port 10000 by default
- Application reads from `PORT` environment variable
- Ensure `PORT=10000` is set in Render

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `production` |
| `PORT` | Yes | Server port | `10000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://...` |
| `SESSION_SECRET` | Yes | Session encryption secret | Random 32+ character string |

## Notes

- Render automatically provides HTTPS
- Static files are served from `dist/public`
- API routes are served from `/api/*`
- Sessions are stored in PostgreSQL (via `connect-pg-simple`)


