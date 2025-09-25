# Punjab Seat Allotment System

A comprehensive web application for managing seat allocation in educational institutions across Punjab districts. The system handles student preferences, vacancy management, and automated allocation based on merit.

## 🚀 Deploying to Render

This application can be deployed to Render using the following comprehensive guide.

### Prerequisites

1. **Git Repository**: Ensure your code is in a Git repository (GitHub, GitLab, etc.)
2. **Render Account**: Sign up at [render.com](https://render.com)
3. **Neon Database**: Your PostgreSQL database (already configured)

### Step 1: Prepare Your Repository

Before deploying, ensure your repository has these files:
- `package.json` ✅ (Already configured)
- Build scripts ✅ (Already configured)
- Environment variables documented below

### Step 2: Database Setup

Your application uses **Neon PostgreSQL**. You'll need your database connection string from Neon:

1. **Get your DATABASE_URL from Neon Console**:
   - Go to [console.neon.tech](https://console.neon.tech)
   - Select your database project
   - Go to "Connection Details"
   - Copy the "Connection string" for Node.js
   - Format: `postgresql://username:password@host/database?sslmode=require`

### Step 3: Create Web Service on Render

1. **Login to Render Dashboard**
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Click "New +" → "Web Service"

2. **Connect Repository**
   - Choose "Build and deploy from a Git repository"
   - Connect your GitHub/GitLab account
   - Select your repository
   - Click "Connect"

3. **Configure Service Settings**
   ```
   Name: punjab-seat-allotment
   Environment: Node
   Region: Choose closest to your users
   Branch: main (or your deployment branch)
   Root Directory: . (leave blank)
   ```

4. **Build & Deploy Configuration**
   ```
   Build Command: npm run build
   Start Command: npm run start
   ```

### Step 4: Environment Variables

In the Render dashboard, add these environment variables:

#### Required Variables
```bash
# Database (Get from Neon Console)
DATABASE_URL=postgresql://username:password@host/database?sslmode=require

# Session Security (Generate using: openssl rand -base64 64)
SESSION_SECRET=your_generated_64_character_session_secret_here

# Environment
NODE_ENV=production

# Server Configuration
PORT=10000
```

#### How to Set Environment Variables in Render:
1. In your web service dashboard
2. Go to "Environment" tab
3. Click "Add Environment Variable"
4. Add each variable above

#### Generating SESSION_SECRET:
Use this command to generate a secure session secret:
```bash
openssl rand -base64 64
```

### Step 5: Advanced Settings

#### Auto-Deploy
- ✅ Enable "Auto-Deploy" to deploy on every push to your branch

#### Health Check
- **Health Check Path**: `/api/health` 
- This ensures your API is responding correctly

#### Disk Storage
- Most plans include sufficient disk storage for file uploads

### Step 6: Database Migration

After your first deployment:

1. **Connect to Render Shell** (via dashboard)
2. **Run database setup**:
   ```bash
   npm run db:push
   ```

Your database already has users created, so this step just ensures schema sync.

### Step 7: Access Your Application

Once deployed:
- Your app will be available at: `https://your-service-name.onrender.com`
- **Login Credentials**: Contact your system administrator for secure admin credentials
- **Central Admin Access**: Credentials provided through secure channel during setup

## 🔧 Render Configuration Summary

### package.json Scripts (Already Configured)
```json
{
  "scripts": {
    "dev": "NODE_ENV=development npx tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "db:push": "drizzle-kit push"
  }
}
```

### Service Settings Summary
```yaml
Type: Web Service
Environment: Node
Build Command: npm run build
Start Command: npm run start
Port: 10000 (or from PORT env var)
Auto-Deploy: Yes
Health Check: /api/health
```

## 🔐 Security Configuration

### Production Security Features
- ✅ Secure session cookies (HTTPS enforced)
- ✅ CSRF protection with SameSite cookies
- ✅ Secure password hashing (bcrypt)
- ✅ Environment-based security settings
- ✅ No hardcoded credentials

### Admin Account Management
- **Central Admin**: Manages all system operations
- **District Admins**: Manage specific district operations
- Password resets available through central admin interface

## 📁 Application Structure

```
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Application pages
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # Utilities
├── server/               # Express backend
│   ├── services/         # Business logic
│   ├── db.ts            # Database connection
│   ├── routes.ts        # API routes
│   └── storage.ts       # Data access layer
├── shared/               # Shared types and schema
│   └── schema.ts        # Database schema
└── uploads/             # File upload directory
```

## 🌟 Features

- **Student Management**: Import and manage student data
- **District Administration**: Role-based district management
- **Allocation System**: Automated merit-based seat allocation
- **File Processing**: Excel/CSV import capabilities
- **Audit Logging**: Comprehensive activity tracking
- **Export Functionality**: PDF and CSV export options
- **Real-time Updates**: Live allocation status updates

## 📊 System Requirements

### Production Environment
- **Node.js**: 18+ (Render provides latest LTS)
- **Database**: PostgreSQL 13+ (Neon)
- **Memory**: 512MB minimum
- **Storage**: 1GB for file uploads

### Database Schema
- **Users**: 24 admin accounts (1 central + 23 district)
- **Students**: Entrance result and preference data
- **Vacancies**: District-wise seat availability
- **Audit Logs**: Complete activity tracking

## 🚨 Troubleshooting

### Common Issues

#### Build Fails
```bash
# Check build logs in Render dashboard
# Ensure all dependencies in package.json
npm install
npm run build
```

#### Database Connection Issues
```bash
# Verify DATABASE_URL is correct
# Check Neon database status
# Ensure SSL mode is enabled
```

#### Session Issues
```bash
# Verify SESSION_SECRET is set
# Check cookie settings in production
# Ensure HTTPS is enabled
```

### Render-Specific Issues

#### Deployment Timeout
- Increase build timeout in service settings
- Optimize build process if needed

#### Memory Issues
- Upgrade to higher tier if needed
- Monitor resource usage in dashboard

#### File Upload Issues
- Ensure disk storage is sufficient
- Check upload directory permissions

## 🔗 Important Links

- **Render Dashboard**: [dashboard.render.com](https://dashboard.render.com)
- **Neon Console**: [console.neon.tech](https://console.neon.tech)
- **Application Repository**: Your Git repository URL

## 📞 Support

For deployment issues:
1. Check Render build/deploy logs
2. Verify all environment variables
3. Test database connectivity
4. Review application logs in Render dashboard

---

**Ready to Deploy?** Follow the steps above and your Punjab Seat Allotment System will be live on Render with production-grade security and performance!