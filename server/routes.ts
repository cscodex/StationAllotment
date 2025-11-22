import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import session from "express-session";
import connectPg from "connect-pg-simple";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { insertUserSchema, insertStudentSchema, insertVacancySchema, insertStudentsEntranceResultSchema, USER_ROLES } from "@shared/schema";
import { FileService } from "./services/fileService";
import { AllocationService } from "./services/allocationService";
import { ExportService } from "./services/exportService";
import { AuditService } from "./services/auditService";
import { RoundActivationService } from "./services/roundActivationService";
import { getCurrentSession, isCurrentSession, isPreviousSession, isDateInSession } from "./utils/sessionUtils";
import fs from "fs/promises";

// Cache for demo credentials (only load once at startup in development)
let cachedCredentials: any = null;

// Load demo credentials at startup (development only)
async function loadDemoCredentials() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  try {
    const credentialsData = await fs.readFile('./credentials.json', 'utf8');
    return JSON.parse(credentialsData);
  } catch (error) {
    console.warn('Demo credentials file not found - demo login will not be available');
    return null;
  }
}

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Helper function to check if student preferences are complete
function isPreferencesComplete(student: any): boolean {
  if (!student.stream || !student.stream.trim()) return false;
  
  const choices = [
    student.choice1, student.choice2, student.choice3, student.choice4, student.choice5,
    student.choice6, student.choice7, student.choice8, student.choice9, student.choice10
  ];
  
  return choices.every(choice => choice && choice.trim());
}

// District name normalization helper
function normalizeDistrict(district: string): string {
  // Normalize SAS Nagar variations to match across frontend/backend
  const normalized = district.trim();
  if (normalized === 'SAS Nagar' || normalized === 'S.A.S. Nagar' || normalized === 'SAS Nagar (Mohali)' || normalized === 'Mohali') {
    return 'SAS Nagar'; // Use consistent name from schema
  }
  return normalized;
}

function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET || (() => {
      throw new Error('SESSION_SECRET environment variable is required for production security');
    })(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Secure cookies in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTtl,
    },
  });
}

const isAuthenticated = async (req: any, res: any, next: any) => {
  if (req.session && req.session.userId) {
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account has been blocked" });
    }
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

const isCentralAdmin = async (req: any, res: any, next: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== 'central_admin') {
    return res.status(403).json({ message: "Forbidden - Central Admin access required" });
  }
  
  if (user.isBlocked) {
    return res.status(403).json({ message: "Account has been blocked" });
  }
  
  req.user = user;
  return next();
};

const isDistrictAdmin = async (req: any, res: any, next: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user || !['central_admin', 'district_admin'].includes(user.role)) {
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  }
  
  if (user.isBlocked) {
    return res.status(403).json({ message: "Account has been blocked" });
  }
  
  req.user = user;
  return next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Load demo credentials at startup
  cachedCredentials = await loadDemoCredentials();

  const fileService = new FileService(storage);
  const exportService = new ExportService(storage);
  const auditService = new AuditService(storage);
  const roundActivationService = new RoundActivationService(storage);
  // AllocationService will be created per-request with userId for logging

  // Set up periodic round activation check (every 5 minutes)
  // This automatically activates rounds when their start date is reached
  setInterval(async () => {
    try {
      await roundActivationService.processRounds();
    } catch (error) {
      console.error('Error in periodic round activation:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Also run once at startup
  roundActivationService.processRounds().catch(err => {
    console.error('Error in initial round activation check:', err);
  });

  // Auth routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      // Normalize input - trim whitespace and lowercase for username matching
      const normalizedUsername = username.trim().toLowerCase();
      
      // Try to find user by username first, then by email
      let user = await storage.getUserByUsername(normalizedUsername);
      if (!user) {
        // Try finding by email (case-insensitive)
        user = await storage.getUserByEmail(normalizedUsername);
      }
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      (req.session as any).userId = user.id;
      
      await auditService.log(user.id, 'user_login', 'auth', user.id, {
        username: user.username,
        role: user.role,
      }, req.ip, req.get('User-Agent'));

      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          district: user.district,
          firstName: user.firstName,
          lastName: user.lastName,
        } 
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Demo login route for development
  app.post('/api/auth/demo-login', async (req, res) => {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({ message: "Username is required" });
      }

      // Only allow demo login in development
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: "Demo login not available in production" });
      }

      // Check if demo credentials are available
      if (!cachedCredentials) {
        return res.status(500).json({ message: "Demo credentials not available" });
      }

      // Find user in credentials
      let credentialUser;
      if (username === cachedCredentials.central_admin.username) {
        credentialUser = cachedCredentials.central_admin;
      } else {
        credentialUser = cachedCredentials.district_admins.find((admin: any) => admin.username === username);
      }

      if (!credentialUser) {
        return res.status(404).json({ message: "Demo user not found" });
      }

      // Normalize username for consistent lookup/storage
      const normalizedUsername = credentialUser.username.toLowerCase();

      // Check if user exists in database
      let user = await storage.getUserByUsername(normalizedUsername);
      
      // If user doesn't exist, create them
      if (!user) {
        const hashedPassword = await bcrypt.hash(credentialUser.password, 10);
        
        const newUser = {
          username: normalizedUsername, // Store normalized version
          email: credentialUser.email,
          password: hashedPassword,
          role: credentialUser.role as 'central_admin' | 'district_admin',
          district: credentialUser.district || null,
          firstName: credentialUser.firstName,
          lastName: credentialUser.lastName,
          isBlocked: false,
        };

        user = await storage.createUser(newUser);
      }

      // Create session
      (req.session as any).userId = user.id;
      
      await auditService.log(user.id, 'demo_login', 'auth', user.id, {
        username: user.username,
        role: user.role,
      }, req.ip, req.get('User-Agent'));

      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          district: user.district,
          firstName: user.firstName,
          lastName: user.lastName,
        } 
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get available demo users
  app.get('/api/auth/demo-users', async (req, res) => {
    try {
      // Only allow in development
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: "Demo users not available in production" });
      }

      // Check if demo credentials are available
      if (!cachedCredentials) {
        return res.json([]); // Return empty array if no credentials available
      }

      const demoUsers = [
        {
          username: cachedCredentials.central_admin.username,
          role: cachedCredentials.central_admin.role,
          firstName: cachedCredentials.central_admin.firstName,
          lastName: cachedCredentials.central_admin.lastName,
          district: null,
        },
        ...cachedCredentials.district_admins.map((admin: any) => ({
          username: admin.username,
          role: admin.role,
          firstName: admin.firstName,
          lastName: admin.lastName,
          district: admin.district,
        })),
      ];

      res.json(demoUsers);
    } catch (error) {
      console.error("Get demo users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        district: user.district,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Database health check (Central Admin only)
  app.get('/api/health/database', isCentralAdmin, async (req, res) => {
    try {
      const startTime = Date.now();
      // Simple query to test database connectivity - use a lightweight query
      await db.execute(sql`SELECT 1`);
      const responseTime = Date.now() - startTime;
      
      res.json({
        status: 'online',
        responseTime,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Database health check error:", error);
      res.status(503).json({
        status: 'offline',
        error: error.message || 'Database connection failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // User management (Central Admin only)
  app.get('/api/users', isCentralAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', isCentralAdmin, async (req: any, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      await auditService.log(req.user.id, 'user_create', 'users', user.id, {
        username: user.username,
        role: user.role,
      }, req.ip, req.get('User-Agent'));

      res.json({ 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        district: user.district,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Update user route
  app.put('/api/users/:id', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Security: Prevent password updates through this route
      // Use dedicated password change/reset routes instead
      if (updateData.password !== undefined) {
        return res.status(400).json({ 
          message: "Password updates are not allowed through this route. Use the dedicated password change or reset endpoints." 
        });
      }
      
      const user = await storage.updateUser(id, updateData);
      
      await auditService.log(req.user.id, 'user_update', 'users', id, {
        username: user.username,
        role: user.role,
        updates: updateData,
      }, req.ip, req.get('User-Agent'));

      res.json(user);
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Delete user route
  app.delete('/api/users/:id', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.deleteUser(id);
      
      await auditService.log(req.user.id, 'user_delete', 'users', id, {
        username: user.username,
        role: user.role,
      }, req.ip, req.get('User-Agent'));

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Block user route
  app.put('/api/users/:id/block', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.role === 'central_admin') {
        return res.status(400).json({ message: "Cannot block central admin" });
      }
      
      const updatedUser = await storage.updateUser(id, { isBlocked: true });
      
      await auditService.log(req.user.id, 'user_block', 'users', id, {
        username: user.username,
        role: user.role,
      }, req.ip, req.get('User-Agent'));

      res.json({ 
        id: updatedUser.id, 
        username: updatedUser.username, 
        role: updatedUser.role, 
        district: updatedUser.district,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        isBlocked: updatedUser.isBlocked,
        email: updatedUser.email
      });
    } catch (error) {
      console.error("Block user error:", error);
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  // Unblock user route
  app.put('/api/users/:id/unblock', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updatedUser = await storage.updateUser(id, { isBlocked: false });
      
      await auditService.log(req.user.id, 'user_unblock', 'users', id, {
        username: user.username,
        role: user.role,
      }, req.ip, req.get('User-Agent'));

      res.json({ 
        id: updatedUser.id, 
        username: updatedUser.username, 
        role: updatedUser.role, 
        district: updatedUser.district,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        isBlocked: updatedUser.isBlocked,
        email: updatedUser.email
      });
    } catch (error) {
      console.error("Unblock user error:", error);
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  // CSV User import route
  app.post('/api/users/import', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const XLSX = await import('xlsx');
      const workbook = XLSX.readFile(req.file.path);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const csvData = XLSX.utils.sheet_to_json(worksheet);

      // Generate unique secure password for each imported user
      const crypto = await import('crypto');

      let importedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const row of csvData) {
        const userData = row as any;
        try {
          // Check if user already exists
          const existingUser = await storage.getUserByUsername(userData.username);
          if (existingUser) {
            skippedCount++;
            continue;
          }

          // Validate required fields
          if (!userData.username || !userData.role) {
            errors.push(`Row missing required fields: username, role`);
            continue;
          }

          // Generate unique secure password for this user
          const uniquePassword = crypto.randomBytes(16).toString('base64').slice(0, 16);
          const hashedPassword = await bcrypt.hash(uniquePassword, 10);
          
          // Create user
          const newUser = {
            username: userData.username,
            email: userData.email || null,
            password: hashedPassword,
            role: userData.role as 'central_admin' | 'district_admin',
            district: userData.district || null,
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            isBlocked: false,
          };

          await storage.createUser(newUser);
          importedCount++;
        } catch (error) {
          errors.push(`Error importing user ${userData?.username || 'unknown'}: ${error}`);
        }
      }

      await auditService.log(req.user.id, 'csv_user_import', 'users', 'bulk_import', {
        importedCount,
        skippedCount,
        filename: req.file.originalname,
      }, req.ip, req.get('User-Agent'));

      res.json({
        success: true,
        importedCount,
        skippedCount,
        errors,
        message: `Imported ${importedCount} users with unique secure passwords. Contact system administrator for password reset access.`,
      });
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ message: "Failed to import users from CSV" });
    }
  });

  // Password change route
  app.put('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password required" });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      await storage.updateUser(user.id, { password: hashedNewPassword });

      await auditService.log(req.session.userId, 'password_change', 'auth', user.id, {
        username: user.username,
      }, req.ip, req.get('User-Agent'));

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Password reset route for central admin to reset district admin passwords
  app.put('/api/users/:id/reset-password', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      
      if (!newPassword) {
        return res.status(400).json({ message: "New password is required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
      }

      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Ensure only district admins can have their passwords reset by central admin
      if (targetUser.role !== 'district_admin') {
        return res.status(403).json({ message: "Password reset is only allowed for district administrators" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      await storage.updateUser(id, { password: hashedNewPassword });

      await auditService.log(req.session.userId, 'admin_password_reset', 'users', id, {
        targetUsername: targetUser.username,
        targetRole: targetUser.role,
        targetDistrict: targetUser.district,
      }, req.ip, req.get('User-Agent'));

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // File upload routes
  app.post('/api/files/upload/students', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { academicYear, counselingRoundId } = req.body;
      if (!academicYear) {
        return res.status(400).json({ message: "Missing required field: academicYear" });
      }

      const result = await fileService.processStudentFile(
        req.file, 
        req.session.userId, 
        academicYear,
        counselingRoundId || undefined
      );
      
      await auditService.log(req.session.userId, 'file_upload', 'files', result.id, {
        filename: result.originalName,
        type: 'student_choices',
        status: result.status,
        academicYear,
        counselingRoundId: result.counselingRoundId,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Upload students file error:", error);
      res.status(500).json({ message: "Failed to upload file", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/files/upload/vacancies', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { academicYear, counselingRoundId } = req.body;
      if (!academicYear) {
        return res.status(400).json({ message: "Missing required field: academicYear" });
      }

      const result = await fileService.processVacancyFile(
        req.file, 
        req.session.userId, 
        academicYear,
        counselingRoundId || undefined
      );
      
      await auditService.log(req.session.userId, 'file_upload', 'files', result.id, {
        filename: result.originalName,
        type: 'vacancies',
        status: result.status,
        academicYear,
        counselingRoundId: result.counselingRoundId,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Upload vacancies file error:", error);
      res.status(500).json({ message: "Failed to upload file", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/files/upload/entrance-results', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { academicYear, counselingRoundId } = req.body;
      if (!academicYear) {
        return res.status(400).json({ message: "Missing required field: academicYear" });
      }

      const result = await fileService.processEntranceResultsFile(
        req.file, 
        req.session.userId, 
        academicYear,
        counselingRoundId || undefined
      );
      
      await auditService.log(req.session.userId, 'file_upload', 'files', result.id, {
        filename: result.originalName,
        type: 'entrance_results',
        status: result.status,
        academicYear,
        counselingRoundId: result.counselingRoundId,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Upload entrance results file error:", error);
      res.status(500).json({ message: "Failed to upload file", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/files/template/entrance-results', isCentralAdmin, async (req: any, res) => {
    try {
      const csvContent = fileService.generateEntranceResultsTemplate();
      
      await auditService.log(req.user.id, 'template_download', 'files', 'entrance_results_template', {
        type: 'entrance_results',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=entrance_results_template.csv');
      res.send(csvContent);
    } catch (error) {
      console.error("Download entrance results template error:", error);
      res.status(500).json({ message: "Failed to download template" });
    }
  });

  app.get('/api/files/template/student-choices', isCentralAdmin, async (req: any, res) => {
    try {
      const csvContent = fileService.generateStudentChoicesTemplate();
      
      await auditService.log(req.user.id, 'template_download', 'files', 'student_choices_template', {
        type: 'student_choices',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=student_choices_template.csv');
      res.send(csvContent);
    } catch (error) {
      console.error("Download student choices template error:", error);
      res.status(500).json({ message: "Failed to download template" });
    }
  });

  app.get('/api/files/template/vacancies', isCentralAdmin, async (req: any, res) => {
    try {
      const csvContent = fileService.generateVacanciesTemplate();
      
      await auditService.log(req.user.id, 'template_download', 'files', 'vacancies_template', {
        type: 'vacancies',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=vacancies_template.csv');
      res.send(csvContent);
    } catch (error) {
      console.error("Download vacancies template error:", error);
      res.status(500).json({ message: "Failed to download template" });
    }
  });

  app.get('/api/files', isAuthenticated, async (req, res) => {
    try {
      const files = await storage.getFileUploads(50);
      res.json(files);
    } catch (error) {
      console.error("Get files error:", error);
      res.status(500).json({ message: "Failed to fetch files" });
    }
  });

  // Students routes
  app.get('/api/students', isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const allocated = req.query.allocated === 'true';
      const user = await storage.getUser(req.session.userId);
      
      if (allocated) {
        // For the reports page - return all students
        const students = await storage.getStudents(10000, 0);
        return res.json(students);
      }
      
      let students, total;
      
      // Show all students for student preference management
      // This allows both central and district admins to see the full picture
      students = await storage.getStudents(limit, offset);
      total = await storage.getStudentsCount();
      
      // Map database fields to frontend expected fields
      const mappedStudents = students.map(student => ({
        ...student,
        applicationNumber: student.appNo, // Map appNo to applicationNumber
      }));
      res.json({ students: mappedStudents, total });
    } catch (error) {
      console.error("Get students error:", error);
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  app.get('/api/students/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const student = await storage.getStudent(id);
      
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      
      res.json(student);
    } catch (error) {
      console.error("Get student error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/students/:meritNumber', isAuthenticated, async (req, res) => {
    try {
      const meritNumberParam = req.params.meritNumber;
      
      // Validate that merit number is a valid number
      if (!meritNumberParam || meritNumberParam === '[object Object]' || isNaN(Number(meritNumberParam))) {
        return res.status(400).json({ message: "Invalid merit number provided" });
      }
      
      const meritNumber = parseInt(meritNumberParam);
      const student = await storage.getStudentByMeritNumber(meritNumber);
      
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      
      res.json(student);
    } catch (error) {
      console.error("Get student error:", error);
      res.status(500).json({ message: "Failed to fetch student" });
    }
  });

  app.post('/api/students', isDistrictAdmin, async (req: any, res) => {
    try {
      // Extract the required fields from the request body
      const { appNo, meritNumber, name, stream, gender, category } = req.body;
      
      // Validate required fields
      if (!appNo || !meritNumber || !name || !stream) {
        return res.status(400).json({ 
          message: "Missing required fields: appNo, meritNumber, name, stream" 
        });
      }

      // For new students created from student-preference-management, we need to get gender and category
      // from the entrance results if not provided
      let studentData = { appNo, meritNumber, name, stream, gender, category };
      
      if (!gender || !category) {
        // Try to find the student in entrance results to get gender and category
        const entranceResult = await storage.getStudentsEntranceResultByMeritNumber(meritNumber);
        if (entranceResult) {
          studentData.gender = entranceResult.gender;
          studentData.category = entranceResult.category;
        } else {
          return res.status(400).json({ 
            message: "Gender and category are required when not found in entrance results" 
          });
        }
      }

      const student = await storage.createStudent(studentData);
      
      await auditService.log(req.user.id, 'student_create', 'students', student.id, {
        studentData,
        userDistrict: req.user.district,
      }, req.ip, req.get('User-Agent'));

      res.json(student);
    } catch (error) {
      console.error("Create student error:", error);
      res.status(500).json({ message: "Failed to create student" });
    }
  });

  // Exclusive lock for editing student preferences
  app.post('/api/students/:id/lock-for-edit', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      
      // First get the student to validate business rules
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Business Rule 1: Student must be assigned to central admin
      if (student.counselingDistrict !== 'Mohali' || student.districtAdmin !== 'Central_admin') {
        return res.status(403).json({ 
          message: "Student is not currently assigned to central admin and cannot be locked for editing" 
        });
      }

      // Business Rule 2: Student must have complete preferences
      if (!isPreferencesComplete(student)) {
        return res.status(403).json({ 
          message: "Student preferences are incomplete. Only students with complete preferences can be locked for editing" 
        });
      }
      
      const result = await storage.lockStudentForEdit(id, userId);
      
      if (!result.success) {
        return res.status(409).json({ message: result.message });
      }
      
      await auditService.log(userId, 'student_lock_for_edit', 'students', id, {
        studentName: result.student?.name,
        appNo: result.student?.appNo
      }, req.ip, req.get('User-Agent'));
      
      res.json(result.student);
    } catch (error) {
      console.error("Lock student for edit error:", error);
      res.status(500).json({ message: "Failed to lock student for editing" });
    }
  });

  app.put('/api/students/:id/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const preferences = req.body;
      
      // Get the student to find their academic year
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Get active counseling round for this academic year
      let activeRound = null;
      if (student.academicYear) {
        activeRound = await storage.getActiveCounselingRound(student.academicYear);
        if (activeRound) {
          preferences.counselingRoundId = activeRound.id;
          preferences.counselingRoundNumber = activeRound.roundNumber;
        }
      }
      
      // Update preferencesUpdatedAt timestamp
      preferences.preferencesUpdatedAt = new Date();
      const user = await storage.getUser(req.session.userId);
      
      // Check if user can edit this student (exclusive lock check)
      const canEdit = await storage.canEditStudent(id, req.session.userId);
      if (!canEdit) {
        return res.status(409).json({ 
          message: "This student is currently being edited by another admin. Please try again later." 
        });
      }
      
      // Validate deadline hasn't passed
      const deadline = await storage.getSetting('allocation_deadline');
      if (deadline && new Date() > new Date(deadline.value)) {
        return res.status(403).json({ message: "Deadline has passed. Cannot modify preferences." });
      }

      // Check for district conflicts if setting counseling district
      if (preferences.counselingDistrict) {
        const conflict = await storage.checkStudentDistrictConflict(id, preferences.counselingDistrict);
        if (conflict.hasConflict) {
          return res.status(409).json({ 
            message: `Student is already selected by ${conflict.currentDistrict} district. Cannot select the same student in multiple districts.`,
            currentDistrict: conflict.currentDistrict
          });
        }
      }

      // Set district admin info if not already set
      if (user?.role === 'district_admin' && user.district) {
        preferences.counselingDistrict = user.district;
        preferences.districtAdmin = user.username;
      }
      
      // Set central admin info when central admin edits preferences
      if (user?.role === 'central_admin') {
        preferences.counselingDistrict = 'Mohali';
        preferences.districtAdmin = 'Central_admin';
      }

      const updatedStudent = await storage.updateStudent(id, preferences);
      
      await auditService.log(req.session.userId, 'student_preferences_update', 'students', id, {
        preferences,
        userDistrict: user?.district,
        counselingRoundId: activeRound?.id,
        counselingRoundNumber: activeRound?.roundNumber,
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Update student preferences error:", error);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Student lock/unlock route
  app.put('/api/students/:id/lock', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isLocked } = req.body;
      
      // Validate request body
      if (typeof isLocked !== 'boolean') {
        return res.status(400).json({ message: "isLocked must be a boolean" });
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Check if deadline has passed
      const deadlineSetting = await storage.getSetting('allocation_deadline');
      const deadlineDate = deadlineSetting?.value ? new Date(deadlineSetting.value) : null;
      const isDeadlinePassed = deadlineDate ? new Date() > deadlineDate : false;
      
      if (isDeadlinePassed) {
        return res.status(403).json({ message: "Cannot modify student lock status after deadline" });
      }

      // Check if district is finalized (for district admin)
      if (user.role === 'district_admin' && student.counselingDistrict) {
        const districtStatus = await storage.getDistrictStatus(student.counselingDistrict);
        if (districtStatus?.isFinalized) {
          return res.status(403).json({ message: "Cannot modify student lock status - district is finalized" });
        }
      }

      // Role-based authorization
      if (user.role === 'district_admin') {
        // District admin can only lock/unlock students in their district
        if (student.counselingDistrict !== user.district) {
          return res.status(403).json({ message: "Can only lock/unlock students in your district" });
        }
        
        // District admin can only lock students, only central admin can unlock
        if (!isLocked) {
          return res.status(403).json({ message: "Only central admin can unlock students" });
        }
      }

      // Validate that all preferences including stream are set before locking
      if (isLocked) {
        if (!student.stream) {
          return res.status(400).json({ 
            message: "Cannot lock student: Student stream must be set before locking" 
          });
        }

        const hasAllChoices = student.choice1 && student.choice2 && student.choice3 && 
                             student.choice4 && student.choice5 && student.choice6 &&
                             student.choice7 && student.choice8 && student.choice9 && student.choice10;
        
        if (!hasAllChoices) {
          return res.status(400).json({ 
            message: "Cannot lock student: All 10 district preferences must be set before locking" 
          });
        }
      }

      const updatedStudent = isLocked 
        ? await storage.lockStudent(id, req.session.userId)
        : await storage.unlockStudent(id);
      
      await auditService.log(req.session.userId, 'student_lock_status_change', 'students', id, {
        isLocked,
        studentName: student.name,
        appNo: student.appNo,
        userDistrict: user.district,
        userRole: user.role,
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Update student lock status error:", error);
      res.status(500).json({ message: "Failed to update lock status" });
    }
  });

  // Central admin override preferences route
  app.put('/api/students/:id/preferences/override', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { preferences, reason } = req.body;
      
      const student = await storage.updateStudent(id, preferences);
      
      await auditService.log(req.session.userId, 'central_admin_override', 'students', id, {
        preferences,
        reason,
        overriddenBy: req.session.userId,
      }, req.ip, req.get('User-Agent'));

      res.json(student);
    } catch (error) {
      console.error("Central admin override error:", error);
      res.status(500).json({ message: "Failed to override preferences" });
    }
  });

  // Student release route
  app.put('/api/students/:id/release', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.session.userId);
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Check if student is locked - locked students cannot be released
      if (student.isLocked) {
        return res.status(403).json({ message: "Cannot release locked student" });
      }

      // Central admin can release any student, district admin can only release from their own district
      if (user?.role === 'district_admin' && student.counselingDistrict !== user.district) {
        return res.status(403).json({ message: "Can only release students from your district" });
      }
      
      const updatedStudent = await storage.releaseStudentFromDistrict(id);
      
      await auditService.log(req.session.userId, 'student_release', 'students', id, {
        releasedBy: req.session.userId,
        studentName: student.name,
        meritNumber: student.meritNumber,
        fromDistrict: student.counselingDistrict
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student release error:", error);
      res.status(500).json({ message: "Failed to release student" });
    }
  });

  // Release assignment endpoint - specifically for central admin to unset district assignment
  app.post('/api/students/:id/release-assignment', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.session.userId);
      
      // Only central admin can use this endpoint
      if (user?.role !== 'central_admin') {
        return res.status(403).json({ message: "Only central admin can release assignments" });
      }
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Verify student is currently assigned to central admin
      if (student.counselingDistrict !== 'Mohali' || student.districtAdmin !== 'Central_admin') {
        return res.status(400).json({ 
          message: "Student is not currently assigned to central admin" 
        });
      }

      // Check if student is locked - locked students cannot be released
      if (student.lockedBy && student.lockedBy !== req.session.userId) {
        return res.status(409).json({ 
          message: "Student is locked by another admin. Cannot release assignment." 
        });
      }
      
      const updatedStudent = await storage.releaseAssignment(id);
      
      await auditService.log(req.session.userId, 'assignment_release', 'students', id, {
        releasedBy: req.session.userId,
        studentName: student.name,
        meritNumber: student.meritNumber,
        previousDistrict: student.counselingDistrict,
        previousDistrictAdmin: student.districtAdmin
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Release assignment error:", error);
      res.status(500).json({ message: "Failed to release assignment" });
    }
  });

  // Lock student for editing
  app.post('/api/students/:id/lock', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.session.userId);
      
      // Only central admin can lock students
      if (user?.role !== 'central_admin') {
        return res.status(403).json({ message: "Only central admin can lock students" });
      }
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Check if student is already locked
      if (student.lockedBy && student.lockedBy !== req.session.userId) {
        return res.status(409).json({ 
          message: "Student is already locked by another admin" 
        });
      }
      
      const updatedStudent = await storage.updateStudent(id, {
        lockedBy: req.session.userId
      });
      
      await auditService.log(req.session.userId, 'student_lock', 'students', id, {
        lockedBy: req.session.userId,
        studentName: student.name,
        meritNumber: student.meritNumber
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student lock error:", error);
      res.status(500).json({ message: "Failed to lock student" });
    }
  });

  // Unlock student
  app.post('/api/students/:id/unlock', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.session.userId);
      
      // Only central admin can unlock students
      if (user?.role !== 'central_admin') {
        return res.status(403).json({ message: "Only central admin can unlock students" });
      }
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Check if student is locked by current user or is unlocked
      if (student.lockedBy && student.lockedBy !== req.session.userId) {
        return res.status(403).json({ 
          message: "Student is locked by another admin" 
        });
      }
      
      const updatedStudent = await storage.updateStudent(id, {
        lockedBy: null
      });
      
      await auditService.log(req.session.userId, 'student_unlock', 'students', id, {
        unlockedBy: req.session.userId,
        studentName: student.name,
        meritNumber: student.meritNumber
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student unlock error:", error);
      res.status(500).json({ message: "Failed to unlock student" });
    }
  });

  // Finalize allocation process
  app.post('/api/allocation/finalize', isCentralAdmin, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      
      // Check if already finalized
      const settings = await storage.getSettings();
      const finalizedSetting = settings.find(s => s.key === 'allocation_finalized');
      
      if (finalizedSetting && finalizedSetting.value === 'true') {
        return res.status(400).json({ 
          message: "Allocation process has already been finalized" 
        });
      }

      // Server-side validation: Check if there are locked students
      const students = await storage.getStudents(10000, 0);
      const lockedStudents = students.filter(s => s.isLocked && s.choice1);
      
      if (lockedStudents.length === 0) {
        return res.status(400).json({ 
          message: "Cannot finalize allocation: No locked students found. At least one student must be locked with preferences." 
        });
      }

      // Server-side validation: Check if all districts are finalized
      const districtStatuses = await storage.getAllDistrictStatuses();
      const eligibleDistricts = new Set<string>();
      students.forEach(student => {
        if (student.districtAdmin && student.choice1 && student.counselingDistrict) {
          eligibleDistricts.add(student.counselingDistrict);
        }
      });

      // Always include SAS Nagar as it's managed by central admin
      eligibleDistricts.add('SAS Nagar');

      const eligibleDistrictStatuses = districtStatuses.filter(ds => eligibleDistricts.has(ds.district));
      const unfinalizedDistricts = eligibleDistrictStatuses.filter(ds => !ds.isFinalized);
      
      if (unfinalizedDistricts.length > 0) {
        return res.status(400).json({ 
          message: `Cannot finalize allocation: ${unfinalizedDistricts.length} districts are not finalized yet: ${unfinalizedDistricts.map(d => d.district).join(', ')}` 
        });
      }
      
      const currentTime = new Date().toISOString();
      
      // Set allocation as finalized
      await storage.setSetting({
        key: 'allocation_finalized',
        value: 'true'
      });
      await storage.setSetting({
        key: 'allocation_finalized_at',
        value: currentTime
      });
      await storage.setSetting({
        key: 'allocation_finalized_by',
        value: req.session.userId
      });

      // Automatically finalize SAS Nagar (Mohali) district when allocation is finalized
      // SAS Nagar is managed directly by central admin
      try {
        const sasNagarStatus = await storage.getDistrictStatus('SAS Nagar');
        if (!sasNagarStatus?.isFinalized) {
          await storage.finalizeDistrict('SAS Nagar', req.session.userId);
          
          await auditService.log(req.session.userId, 'district_finalized', 'district', 'SAS Nagar', {
            reason: 'Auto-finalized during allocation finalization',
            finalizedBy: req.session.userId,
            finalizedAt: currentTime
          }, req.ip, req.get('User-Agent'));
        }
      } catch (error) {
        console.warn('Warning: Could not auto-finalize SAS Nagar district during allocation finalization:', error);
        // Continue with allocation finalization even if SAS Nagar finalization fails
      }
      
      await auditService.log(req.session.userId, 'allocation_finalize', 'allocation', 'system', {
        finalizedBy: req.session.userId,
        finalizedAt: currentTime
      }, req.ip, req.get('User-Agent'));

      res.json({ 
        message: "Allocation process finalized successfully",
        finalizedAt: currentTime,
        finalizedBy: user?.username
      });
    } catch (error) {
      console.error("Allocation finalize error:", error);
      res.status(500).json({ message: "Failed to finalize allocation" });
    }
  });

  // Fetch student endpoint
  app.put('/api/students/:id/fetch', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      let { counselingDistrict, districtAdmin } = req.body;
      const user = await storage.getUser(req.session.userId);
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Check if student is already assigned to a district (skip if released)
      if (student.counselingDistrict && !student.isReleased) {
        return res.status(400).json({ message: "Student is already assigned to a district" });
      }

      // For central admin, default to SAS Nagar district if not specified
      if (user?.role === 'central_admin') {
        counselingDistrict = counselingDistrict || 'SAS Nagar';
        districtAdmin = districtAdmin || user.id;
      }

      // District admin can only fetch to their own district
      if (user?.role === 'district_admin' && counselingDistrict !== user.district) {
        return res.status(403).json({ message: "Can only fetch students to your district" });
      }
      
      const updatedStudent = await storage.fetchStudentToDistrict(id, counselingDistrict, districtAdmin);
      
      await auditService.log(req.session.userId, 'student_fetch', 'students', id, {
        fetchedBy: req.session.userId,
        studentName: student.name,
        meritNumber: student.meritNumber,
        toDistrict: counselingDistrict,
        districtAdmin: districtAdmin
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student fetch error:", error);
      res.status(500).json({ message: "Failed to fetch student" });
    }
  });

  // File validation routes (validate without saving to database)
  app.post('/api/files/validate/students', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { academicYear } = req.body;
      if (!academicYear) {
        return res.status(400).json({ message: "Missing required field: academicYear" });
      }

      const result = await fileService.validateStudentFile(req.file, academicYear);
      res.json(result);
    } catch (error) {
      console.error("Validate students file error:", error);
      res.status(500).json({ message: "Failed to validate file", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/files/validate/vacancies', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { academicYear } = req.body;
      if (!academicYear) {
        return res.status(400).json({ message: "Missing required field: academicYear" });
      }

      const result = await fileService.validateVacancyFile(req.file, academicYear);
      res.json(result);
    } catch (error) {
      console.error("Validate vacancies file error:", error);
      res.status(500).json({ message: "Failed to validate file", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/files/validate/entrance-results', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { academicYear } = req.body;
      if (!academicYear) {
        return res.status(400).json({ message: "Missing required field: academicYear" });
      }

      const result = await fileService.validateEntranceResultsFile(req.file, academicYear);
      res.json(result);
    } catch (error) {
      console.error("Validate entrance results file error:", error);
      res.status(500).json({ message: "Failed to validate file", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Students entrance results routes
  app.get('/api/students-entrance-results', isDistrictAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const results = await storage.getStudentsEntranceResults(limit, offset);
      const total = await storage.getStudentsEntranceResultsCount();
      
      res.json({ students: results, total });
    } catch (error) {
      console.error("Get students entrance results error:", error);
      res.status(500).json({ message: "Failed to fetch entrance results" });
    }
  });

  app.get('/api/students-entrance-results/search', isDistrictAdmin, async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.trim().length < 2) {
        return res.json([]);
      }
      
      const results = await storage.searchStudentsEntranceResults(query.trim());
      res.json(results);
    } catch (error) {
      console.error("Search students entrance results error:", error);
      res.status(500).json({ message: "Failed to search entrance results" });
    }
  });

  app.post('/api/students-entrance-results', isCentralAdmin, async (req: any, res) => {
    try {
      const resultData = insertStudentsEntranceResultSchema.parse(req.body);
      const result = await storage.createStudentsEntranceResult(resultData);
      
      await auditService.log(req.user.id, 'entrance_result_create', 'entrance_results', result.id, {
        meritNo: result.meritNo,
        studentName: result.studentName,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Create entrance result error:", error);
      res.status(500).json({ message: "Failed to create entrance result" });
    }
  });

  // Update entrance result route
  app.put('/api/students-entrance-results/:id', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { stream } = req.body;
      
      const existingResult = await storage.getStudentsEntranceResult(id);
      if (!existingResult) {
        return res.status(404).json({ message: "Entrance result not found" });
      }

      const updatedResult = await storage.updateStudentsEntranceResult(id, { stream });
      
      await auditService.log(req.user.id, 'entrance_result_update', 'entrance_results', id, {
        field: 'stream',
        oldValue: existingResult.stream,
        newValue: stream,
        studentName: existingResult.studentName,
        meritNo: existingResult.meritNo,
      }, req.ip, req.get('User-Agent'));

      res.json(updatedResult);
    } catch (error) {
      console.error("Update entrance result error:", error);
      res.status(500).json({ message: "Failed to update entrance result" });
    }
  });

  app.put('/api/students-entrance-results/:entranceResultId/preferences', isDistrictAdmin, async (req: any, res) => {
    try {
      const { entranceResultId } = req.params;
      const { studentId, preferences } = req.body;
      
      // Validate deadline hasn't passed
      const deadline = await storage.getSetting('allocation_deadline');
      if (deadline && new Date() > new Date(deadline.value)) {
        return res.status(403).json({ message: "Deadline has passed. Cannot modify preferences." });
      }

      // Get the student to find their academic year
      const student = await storage.getStudent(studentId);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Get active counseling round for this academic year
      let activeRound = null;
      if (student.academicYear) {
        activeRound = await storage.getActiveCounselingRound(student.academicYear);
      }

      // Add counseling district and district admin info
      const preferencesWithDistrict = {
        ...preferences,
        counselingDistrict: req.user.district,
        districtAdmin: `${req.user.firstName} ${req.user.lastName}`.trim(),
        counselingRoundId: activeRound?.id,
        counselingRoundNumber: activeRound?.roundNumber,
        preferencesUpdatedAt: new Date(),
      };

      const updatedStudent = await storage.updateStudentPreferences(studentId, preferencesWithDistrict);
      
      await auditService.log(req.user.id, 'student_preferences_set', 'students', studentId, {
        entranceResultId,
        preferences: preferencesWithDistrict,
        userDistrict: req.user.district,
        counselingRoundId: activeRound?.id,
        counselingRoundNumber: activeRound?.roundNumber,
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Update student preferences from entrance result error:", error);
      res.status(500).json({ message: "Failed to update student preferences" });
    }
  });

  // Create student from entrance result with preferences
  app.post('/api/students/from-entrance-result', isDistrictAdmin, async (req: any, res) => {
    try {
      const { entranceStudentId, preferences, stream, counselingDistrict, districtAdmin } = req.body;
      
      // Validate deadline hasn't passed
      const deadline = await storage.getSetting('allocation_deadline');
      if (deadline && new Date() > new Date(deadline.value)) {
        return res.status(403).json({ message: "Deadline has passed. Cannot create new students." });
      }

      // Find the entrance result record
      const entranceResult = await storage.getStudentsEntranceResult(entranceStudentId);
      if (!entranceResult) {
        return res.status(404).json({ message: "Entrance result not found" });
      }

      // Check if student already exists
      const existingStudent = await storage.getStudentByMeritNumber(entranceResult.meritNo);
      if (existingStudent) {
        return res.status(400).json({ 
          message: "Student already exists in the system",
          studentId: existingStudent.id
        });
      }

      // Get active counseling round for this academic year
      let activeRound = null;
      if (entranceResult.academicYear) {
        activeRound = await storage.getActiveCounselingRound(entranceResult.academicYear);
      }

      // Create student from entrance result
      const newStudent = await storage.createStudent({
        appNo: entranceResult.applicationNo,
        meritNumber: entranceResult.meritNo,
        name: entranceResult.studentName,
        stream: stream || entranceResult.stream,
        gender: entranceResult.gender,
        category: entranceResult.category,
        academicYear: entranceResult.academicYear,
        counselingDistrict: req.user.district,
        districtAdmin: `${req.user.firstName} ${req.user.lastName}`.trim(),
        counselingRoundId: activeRound?.id,
        counselingRoundNumber: activeRound?.roundNumber,
        ...preferences
      });

      await auditService.log(req.user.id, 'student_create_from_entrance', 'students', newStudent.id, {
        entranceStudentId,
        preferences,
        userDistrict: req.user.district,
      }, req.ip, req.get('User-Agent'));

      res.json(newStudent);
    } catch (error) {
      console.error("Create student from entrance result error:", error);
      res.status(500).json({ message: "Failed to create student from entrance result" });
    }
  });

  // Counseling rounds routes
  app.post('/api/counseling-rounds', isCentralAdmin, async (req: any, res) => {
    try {
      const { academicYear, roundName, startDate, endDate } = req.body;
      
      // Debug logging
      console.log('📅 Received date data:', {
        startDate,
        endDate,
        startDateType: typeof startDate,
        startDateLength: startDate?.length,
        rawBody: JSON.stringify(req.body)
      });
      
      if (!academicYear || !roundName || !startDate) {
        return res.status(400).json({ message: "Missing required fields: academicYear, roundName, startDate" });
      }

      // Validate academic year format
      if (!/^\d{4}-\d{4}$/.test(academicYear)) {
        return res.status(400).json({ message: "Invalid academic year format. Expected: YYYY-YYYY (e.g., 2024-2025)" });
      }

      // Validate that academic year is for current session only
      if (!isCurrentSession(academicYear)) {
        const currentSession = getCurrentSession();
        if (isPreviousSession(academicYear)) {
          return res.status(400).json({ 
            message: `Cannot create counseling rounds for previous sessions. Current session is ${currentSession}.` 
          });
        } else {
          return res.status(400).json({ 
            message: `Cannot create counseling rounds for future sessions. Current session is ${currentSession}.` 
          });
        }
      }

      // Validate and parse startDate
      if (!startDate || startDate.trim() === '') {
        return res.status(400).json({ message: "Start date is required" });
      }
      
      // Validate date string format first
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startDate)) {
        return res.status(400).json({ 
          message: `Invalid start date format. Expected: YYYY-MM-DDTHH:mm (e.g., 2024-06-15T10:00). Received: ${startDate}` 
        });
      }
      
      // Parse date - datetime-local sends dates without timezone, so we need to treat it as local time
      // Create date by parsing the string and ensuring it's treated as local time
      const [datePart, timePart] = startDate.split('T');
      if (!datePart || !timePart) {
        return res.status(400).json({ 
          message: `Invalid start date format. Expected: YYYY-MM-DDTHH:mm. Received: ${startDate}` 
        });
      }
      
      // Parse as local date/time (datetime-local input doesn't include timezone)
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      // Create date in local timezone
      const startDateObj = new Date(year, month - 1, day, hours, minutes);
      const timestamp = startDateObj.getTime();
      
      // Debug logging - safely get ISO string
      let parsedISO: string;
      try {
        parsedISO = !isNaN(timestamp) ? startDateObj.toISOString() : 'Invalid Date';
      } catch (e) {
        parsedISO = 'Invalid Date';
      }
      
      console.log('📅 Parsed date:', {
        original: startDate,
        datePart,
        timePart,
        year, month, day, hours, minutes,
        parsed: parsedISO,
        localString: startDateObj.toString(),
        timestamp,
        yearCheck: startDateObj.getFullYear(),
        isValid: !isNaN(timestamp),
        isAfter2000: startDateObj.getFullYear() >= 2000
      });
      
      if (isNaN(timestamp) || startDateObj.getFullYear() < 2000) {
        console.error('❌ Invalid date detected:', {
          startDate,
          parsed: parsedISO,
          timestamp,
          year: startDateObj.getFullYear()
        });
        return res.status(400).json({ 
          message: `Invalid start date. Please provide a valid date after year 2000. Received: ${startDate}, Parsed: ${parsedISO}` 
        });
      }
      
      // Validate that startDate falls within the current session
      if (!isDateInSession(startDateObj, academicYear)) {
        return res.status(400).json({ 
          message: `Start date must fall within the current session (${academicYear})` 
        });
      }

      // Check if all seats are filled for this counseling title
      const allSeatsFilled = await storage.checkIfAllSeatsFilled(academicYear, roundName);
      if (allSeatsFilled) {
        return res.status(400).json({ 
          message: `Cannot create new rounds for "${roundName}". All seats are currently filled. Please wait for seats to become available or create a new counseling title.` 
        });
      }

      // Parse endDate if provided (convert to date string format YYYY-MM-DD)
      let endDateStr: string | undefined = undefined;
      if (endDate && endDate.trim() !== '') {
        const endDateObj = new Date(endDate);
        if (isNaN(endDateObj.getTime())) {
          return res.status(400).json({ 
            message: `Invalid end date format. Expected: YYYY-MM-DDTHH:mm (e.g., 2024-06-30T18:00)` 
          });
        }
        // Convert Date to date string (YYYY-MM-DD) for the date column
        endDateStr = endDateObj.toISOString().split('T')[0];
      }

      // Final validation - ensure startDateObj is valid before storing
      if (!startDateObj || isNaN(startDateObj.getTime())) {
        console.error('❌ Attempted to create round with invalid startDate:', startDateObj);
        return res.status(400).json({ 
          message: "Invalid start date. Cannot create round with null or invalid date." 
        });
      }

      // Round number will be auto-incremented by storage.createCounselingRound
      // startDate is now a timestamp (datetime)
      // endDate is optional - can be set later when round is completed
      const round = await storage.createCounselingRound({
        academicYear,
        roundNumber: 0, // Will be auto-incremented
        roundName, // Required field
        startDate: startDateObj, // Store as timestamp - MUST be valid Date object
        endDate: endDateStr, // Optional - date string format YYYY-MM-DD
        isActive: false,
        isCompleted: false,
      });

      await auditService.log(req.session.userId, 'counseling_round_created', 'counseling_round', round.id, {
        academicYear,
        roundNumber: round.roundNumber,
        roundName: round.roundName,
      }, req.ip, req.get('User-Agent'));

      res.json(round);
    } catch (error) {
      console.error("Create counseling round error:", error);
      res.status(500).json({ message: "Failed to create counseling round" });
    }
  });

  // Get current session endpoint
  app.get('/api/session/current', isAuthenticated, async (req: any, res) => {
    try {
      const currentSession = getCurrentSession();
      res.json({ currentSession });
    } catch (error) {
      console.error("Get current session error:", error);
      res.status(500).json({ message: "Failed to get current session" });
    }
  });

  app.get('/api/counseling-rounds', isAuthenticated, async (req: any, res) => {
    try {
      const academicYear = req.query.academicYear as string | undefined;
      console.log('📋 Fetching counseling rounds for academic year:', academicYear);
      const rounds = await storage.getCounselingRounds(academicYear);
      console.log(`📋 Found ${rounds.length} rounds from database`);
      
      // Serialize dates properly to ensure they're valid ISO strings
      // Wrap in try-catch to ensure rounds are returned even if date serialization fails
      const serializedRounds = rounds.map((round, index) => {
        try {
          console.log(`\n📅 Processing round ${index + 1}/${rounds.length}:`, {
            id: round.id,
            roundName: round.roundName,
            roundNumber: round.roundNumber
          });
          
          const startDate = round.startDate as any;
          const endDate = round.endDate as any;
          const createdAt = round.createdAt as any;
          const updatedAt = round.updatedAt as any;
          
          console.log(`  Raw date values:`, {
            startDate: startDate,
            startDateType: typeof startDate,
            startDateIsDate: startDate instanceof Date,
            endDate: endDate,
            endDateType: typeof endDate,
            createdAt: createdAt,
            createdAtType: typeof createdAt,
            updatedAt: updatedAt,
            updatedAtType: typeof updatedAt
          });
          
          // Handle startDate - Drizzle may return Date objects or strings
          // Always try to serialize the date, even if it seems null/undefined
          let serializedStartDate: string | null = null;
          
          console.log(`  Processing startDate:`, { value: startDate, type: typeof startDate, isDate: startDate instanceof Date });
          
          // Check if startDate exists in any form
          if (startDate != null && startDate !== 'null' && startDate !== '' && startDate !== undefined) {
            try {
              let dateObj: Date | null = null;
              
              if (startDate instanceof Date) {
                console.log(`    startDate is Date object`);
                // Already a Date object - validate it
                const timeValue = startDate.getTime();
                if (!isNaN(timeValue)) {
                  dateObj = startDate;
                  try {
                    console.log(`    Valid Date object: ${dateObj.toISOString()}`);
                  } catch (e) {
                    console.log(`    Valid Date object (toISOString failed):`, dateObj);
                  }
                } else {
                  console.warn(`    Invalid Date object (NaN):`, startDate);
                }
              } else if (typeof startDate === 'string') {
                console.log(`    startDate is string: "${startDate}"`);
                // Validate string is not empty and looks like a date
                const trimmed = startDate.trim();
                if (trimmed && trimmed.length > 0) {
                  try {
                    const parsed = new Date(trimmed);
                    const timeValue = parsed.getTime();
                    if (!isNaN(timeValue)) {
                      dateObj = parsed;
                      try {
                        console.log(`    Parsed string to valid Date: ${dateObj.toISOString()}`);
                      } catch (e) {
                        console.log(`    Parsed string to valid Date (toISOString failed):`, dateObj);
                      }
                    } else {
                      console.warn(`    Parsed string to invalid Date (NaN):`, trimmed);
                    }
                  } catch (parseError) {
                    console.error(`    Error parsing string to Date:`, parseError);
                  }
                } else {
                  console.warn(`    Empty or whitespace-only string`);
                }
              } else if (typeof startDate === 'number') {
                console.log(`    startDate is number: ${startDate}`);
                // Might be a timestamp - validate it's reasonable
                if (startDate > 0 && startDate < Number.MAX_SAFE_INTEGER) {
                  try {
                    const parsed = new Date(startDate);
                    const timeValue = parsed.getTime();
                    if (!isNaN(timeValue)) {
                      dateObj = parsed;
                      try {
                        console.log(`    Parsed number to valid Date: ${dateObj.toISOString()}`);
                      } catch (e) {
                        console.log(`    Parsed number to valid Date (toISOString failed):`, dateObj);
                      }
                    } else {
                      console.warn(`    Parsed number to invalid Date (NaN):`, startDate);
                    }
                  } catch (parseError) {
                    console.error(`    Error parsing number to Date:`, parseError);
                  }
                } else {
                  console.warn(`    Invalid number range:`, startDate);
                }
              } else {
                console.warn(`    Unknown startDate type:`, typeof startDate, startDate);
              }
              
              // Only serialize if we have a valid date object
              if (dateObj && !isNaN(dateObj.getTime())) {
                try {
                  serializedStartDate = dateObj.toISOString();
                  console.log(`    ✅ Serialized startDate: ${serializedStartDate}`);
                } catch (isoError) {
                  console.error('    ❌ Error converting date to ISO:', isoError);
                }
              } else {
                console.warn(`    ⚠️ No valid date object created for startDate`);
              }
            } catch (error) {
              console.error('    ❌ Exception during startDate serialization:', error);
            }
          } else {
            console.warn(`  ⚠️ startDate is null/empty/undefined`);
          }
          
          // Safely serialize endDate
          let serializedEndDate: string | null = null;
          if (endDate != null && endDate !== 'null' && endDate !== '' && endDate !== undefined) {
            try {
              if (endDate instanceof Date) {
                const timeValue = endDate.getTime();
                if (!isNaN(timeValue)) {
                  serializedEndDate = endDate.toISOString().split('T')[0];
                }
              } else if (typeof endDate === 'string' && endDate.trim().length > 0) {
                const parsed = new Date(endDate);
                if (!isNaN(parsed.getTime())) {
                  serializedEndDate = parsed.toISOString().split('T')[0];
                } else {
                  serializedEndDate = String(endDate);
                }
              } else {
                serializedEndDate = String(endDate);
              }
            } catch (e) {
              console.error(`    ❌ Error serializing endDate:`, e);
              serializedEndDate = String(endDate);
            }
          }
          
          // Safely serialize createdAt
          let serializedCreatedAt: string | null = null;
          if (createdAt != null) {
            try {
              if (createdAt instanceof Date) {
                const timeValue = createdAt.getTime();
                if (!isNaN(timeValue)) {
                  serializedCreatedAt = createdAt.toISOString();
                } else {
                  serializedCreatedAt = String(createdAt);
                }
              } else if (typeof createdAt === 'string') {
                const parsed = new Date(createdAt);
                if (!isNaN(parsed.getTime())) {
                  serializedCreatedAt = parsed.toISOString();
                } else {
                  serializedCreatedAt = String(createdAt);
                }
              } else {
                serializedCreatedAt = String(createdAt);
              }
            } catch (e) {
              console.error(`    ❌ Error serializing createdAt:`, e);
              serializedCreatedAt = String(createdAt);
            }
          }
          
          // Safely serialize updatedAt
          let serializedUpdatedAt: string | null = null;
          if (updatedAt != null) {
            try {
              if (updatedAt instanceof Date) {
                const timeValue = updatedAt.getTime();
                if (!isNaN(timeValue)) {
                  serializedUpdatedAt = updatedAt.toISOString();
                } else {
                  serializedUpdatedAt = String(updatedAt);
                }
              } else if (typeof updatedAt === 'string') {
                const parsed = new Date(updatedAt);
                if (!isNaN(parsed.getTime())) {
                  serializedUpdatedAt = parsed.toISOString();
                } else {
                  serializedUpdatedAt = String(updatedAt);
                }
              } else {
                serializedUpdatedAt = String(updatedAt);
              }
            } catch (e) {
              console.error(`    ❌ Error serializing updatedAt:`, e);
              serializedUpdatedAt = String(updatedAt);
            }
          }
          
          const result = {
            ...round,
            startDate: serializedStartDate,
            endDate: serializedEndDate,
            createdAt: serializedCreatedAt,
            updatedAt: serializedUpdatedAt,
          };
          
          console.log(`  ✅ Round ${index + 1} serialized successfully`);
          return result;
        } catch (error) {
          console.error(`❌ Error serializing round ${index + 1}:`, { 
            roundId: round.id, 
            roundName: round.roundName,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          // Return round with original dates if serialization fails
          const fallback = {
            ...round,
            startDate: round.startDate ? String(round.startDate) : null,
            endDate: round.endDate ? String(round.endDate) : null,
            createdAt: round.createdAt ? String(round.createdAt) : null,
            updatedAt: round.updatedAt ? String(round.updatedAt) : null,
          };
          console.log(`  ⚠️ Using fallback serialization for round ${index + 1}`);
          return fallback;
        }
      });
      
      console.log(`✅ Serialized ${serializedRounds.length} rounds, sending to client`);
      res.json(serializedRounds);
    } catch (error) {
      console.error("❌ Get counseling rounds error:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      res.status(500).json({ 
        message: "Failed to fetch counseling rounds", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.get('/api/counseling-rounds/active', isAuthenticated, async (req: any, res) => {
    try {
      const academicYear = req.query.academicYear as string;
      if (!academicYear) {
        return res.status(400).json({ message: "academicYear query parameter is required" });
      }
      const round = await storage.getActiveCounselingRound(academicYear);
      res.json(round || null);
    } catch (error) {
      console.error("Get active counseling round error:", error);
      res.status(500).json({ message: "Failed to fetch active counseling round" });
    }
  });

  app.put('/api/counseling-rounds/:id', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Remove fields that shouldn't be updated directly
      delete updates.id;
      delete updates.createdAt;
      
      // Only allow updating startDate
      if (updates.startDate) {
        const round = await storage.getCounselingRound(id);
        if (!round) {
          return res.status(404).json({ message: "Counseling round not found" });
        }
        
        // Validate and parse startDate
        if (!updates.startDate || updates.startDate.trim() === '') {
          return res.status(400).json({ message: "Start date cannot be empty" });
        }
        
        // Debug logging
        console.log('📅 Update - Received date:', {
          startDate: updates.startDate,
          startDateType: typeof updates.startDate,
          startDateLength: updates.startDate?.length
        });
        
        // Validate date string format first
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(updates.startDate)) {
          return res.status(400).json({ 
            message: `Invalid start date format. Expected: YYYY-MM-DDTHH:mm (e.g., 2024-06-15T10:00). Received: ${updates.startDate}` 
          });
        }
        
        // Parse date - datetime-local sends dates without timezone, treat as local time
        const [datePart, timePart] = updates.startDate.split('T');
        if (!datePart || !timePart) {
          return res.status(400).json({ 
            message: `Invalid start date format. Expected: YYYY-MM-DDTHH:mm. Received: ${updates.startDate}` 
          });
        }
        
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const startDateObj = new Date(year, month - 1, day, hours, minutes);
        
        // Debug logging - safely get ISO string
        const updateTimestamp = startDateObj.getTime();
        let updateParsedISO: string;
        try {
          updateParsedISO = !isNaN(updateTimestamp) ? startDateObj.toISOString() : 'Invalid Date';
        } catch (e) {
          updateParsedISO = 'Invalid Date';
        }
        
        console.log('📅 Update - Parsed date:', {
          original: updates.startDate,
          datePart,
          timePart,
          year, month, day, hours, minutes,
          parsed: updateParsedISO,
          localString: startDateObj.toString(),
          timestamp: updateTimestamp,
          yearCheck: startDateObj.getFullYear()
        });
        
        if (isNaN(updateTimestamp) || startDateObj.getFullYear() < 2000) {
          console.error('❌ Update - Invalid date detected:', {
            startDate: updates.startDate,
            parsed: updateParsedISO,
            timestamp: updateTimestamp,
            year: startDateObj.getFullYear()
          });
          return res.status(400).json({ 
            message: `Invalid start date. Please provide a valid date after year 2000. Received: ${updates.startDate}` 
          });
        }
        
        // Validate that new startDate falls within the session
        if (!isDateInSession(startDateObj, round.academicYear)) {
          return res.status(400).json({ 
            message: `Start date must fall within the current session (${round.academicYear})` 
          });
        }
        
        updates.startDate = startDateObj;
      } else {
        // If not updating startDate, remove other fields that shouldn't be updated
        delete updates.endDate;
        delete updates.academicYear;
        delete updates.roundNumber;
        delete updates.roundName;
      }

      const updated = await storage.updateCounselingRound(id, updates);
      
      // Serialize dates properly in response
      const startDate = updated.startDate as any;
      const endDate = updated.endDate as any;
      const createdAt = updated.createdAt as any;
      const updatedAt = updated.updatedAt as any;
      
      // Safely serialize startDate
      let serializedStartDate: string | null = null;
      if (startDate instanceof Date) {
        try {
          if (!isNaN(startDate.getTime())) {
            serializedStartDate = startDate.toISOString();
          }
        } catch (e) {
          serializedStartDate = String(startDate);
        }
      } else if (startDate) {
        try {
          const parsed = new Date(startDate);
          if (!isNaN(parsed.getTime())) {
            serializedStartDate = parsed.toISOString();
          } else {
            serializedStartDate = String(startDate);
          }
        } catch (e) {
          serializedStartDate = String(startDate);
        }
      }
      
      // Safely serialize endDate
      let serializedEndDate: string | null = null;
      if (endDate) {
        try {
          if (endDate instanceof Date && !isNaN(endDate.getTime())) {
            serializedEndDate = endDate.toISOString().split('T')[0];
          } else {
            serializedEndDate = String(endDate);
          }
        } catch (e) {
          serializedEndDate = String(endDate);
        }
      }
      
      // Safely serialize createdAt
      let serializedCreatedAt: string | null = null;
      if (createdAt) {
        try {
          if (createdAt instanceof Date && !isNaN(createdAt.getTime())) {
            serializedCreatedAt = createdAt.toISOString();
          } else if (typeof createdAt === 'string') {
            serializedCreatedAt = createdAt;
          } else {
            serializedCreatedAt = String(createdAt);
          }
        } catch (e) {
          serializedCreatedAt = String(createdAt);
        }
      }
      
      // Safely serialize updatedAt
      let serializedUpdatedAt: string | null = null;
      if (updatedAt) {
        try {
          if (updatedAt instanceof Date && !isNaN(updatedAt.getTime())) {
            serializedUpdatedAt = updatedAt.toISOString();
          } else if (typeof updatedAt === 'string') {
            serializedUpdatedAt = updatedAt;
          } else {
            serializedUpdatedAt = String(updatedAt);
          }
        } catch (e) {
          serializedUpdatedAt = String(updatedAt);
        }
      }
      
      const serializedRound = {
        ...updated,
        startDate: serializedStartDate,
        endDate: serializedEndDate,
        createdAt: serializedCreatedAt,
        updatedAt: serializedUpdatedAt,
      };

      await auditService.log(req.session.userId, 'counseling_round_updated', 'counseling_round', id, {
        updates,
      }, req.ip, req.get('User-Agent'));

      res.json(serializedRound);
    } catch (error) {
      console.error("Update counseling round error:", error);
      res.status(500).json({ message: "Failed to update counseling round" });
    }
  });

  app.post('/api/counseling-rounds/:id/activate', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const round = await storage.getCounselingRound(id);
      
      if (!round) {
        return res.status(404).json({ message: "Counseling round not found" });
      }

      if (round.isCompleted) {
        return res.status(400).json({ message: "Cannot activate a completed counseling round" });
      }

      const activated = await storage.activateCounselingRound(id, round.academicYear);

      await auditService.log(req.session.userId, 'counseling_round_activated', 'counseling_round', id, {
        academicYear: round.academicYear,
        roundNumber: round.roundNumber,
      }, req.ip, req.get('User-Agent'));

      res.json(activated);
    } catch (error) {
      console.error("Activate counseling round error:", error);
      res.status(500).json({ message: "Failed to activate counseling round" });
    }
  });

  app.post('/api/counseling-rounds/:id/complete', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const round = await storage.getCounselingRound(id);
      
      if (!round) {
        return res.status(404).json({ message: "Counseling round not found" });
      }

      const completed = await storage.completeCounselingRound(id);

      await auditService.log(req.session.userId, 'counseling_round_completed', 'counseling_round', id, {
        academicYear: round.academicYear,
        roundNumber: round.roundNumber,
      }, req.ip, req.get('User-Agent'));

      res.json(completed);
    } catch (error) {
      console.error("Complete counseling round error:", error);
      res.status(500).json({ message: "Failed to complete counseling round" });
    }
  });

  app.post('/api/counseling-rounds/bulk', isCentralAdmin, async (req: any, res) => {
    try {
      const { rounds } = req.body; // Array of { academicYear, roundName, startDate, endDate }
      
      if (!Array.isArray(rounds) || rounds.length === 0) {
        return res.status(400).json({ message: "rounds array is required and must not be empty" });
      }

      const currentSession = getCurrentSession();

      // Validate all rounds
      for (const round of rounds) {
        if (!round.academicYear || !round.roundName || !round.startDate) {
          return res.status(400).json({ message: "All rounds must have academicYear, roundName, and startDate" });
        }

        if (!/^\d{4}-\d{4}$/.test(round.academicYear)) {
          return res.status(400).json({ message: "Invalid academic year format. Expected: YYYY-YYYY (e.g., 2024-2025)" });
        }

        // Validate that academic year is for current session only
        if (!isCurrentSession(round.academicYear)) {
          if (isPreviousSession(round.academicYear)) {
            return res.status(400).json({ 
              message: `Cannot create counseling rounds for previous sessions. Current session is ${currentSession}.` 
            });
          } else {
            return res.status(400).json({ 
              message: `Cannot create counseling rounds for future sessions. Current session is ${currentSession}.` 
            });
          }
        }

        // Check if all seats are filled for this counseling title
        const allSeatsFilled = await storage.checkIfAllSeatsFilled(round.academicYear, round.roundName);
        if (allSeatsFilled) {
          return res.status(400).json({ 
            message: `Cannot create new rounds for "${round.roundName}". All seats are currently filled. Please wait for seats to become available or create a new counseling title.` 
          });
        }

        // Validate and parse startDate
        if (!round.startDate || round.startDate.trim() === '') {
          return res.status(400).json({ 
            message: `Start date is required for round "${round.roundName}"` 
          });
        }
        
        // Validate date string format first
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(round.startDate)) {
          return res.status(400).json({ 
            message: `Invalid start date format for round "${round.roundName}". Expected: YYYY-MM-DDTHH:mm (e.g., 2024-06-15T10:00). Received: ${round.startDate}` 
          });
        }
        
        // Parse date - datetime-local sends dates without timezone, treat as local time
        const [datePart, timePart] = round.startDate.split('T');
        if (!datePart || !timePart) {
          return res.status(400).json({ 
            message: `Invalid start date format for round "${round.roundName}". Expected: YYYY-MM-DDTHH:mm. Received: ${round.startDate}` 
          });
        }
        
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const startDateObj = new Date(year, month - 1, day, hours, minutes);
        
        if (isNaN(startDateObj.getTime()) || startDateObj.getFullYear() < 2000) {
          return res.status(400).json({ 
            message: `Invalid start date for round "${round.roundName}". Please provide a valid date after year 2000. Received: ${round.startDate}` 
          });
        }
        
        // Validate that startDate falls within the current session
        if (!isDateInSession(startDateObj, round.academicYear)) {
          return res.status(400).json({ 
            message: `Start date for round "${round.roundName}" must fall within the current session (${round.academicYear})` 
          });
        }
      }

      // Convert datetime-local to timestamp
      const roundsToCreate = rounds.map(round => {
        // Validate and parse startDate
        if (!round.startDate || round.startDate.trim() === '') {
          throw new Error(`Start date is required for round "${round.roundName}"`);
        }
        
        // Validate date string format first
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(round.startDate)) {
          throw new Error(`Invalid start date format for round "${round.roundName}". Expected: YYYY-MM-DDTHH:mm (e.g., 2024-06-15T10:00). Received: ${round.startDate}`);
        }
        
        // Parse date - datetime-local sends dates without timezone, treat as local time
        const [datePart, timePart] = round.startDate.split('T');
        if (!datePart || !timePart) {
          throw new Error(`Invalid start date format for round "${round.roundName}". Expected: YYYY-MM-DDTHH:mm. Received: ${round.startDate}`);
        }
        
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const startDateObj = new Date(year, month - 1, day, hours, minutes);
        
        if (isNaN(startDateObj.getTime()) || startDateObj.getFullYear() < 2000) {
          throw new Error(`Invalid start date for round "${round.roundName}". Please provide a valid date after year 2000. Received: ${round.startDate}`);
        }
        
        // Parse endDate if provided (convert to date string format YYYY-MM-DD)
        let endDateStr: string | undefined = undefined;
        if (round.endDate && round.endDate.trim() !== '') {
          const endDateObj = new Date(round.endDate);
          if (isNaN(endDateObj.getTime())) {
            throw new Error(`Invalid end date format for round "${round.roundName}". Expected: YYYY-MM-DDTHH:mm`);
          }
          // Convert Date to date string (YYYY-MM-DD) for the date column
          endDateStr = endDateObj.toISOString().split('T')[0];
        }
        
        return {
          academicYear: round.academicYear,
          roundNumber: 0, // Will be auto-incremented
          roundName: round.roundName,
          startDate: startDateObj, // Store as timestamp
          endDate: endDateStr, // Optional - date string format YYYY-MM-DD
          isActive: false,
          isCompleted: false,
        };
      });

      const createdRounds = await storage.bulkCreateCounselingRounds(roundsToCreate);

      await auditService.log(req.session.userId, 'counseling_rounds_bulk_created', 'counseling_round', 'bulk', {
        count: createdRounds.length,
        rounds: createdRounds.map(r => ({ id: r.id, roundName: r.roundName, roundNumber: r.roundNumber })),
      }, req.ip, req.get('User-Agent'));

      res.json(createdRounds);
    } catch (error: any) {
      console.error("Bulk create counseling rounds error:", error);
      res.status(500).json({ message: error.message || "Failed to create counseling rounds" });
    }
  });

  app.delete('/api/counseling-rounds/:id', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const round = await storage.getCounselingRound(id);
      
      if (!round) {
        return res.status(404).json({ message: "Counseling round not found" });
      }

      // Prevent deletion of past rounds
      const startDate = new Date(round.startDate);
      const now = new Date();
      if (startDate < now) {
        return res.status(400).json({ 
          message: "Cannot delete past counseling rounds. Only future rounds can be deleted." 
        });
      }

      await storage.deleteCounselingRound(id);

      await auditService.log(req.session.userId, 'counseling_round_deleted', 'counseling_round', id, {
        academicYear: round.academicYear,
        roundNumber: round.roundNumber,
        roundName: round.roundName,
      }, req.ip, req.get('User-Agent'));

      res.json({ message: "Counseling round deleted successfully" });
    } catch (error: any) {
      console.error("Delete counseling round error:", error);
      res.status(400).json({ message: error.message || "Failed to delete counseling round" });
    }
  });

  app.post('/api/counseling-rounds/:id/run-allocation', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const round = await storage.getCounselingRound(id);
      
      if (!round) {
        return res.status(404).json({ message: "Counseling round not found" });
      }

      // Validate that allocation can only be run for current session
      if (!isCurrentSession(round.academicYear)) {
        const currentSession = getCurrentSession();
        if (isPreviousSession(round.academicYear)) {
          return res.status(400).json({ 
            message: `Cannot run allocation for previous sessions. Current session is ${currentSession}.` 
          });
        } else {
          return res.status(400).json({ 
            message: `Cannot run allocation for future sessions. Current session is ${currentSession}.` 
          });
        }
      }

      if (!round.isActive) {
        return res.status(400).json({ message: "Cannot run allocation for an inactive round. Round will activate automatically when start date/time is reached." });
      }

      // Validate round order: Cannot run round N before round N-1 is completed
      const allRounds = await storage.getCounselingRounds(round.academicYear);
      const sameCounselingRounds = allRounds.filter(r => 
        r.roundName === round.roundName && 
        r.academicYear === round.academicYear
      ).sort((a, b) => a.roundNumber - b.roundNumber);
      
      // Check if previous rounds exist and are completed
      for (let i = 1; i < round.roundNumber; i++) {
        const previousRound = sameCounselingRounds.find(r => r.roundNumber === i);
        if (previousRound && !previousRound.isCompleted) {
          return res.status(400).json({ 
            message: `Cannot run Round ${round.roundNumber} before Round ${i} is completed. Please complete Round ${i} first.` 
          });
        }
      }

      // Create allocation service with audit logging
      const allocationService = new AllocationService(storage, auditService, req.session.userId);
      
      const result = await allocationService.runAllocation(
        round.academicYear,
        round.roundNumber,
        round.id
      );

      await auditService.log(req.session.userId, 'allocation_run_for_round', 'allocation', round.id, {
        academicYear: round.academicYear,
        roundNumber: round.roundNumber,
        roundName: round.roundName,
        result: {
          totalStudents: result.totalStudents,
          allottedStudents: result.allottedStudents,
          notAllottedStudents: result.notAllottedStudents,
        },
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error: any) {
      console.error("Run allocation for round error:", error);
      res.status(500).json({ message: error.message || "Failed to run allocation" });
    }
  });

  // Round activation endpoint (can be called manually or by cron)
  app.post('/api/counseling-rounds/auto-activate', isCentralAdmin, async (req: any, res) => {
    try {
      const result = await roundActivationService.processRounds();
      
      await auditService.log(req.session.userId, 'round_auto_activation_triggered', 'counseling_round', 'system', {
        activated: result.activated.map(r => ({ id: r.id, roundName: r.roundName, roundNumber: r.roundNumber })),
        completed: result.completed.map(r => ({ id: r.id, roundName: r.roundName, roundNumber: r.roundNumber })),
        deactivated: result.deactivated,
      }, req.ip, req.get('User-Agent'));

      res.json({
        success: true,
        activated: result.activated.length,
        completed: result.completed.length,
        deactivated: result.deactivated,
        activatedRounds: result.activated,
        completedRounds: result.completed,
      });
    } catch (error: any) {
      console.error("Auto-activate rounds error:", error);
      res.status(500).json({ message: error.message || "Failed to auto-activate rounds" });
    }
  });

  // Vacancies routes
  app.get('/api/vacancies', isAuthenticated, async (req: any, res) => {
    try {
      const academicYear = req.query.academicYear as string | undefined;
      const vacancies = await storage.getVacancies(academicYear);
      res.json(vacancies);
    } catch (error) {
      console.error("Get vacancies error:", error);
      res.status(500).json({ message: "Failed to fetch vacancies" });
    }
  });

  // Allocation routes
  app.post('/api/allocation/run', isCentralAdmin, async (req: any, res) => {
    try {
      // Create allocation service with audit logging
      const allocationService = new AllocationService(storage, auditService, req.session.userId);
      
      // Note: We allow re-running allocation after reset, so we don't check allocation_completed here
      // The reset endpoint will clear the allocation_completed flag

      const { academicYear, roundNumber } = req.body;

      if (!academicYear || !roundNumber) {
        return res.status(400).json({ message: "Missing required fields: academicYear and roundNumber" });
      }

      // Validate academic year format
      if (!/^\d{4}-\d{4}$/.test(academicYear)) {
        return res.status(400).json({ message: "Invalid academic year format. Expected: YYYY-YYYY (e.g., 2024-2025)" });
      }

      // Get the counseling round
      const rounds = await storage.getCounselingRounds(academicYear);
      const round = rounds.find(r => r.roundNumber === roundNumber);
      
      if (!round) {
        return res.status(404).json({ message: `Counseling round ${roundNumber} not found for academic year ${academicYear}` });
      }

      if (!round.isActive) {
        return res.status(400).json({ message: `Counseling round ${roundNumber} is not active. Please activate it first.` });
      }

      if (round.isCompleted) {
        return res.status(400).json({ message: `Counseling round ${roundNumber} is already completed.` });
      }

      // Check if all districts with eligible students are finalized
      const allDistrictStatuses = await storage.getAllDistrictStatuses();
      const studentsData = await storage.getStudents(10000, 0, academicYear);
      
      // Get list of districts that have students with district admin assignments and preferences
      const districtsWithEligibleStudents = new Set<string>();
      studentsData.forEach((student) => {
        if (student.districtAdmin && student.choice1 && student.counselingDistrict) {
          districtsWithEligibleStudents.add(student.counselingDistrict);
        }
      });

      // Check if all districts with eligible students are finalized
      const unfinalizedDistricts: string[] = [];
      districtsWithEligibleStudents.forEach(district => {
        const normalizedDistrict = normalizeDistrict(district);
        const districtStatus = allDistrictStatuses.find(status => normalizeDistrict(status.district) === normalizedDistrict);
        if (!districtStatus || !districtStatus.isFinalized) {
          unfinalizedDistricts.push(district);
        }
      });

      if (unfinalizedDistricts.length > 0) {
        return res.status(400).json({ 
          message: `Cannot run allocation: ${unfinalizedDistricts.length} districts with eligible students are not finalized. All districts must finalize their data before allocation can be run.`,
          unfinalizedDistricts,
          totalDistricts: districtsWithEligibleStudents.size
        });
      }

      const result = await allocationService.runAllocation(academicYear, roundNumber, round.id);
      
      // Mark allocation as completed
      await storage.setSetting({
        key: 'allocation_completed',
        value: 'true',
        description: 'Indicates if the final allocation has been run'
      });
      
      await storage.setSetting({
        key: 'allocation_completed_at',
        value: new Date().toISOString(),
        description: 'Timestamp when allocation was completed'
      });

      // Main audit log (detailed logs are already logged by AllocationService)
      await auditService.log(req.session.userId, 'allocation_run', 'allocation', 'system', {
        academicYear,
        roundNumber,
        totalStudents: result.totalStudents,
        allottedStudents: result.allottedStudents,
        notAllottedStudents: result.notAllottedStudents,
        allocationsByDistrict: result.allocationsByDistrict,
        logsCount: result.logs.length
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Run allocation error:", error);
      res.status(500).json({ message: "Failed to run allocation" });
    }
  });

  // Reset allocation - clears all previous allocations
  app.post('/api/allocation/reset', isCentralAdmin, async (req: any, res) => {
    try {
      const { academicYear } = req.body;

      if (!academicYear) {
        return res.status(400).json({ message: "Missing required field: academicYear" });
      }

      // Validate academic year format
      if (!/^\d{4}-\d{4}$/.test(academicYear)) {
        return res.status(400).json({ message: "Invalid academic year format. Expected: YYYY-YYYY (e.g., 2024-2025)" });
      }

      // Create allocation service with audit logging
      const allocationService = new AllocationService(storage, auditService, req.session.userId);
      
      const result = await allocationService.resetAllocation(academicYear);
      
      // Clear allocation completed flag
      await storage.setSetting({
        key: 'allocation_completed',
        value: 'false',
        description: 'Indicates if the final allocation has been run'
      });
      
      await storage.setSetting({
        key: 'allocation_completed_at',
        value: '',
        description: 'Timestamp when allocation was completed'
      });

      // Main audit log
      await auditService.log(req.session.userId, 'allocation_reset', 'allocation', 'system', {
        clearedStudents: result.clearedStudents,
        restoredVacancies: result.restoredVacancies,
        logsCount: result.logs.length
      }, req.ip, req.get('User-Agent'));

      res.json({
        success: true,
        message: 'Allocation reset completed successfully',
        ...result
      });
    } catch (error) {
      console.error("Reset allocation error:", error);
      res.status(500).json({ message: "Failed to reset allocation", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/allocation/status', isAuthenticated, async (req, res) => {
    try {
      const allocationCompleted = await storage.getSetting('allocation_completed');
      const allocationCompletedAt = await storage.getSetting('allocation_completed_at');
      const deadline = await storage.getSetting('allocation_deadline');
      
      res.json({
        completed: allocationCompleted?.value === 'true',
        completedAt: allocationCompletedAt?.value || null,
        deadline: deadline?.value,
      });
    } catch (error) {
      console.error("Get allocation status error:", error);
      res.status(500).json({ message: "Failed to fetch allocation status" });
    }
  });

  app.get('/api/allocation/stats', isAuthenticated, async (req, res) => {
    try {
      // Get total students from entrance results (all students)
      const totalEntranceResults = await storage.getStudentsEntranceResultsCount();
      
      // Get students with allocation data (only those with preferences set)
      const students = await storage.getStudents(10000, 0);
      const allottedStudents = students.filter(s => s.allocationStatus === 'allotted');
      const notAllottedStudents = students.filter(s => s.allocationStatus === 'not_allotted');
      const pendingStudents = students.filter(s => s.allocationStatus === 'pending');
      
      // Calculate students without preferences (in entrance results but not in students table)
      const studentsWithoutPreferences = totalEntranceResults - students.length;
      
      // Group allotted students by district
      const allocationsByDistrict: Record<string, number> = {};
      allottedStudents.forEach(student => {
        if (student.allottedDistrict) {
          allocationsByDistrict[student.allottedDistrict] = (allocationsByDistrict[student.allottedDistrict] || 0) + 1;
        }
      });

      res.json({
        totalStudents: totalEntranceResults, // Total from entrance results
        allottedStudents: allottedStudents.length,
        notAllottedStudents: notAllottedStudents.length,
        pendingStudents: pendingStudents.length,
        studentsWithoutPreferences: studentsWithoutPreferences,
        studentsWithPreferences: students.length,
        allocationsByDistrict,
      });
    } catch (error) {
      console.error("Get allocation stats error:", error);
      res.status(500).json({ message: "Failed to fetch allocation stats" });
    }
  });

  // Export routes
  app.get('/api/export/csv', isCentralAdmin, async (req: any, res) => {
    try {
      const csvData = await exportService.exportResultsAsCSV();
      
      await auditService.log(req.user.id, 'export_csv', 'export', 'results', {
        format: 'csv',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=allocation_results.csv');
      res.send(csvData);
    } catch (error) {
      console.error("Export CSV error:", error);
      res.status(500).json({ message: "Failed to export CSV" });
    }
  });

  // Export remaining vacancies as CSV
  app.get('/api/export/vacancies/csv', isCentralAdmin, async (req: any, res) => {
    try {
      const csvData = await exportService.exportVacanciesAsCSV();
      
      await auditService.log(req.user.id, 'export_vacancies_csv', 'export', 'vacancies', {
        format: 'csv',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=remaining_vacancies.csv');
      res.send(csvData);
    } catch (error) {
      console.error("Export vacancies CSV error:", error);
      res.status(500).json({ message: "Failed to export vacancies CSV" });
    }
  });

  // Export remaining vacancies as PDF
  app.get('/api/export/vacancies/pdf', isCentralAdmin, async (req: any, res) => {
    try {
      const pdfBuffer = await exportService.exportVacanciesAsPDF();
      
      await auditService.log(req.user.id, 'export_vacancies_pdf', 'export', 'vacancies', {
        format: 'pdf',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=remaining_vacancies.pdf');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Export vacancies PDF error:", error);
      res.status(500).json({ message: "Failed to export vacancies PDF" });
    }
  });

  app.get('/api/export/pdf', isCentralAdmin, async (req: any, res) => {
    try {
      const pdfBuffer = await exportService.exportResultsAsPDF();
      
      await auditService.log(req.user.id, 'export_pdf', 'export', 'results', {
        format: 'pdf',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=allocation_results.pdf');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Export PDF error:", error);
      res.status(500).json({ message: "Failed to export PDF" });
    }
  });

  // Export flow diagram PDF
  app.get('/api/export/flow-diagram/pdf', isCentralAdmin, async (req: any, res) => {
    try {
      const pdfBuffer = await exportService.exportFlowDiagramAsPDF();
      
      await auditService.log(req.user.id, 'export_flow_diagram_pdf', 'export', 'flow_diagram', {
        format: 'pdf',
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=allocation_flow_diagram.pdf');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Export flow diagram PDF error:", error);
      res.status(500).json({ message: "Failed to export flow diagram PDF" });
    }
  });

  // District status routes
  app.get('/api/district-status', isDistrictAdmin, async (req: any, res) => {
    try {
      const user = req.user;
      
      if (user.role === 'central_admin') {
        // Central admin can see all district statuses
        let statuses = await storage.getAllDistrictStatuses();
        
        // Get all students to identify districts with eligible students
        const studentsData = await storage.getStudents(10000, 0);
        
        // Get list of districts that have students with district admin assignments and preferences
        const districtsWithEligibleStudents = new Set<string>();
        studentsData.forEach((student) => {
          if (student.districtAdmin && student.choice1 && student.counselingDistrict) {
            districtsWithEligibleStudents.add(student.counselingDistrict);
          }
        });

        // Create status records for districts that have eligible students but no status record
        const existingDistricts = new Set(statuses.map(status => status.district));
        const missingDistricts = Array.from(districtsWithEligibleStudents).filter(district => 
          !existingDistricts.has(district)
        );

        // Create default status records for missing districts
        for (const district of missingDistricts) {
          await storage.createOrUpdateDistrictStatus({
            district,
            isFinalized: false,
            totalStudents: 0,
            lockedStudents: 0,
            studentsWithChoices: 0
          });
        }

        // Fetch updated statuses if we created any
        if (missingDistricts.length > 0) {
          statuses = await storage.getAllDistrictStatuses();
        }
        
        res.json(statuses);
      } else if (user.role === 'district_admin') {
        // District admin can only see their own district status
        const status = await storage.getDistrictStatus(user.district);
        res.json(status ? [status] : []);
      } else {
        res.status(403).json({ message: "Forbidden" });
      }
    } catch (error) {
      console.error("Get district statuses error:", error);
      res.status(500).json({ message: "Failed to fetch district statuses" });
    }
  });

  app.get('/api/district-status/:district', isAuthenticated, async (req, res) => {
    try {
      const { district } = req.params;
      const status = await storage.getDistrictStatus(district);
      res.json(status || { district, isFinalized: false, totalStudents: 0, lockedStudents: 0, studentsWithChoices: 0 });
    } catch (error) {
      console.error("Get district status error:", error);
      res.status(500).json({ message: "Failed to fetch district status" });
    }
  });

  app.post('/api/district-status/:district/finalize', isDistrictAdmin, async (req: any, res) => {
    try {
      const { district } = req.params;
      const user = await storage.getUser(req.session.userId);
      
      // Permission check: District admins can only finalize their own district
      // Central admin can finalize SAS Nagar/Mohali district (which they manage directly)
      if (user?.role === 'district_admin' && normalizeDistrict(user.district || '') !== normalizeDistrict(district)) {
        return res.status(403).json({ message: "Can only finalize your own district" });
      }
      
      // Central admin can only finalize SAS Nagar/Mohali district
      if (user?.role === 'central_admin' && normalizeDistrict(district) !== 'SAS Nagar') {
        return res.status(403).json({ message: "Central admin can only finalize SAS Nagar district" });
      }

      // Check if all eligible students in district are locked
      const districtStudents = await storage.getStudentsByDistrict(district);
      
      // Only consider students that belong to this district AND have district admin assigned AND have preference data for finalization
      const eligibleStudents = districtStudents.students.filter(s => 
        s.counselingDistrict === district && s.districtAdmin && s.choice1 // Must belong to district, have district admin and at least first choice
      );
      
      const unlockedEligibleStudents = eligibleStudents.filter(s => !s.isLocked);
      
      if (unlockedEligibleStudents.length > 0) {
        return res.status(400).json({ 
          message: `Cannot finalize district: ${unlockedEligibleStudents.length} eligible students are not locked. All students with district admin assignments and preferences must be locked before finalization.`,
          unlockedCount: unlockedEligibleStudents.length,
          eligibleTotal: eligibleStudents.length
        });
      }

      const status = await storage.finalizeDistrict(district, req.session.userId);
      
      await auditService.log(req.session.userId, 'district_finalized', 'district', district, {
        totalStudents: districtStudents.total,
        lockedStudents: districtStudents.students.length
      }, req.ip, req.get('User-Agent'));

      res.json(status);
    } catch (error) {
      console.error("Finalize district error:", error);
      res.status(500).json({ message: "Failed to finalize district" });
    }
  });

  // Student locking routes
  app.put('/api/students/:id/lock', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isLocked } = req.body;
      const user = await storage.getUser(req.session.userId);
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // District admin can only lock/unlock students in their district
      if (user?.role === 'district_admin' && student.counselingDistrict !== user.district) {
        return res.status(403).json({ message: "Can only lock/unlock students in your district" });
      }

      // Only central admin can unlock students - district admin can only lock
      if (!isLocked && user?.role === 'district_admin') {
        return res.status(403).json({ message: "Only central admin can unlock students" });
      }

      // Business rule validation: Students with no district admin and no preference data cannot be locked
      if (isLocked && !student.districtAdmin && !student.choice1) {
        return res.status(400).json({ 
          message: "Cannot lock student: Student has no district admin assigned and no preference data. Only students with district admin assignments and preferences can be locked." 
        });
      }

      const updatedStudent = isLocked 
        ? await storage.lockStudent(id, req.session.userId)
        : await storage.unlockStudent(id);
      
      await auditService.log(req.session.userId, 
        isLocked ? 'student_locked' : 'student_unlocked', 
        'student', id, {
          studentName: student.name,
          meritNumber: student.meritNumber,
          district: student.counselingDistrict
        }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Lock/unlock student error:", error);
      res.status(500).json({ message: "Failed to update student lock status" });
    }
  });

  // Unlock student after editing (release exclusive lock)
  app.post('/api/students/:id/unlock-edit', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      
      // Check if this user has the lock
      const canEdit = await storage.canEditStudent(id, userId);
      if (!canEdit) {
        return res.status(403).json({ 
          message: "You don't have edit permissions for this student" 
        });
      }
      
      const updatedStudent = await storage.unlockStudent(id);
      
      await auditService.log(userId, 'student_unlock_edit', 'students', id, {
        studentName: updatedStudent.name,
        appNo: updatedStudent.appNo
      }, req.ip, req.get('User-Agent'));
      
      res.json(updatedStudent);
    } catch (error) {
      console.error("Unlock student edit error:", error);
      res.status(500).json({ message: "Failed to unlock student" });
    }
  });

  app.put('/api/students/:id/release', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.session.userId);
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // District admin can only release students from their district
      if (user?.role === 'district_admin' && student.counselingDistrict !== user.district) {
        return res.status(403).json({ message: "Can only release students from your district" });
      }

      const updatedStudent = await storage.releaseStudentFromDistrict(id);
      
      await auditService.log(req.session.userId, 'student_released', 'student', id, {
        studentName: student.name,
        meritNumber: student.meritNumber,
        fromDistrict: student.counselingDistrict
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Release student error:", error);
      res.status(500).json({ message: "Failed to release student" });
    }
  });

  // Unlock request routes
  app.post('/api/unlock-requests', isDistrictAdmin, async (req: any, res) => {
    try {
      const { studentId, reason } = req.body;
      const user = await storage.getUser(req.session.userId);
      
      if (!studentId || !reason) {
        return res.status(400).json({ message: "Student ID and reason are required" });
      }

      const student = await storage.getStudent(studentId);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // District admin can only request unlock for students in their district
      if (user?.role === 'district_admin' && student.counselingDistrict !== user.district) {
        return res.status(403).json({ message: "Can only request unlock for students in your district" });
      }

      const unlockRequest = await storage.createUnlockRequest({
        studentId,
        requestedBy: req.session.userId,
        reason,
        status: 'pending'
      });

      await auditService.log(req.session.userId, 'unlock_request_created', 'unlock_request', unlockRequest.id, {
        studentName: student.name,
        meritNumber: student.meritNumber,
        reason
      }, req.ip, req.get('User-Agent'));

      res.json(unlockRequest);
    } catch (error) {
      console.error("Create unlock request error:", error);
      res.status(500).json({ message: "Failed to create unlock request" });
    }
  });

  app.get('/api/unlock-requests', isCentralAdmin, async (req, res) => {
    try {
      const requests = await storage.getUnlockRequests();
      res.json(requests);
    } catch (error) {
      console.error("Get unlock requests error:", error);
      res.status(500).json({ message: "Failed to fetch unlock requests" });
    }
  });

  app.put('/api/unlock-requests/:id/approve', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reviewComments } = req.body;

      const unlockRequest = await storage.updateUnlockRequest(id, {
        status: 'approved',
        reviewedBy: req.session.userId,
        reviewedAt: new Date(),
        reviewComments
      });

      // If approved, unlock the student
      if (unlockRequest.studentId) {
        await storage.unlockStudent(unlockRequest.studentId);
      }

      await auditService.log(req.session.userId, 'unlock_request_approved', 'unlock_request', id, {
        reviewComments
      }, req.ip, req.get('User-Agent'));

      res.json(unlockRequest);
    } catch (error) {
      console.error("Approve unlock request error:", error);
      res.status(500).json({ message: "Failed to approve unlock request" });
    }
  });

  app.put('/api/unlock-requests/:id/reject', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reviewComments } = req.body;

      const unlockRequest = await storage.updateUnlockRequest(id, {
        status: 'rejected',
        reviewedBy: req.session.userId,
        reviewedAt: new Date(),
        reviewComments
      });

      await auditService.log(req.session.userId, 'unlock_request_rejected', 'unlock_request', id, {
        reviewComments
      }, req.ip, req.get('User-Agent'));

      res.json(unlockRequest);
    } catch (error) {
      console.error("Reject unlock request error:", error);
      res.status(500).json({ message: "Failed to reject unlock request" });
    }
  });

  // Combined respond endpoint for unlock requests (approve or reject)
  app.put('/api/unlock-requests/:id/respond', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { action, reviewComments } = req.body;

      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be 'approve' or 'reject'" });
      }

      const unlockRequest = await storage.updateUnlockRequest(id, {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewedBy: req.session.userId,
        reviewedAt: new Date(),
        reviewComments
      });

      // If approved, unlock the student
      if (action === 'approve' && unlockRequest.studentId) {
        await storage.unlockStudent(unlockRequest.studentId);
      }

      await auditService.log(req.session.userId, `unlock_request_${action}d`, 'unlock_request', id, {
        reviewComments
      }, req.ip, req.get('User-Agent'));

      res.json(unlockRequest);
    } catch (error) {
      console.error("Respond to unlock request error:", error);
      res.status(500).json({ message: "Failed to process unlock request" });
    }
  });

  // Auto-load entrance exam students for district
  app.post('/api/district/:district/auto-load-students', isDistrictAdmin, async (req: any, res) => {
    try {
      const { district } = req.params;
      const user = await storage.getUser(req.session.userId);
      
      // Check if the district admin has access to this district
      if (user?.role === 'district_admin' && user?.district !== district) {
        return res.status(403).json({ message: "You can only load students for your own district" });
      }
      
      const result = await storage.autoLoadEntranceStudents(district);
      
      await auditService.log(req.session.userId, 'students_auto_loaded', 'students', 'bulk', {
        district,
        loaded: result.loaded,
        skipped: result.skipped
      }, req.ip, req.get('User-Agent'));
      
      res.json(result);
    } catch (error) {
      console.error("Auto-load students error:", error);
      res.status(500).json({ message: "Failed to auto-load students" });
    }
  });

  // Get students by district for district admins
  app.get('/api/district/:district/students', isAuthenticated, async (req: any, res) => {
    try {
      const { district } = req.params;
      const user = await storage.getUser(req.session.userId);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // District admin can only view students in their district
      if (user?.role === 'district_admin' && user.district !== district) {
        return res.status(403).json({ message: "Can only view students in your district" });
      }

      const result = await storage.getStudentsByDistrict(district, limit, offset);
      res.json(result);
    } catch (error) {
      console.error("Get district students error:", error);
      res.status(500).json({ message: "Failed to fetch district students" });
    }
  });

  // Audit logs routes
  app.get('/api/audit-logs', isCentralAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const logs = await storage.getAuditLogs(limit, offset);
      res.json(logs);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Settings routes
  app.get('/api/settings', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Get settings error:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.post('/api/settings', isCentralAdmin, async (req: any, res) => {
    try {
      const { key, value, description } = req.body;
      const setting = await storage.setSetting({ key, value, description });
      
      await auditService.log(req.user.id, 'setting_update', 'settings', setting.id, {
        key,
        value,
      }, req.ip, req.get('User-Agent'));

      res.json(setting);
    } catch (error) {
      console.error("Set setting error:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
