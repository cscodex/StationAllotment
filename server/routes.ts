import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import session from "express-session";
import connectPg from "connect-pg-simple";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { insertUserSchema, insertStudentSchema, insertVacancySchema, insertStudentsEntranceResultSchema, USER_ROLES, UnfinalizeRequest } from "@shared/schema";
import { FileService } from "./services/fileService";
import { AllocationService } from "./services/allocationService";
import { setProgress, getProgress, clearProgress } from "./services/allocationProgress";
import { ExportService } from "./services/exportService";
import { AuditService } from "./services/auditService";
import { omrService, pdfProgressMap } from "./omrService";
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
    return 'SAS Nagar (Mohali)'; // Use consistent name from schema
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
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  // Serve the Flow Diagram XML explicitly so it bypasses Vite SPA routing
  app.get("/counseling_flow_diagram.xml", (req, res) => {
    res.sendFile(path.resolve(process.cwd(), "counseling_flow_diagram.drawio"));
  });

  // DB Health endpoint for the frontend header
  app.get("/api/health/database", async (req, res) => {
    try {
      const start = Date.now();
      await storage.pingDatabase();
      const responseTime = Date.now() - start;
      const hostMatch = process.env.DATABASE_URL?.match(/@([^\/:]+)/);
      const instanceId = hostMatch ? hostMatch[1].split('.')[0] : 'local';

      res.json({
        status: 'online',
        responseTime,
        instanceId,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.json({
        status: 'offline',
        error: error.message || 'Database connection failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET endpoint to serve app documents like Flow Diagram from DB
  app.get('/api/documents/:name', async (req, res) => {
    try {
      const doc = await storage.getAppDocument(req.params.name);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }

      const pdfBuffer = Buffer.from(doc.dataBase64, 'base64');
      res.setHeader('Content-Type', doc.mimeType);

      // Inline ensures it renders in the UI iframe rather than forcing a disk download
      res.setHeader('Content-Disposition', `inline; filename="${doc.name}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error serving document:", error);
      res.status(500).json({ message: "Failed to serve document" });
    }
  });

  // Upload endpoint for OMR overlay images
  app.post('/api/students/:id/omr-image', isAuthenticated, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      const { db } = await import("./db");
      const { students } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { compressToA4 } = await import("./imageCompressor");
      const { uploadToCloudinary } = await import("./cloudinaryService");

      const studentId = req.params.id;

      // Compress the uploaded image (A4 fit, max 2 MB, preserves aspect ratio)
      try {
        const result = await compressToA4(req.file.path);
        console.log(`OMR image compressed: ${result.sizeKB} KB, ${result.width}×${result.height}, quality ${result.quality}`);
      } catch (compressErr) {
        console.warn("Image compression skipped (non-fatal):", compressErr);
      }

      // Upload to Cloudinary (falls back to local if not configured)
      const uploadResult = await uploadToCloudinary(req.file.path, {
        folder: 'station-allotment/omr-scans',
        publicId: `omr_${studentId}`,
      });

      const omrImageUrl = uploadResult.url;

      const [updated] = await db
        .update(students)
        .set({ omrImageUrl, updatedAt: new Date() })
        .where(eq(students.id, studentId))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Student not found" });
      }

      res.json({ message: "Image uploaded successfully", omrImageUrl, isCloudinary: uploadResult.isCloudinary });
    } catch (error) {
      console.error("Error uploading OMR image:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  });

  // Upload endpoint for PDF-based Flow Diagram
  app.post('/api/upload-diagram', isCentralAdmin, upload.single('diagram'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No diagram file uploaded" });
      }

      const tempPath = req.file.path;

      // Read the raw binary from multer, convert to Base64, and throw to Neon
      const fileBuffer = await fs.readFile(tempPath);
      const base64Data = fileBuffer.toString('base64');

      await storage.saveAppDocument({
        name: 'counseling_flow_diagram.pdf',
        mimeType: 'application/pdf',
        dataBase64: base64Data
      });

      // Cleanup local temp file entirely
      await fs.unlink(tempPath);

      res.json({ message: "Diagram PDF uploaded to database successfully" });
    } catch (error) {
      console.error("Error uploading diagram:", error);
      res.status(500).json({ message: "Failed to upload diagram" });
    }
  });

  // Load demo credentials at startup
  cachedCredentials = await loadDemoCredentials();

  const fileService = new FileService(storage);
  const allocationService = new AllocationService(storage);
  const exportService = new ExportService(storage);
  const auditService = new AuditService(storage);

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

  // Current session route — required by dashboard & counseling-progress
  app.get('/api/session/current', isAuthenticated, async (req: any, res) => {
    try {
      const yearSessions = await storage.getYearSessions();
      const currentYS = yearSessions.find(y => y.isCurrent);
      if (currentYS) {
        return res.json({ currentSession: currentYS.sessionName });
      }

      const currentSession = await storage.getSetting('current_session');
      res.json({ currentSession: currentSession?.value || '' });
    } catch (error) {
      console.error("Get current session error:", error);
      res.status(500).json({ message: "Failed to fetch current session" });
    }
  });

  // File upload routes
  app.post('/api/files/upload/students', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const currentSession = await storage.getSetting('current_session');
      const academicYear = req.body.academicYear || currentSession?.value || '2024-2025';
      const result = await fileService.processStudentFile(req.file, req.user.id, academicYear);

      await auditService.log(req.user.id, 'file_upload', 'files', result.id, {
        filename: result.originalName,
        type: 'student_choices',
        status: result.status,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Upload students file error:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  app.post('/api/files/upload/vacancies', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const currentSession = await storage.getSetting('current_session');
      const academicYear = req.body.academicYear || currentSession?.value || '2024-2025';
      const result = await fileService.processVacancyFile(req.file, req.user.id, academicYear);

      await auditService.log(req.user.id, 'file_upload', 'files', result.id, {
        filename: result.originalName,
        type: 'vacancies',
        status: result.status,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Upload vacancies file error:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  app.post('/api/files/upload/entrance-results', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const currentSession = await storage.getSetting('current_session');
      const academicYear = req.body.academicYear || currentSession?.value || '2024-2025';
      const result = await fileService.processEntranceResultsFile(req.file, req.user.id, academicYear);

      await auditService.log(req.user.id, 'file_upload', 'files', result.id, {
        filename: result.originalName,
        type: 'entrance_results',
        status: result.status,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Upload entrance results file error:", error);
      res.status(500).json({ message: "Failed to upload file" });
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
      const allocationStatus = req.query.allocationStatus as string | undefined;
      const academicYear = req.query.academicYear as string | undefined;
      const counselingTitleId = req.query.counselingTitleId as string | undefined;
      const roundNumber = req.query.roundNumber ? parseInt(req.query.roundNumber as string) : undefined;
      const user = await storage.getUser(req.session.userId);

      if (allocated) {
        // For the reports page - return all students matching the year constraint
        const students = await storage.getStudents(10000, 0, academicYear);
        return res.json(students);
      }

      let students, total;

      // Show students based on role
      // Central Admins see all. District admins only see unowned or owned by them.
      let isFinalized = false;
      if (user?.role === 'district_admin' && user?.district) {
        const status = await storage.getDistrictStatus(user.district);
        isFinalized = !!status?.isFinalized;
      }
      
      const districtAdminUsername = user?.role === 'district_admin' ? user.username : undefined;
      students = await storage.getStudents(limit, offset, academicYear, roundNumber, districtAdminUsername, isFinalized, allocationStatus, counselingTitleId);
      total = await storage.getStudentsCount(academicYear, districtAdminUsername, isFinalized, allocationStatus, counselingTitleId);

      // Map database fields to frontend expected fields
      // gender and category are already native columns on the students table
      const mappedStudents = students.map(student => ({
        ...student,
        applicationNumber: student.appNo,
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
      if ((student.counselingDistrict !== 'SAS Nagar (Mohali)' && student.counselingDistrict !== 'Mohali') || student.districtAdmin !== 'Central_admin') {
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

      // Check if district is finalized
      if (user?.role !== 'central_admin' && preferences.counselingDistrict) {
        const districtStatus = await storage.getDistrictStatus(preferences.counselingDistrict);
        if (districtStatus?.isFinalized) {
          return res.status(403).json({ message: "Cannot edit preferences: District is already finalized" });
        }
      }

      // Set central admin info when central admin edits preferences
      if (user?.role === 'central_admin') {
        preferences.counselingDistrict = 'SAS Nagar (Mohali)';
        preferences.districtAdmin = 'Central_admin';
      }

      const existingStudent = await storage.getStudent(id);
      if (existingStudent && (existingStudent.allocationStatus === 'not_allotted' || existingStudent.allocationStatus === 'vacated' || existingStudent.allocationStatus === 'registered')) {
        preferences.allocationStatus = 'pending';
        preferences.counselingRoundId = null;
        preferences.counselingRoundNumber = null;
      }

      const student = await storage.updateStudent(id, preferences);

      await auditService.log(req.session.userId, 'student_preferences_update', 'students', id, {
        preferences,
        userDistrict: user?.district,
      }, req.ip, req.get('User-Agent'));

      res.json(student);
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
        const currentSessionSetting = await storage.getSetting('current_session');
        const academicYear = currentSessionSetting?.value || '2024-2025';
        const activeRound = await storage.getActiveCounselingRound(academicYear);
        const districtStatus = await storage.getDistrictStatus(student.counselingDistrict, activeRound?.id);
        if (districtStatus?.isFinalized) {
          return res.status(403).json({ message: "Cannot modify student lock status - district is finalized for the current round" });
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

      // Ensure student transitions to 'pending' immediately if they are still marked 'registered' during locking
      if (isLocked && student.allocationStatus === 'registered') {
        await storage.updateStudent(id, { allocationStatus: 'pending' });
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
      if ((student.counselingDistrict !== 'SAS Nagar (Mohali)' && student.counselingDistrict !== 'Mohali') || student.districtAdmin !== 'Central_admin') {
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
        lockedBy: req.session.userId,
        ...(student.allocationStatus === 'registered' ? { allocationStatus: 'pending' } : {})
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

  // Bulk unlock choices
  app.post('/api/students/bulk-unlock-choices', isAuthenticated, async (req: any, res) => {
    try {
      const { studentIds } = req.body;
      const user = await storage.getUser(req.session.userId);

      if (user?.role !== 'central_admin') return res.status(403).json({ message: "Only central admin can unlock students" });
      if (!Array.isArray(studentIds) || studentIds.length === 0) return res.status(400).json({ message: "No students provided" });

      for (const id of studentIds) {
        await storage.updateStudent(id, { isLocked: false, lockedBy: null });
      }

      await auditService.log(req.session.userId, 'bulk_student_unlock', 'students', 'multiple', {
        unlockedBy: req.session.userId,
        count: studentIds.length
      }, req.ip, req.get('User-Agent'));

      res.json({ message: `${studentIds.length} students unlocked successfully` });
    } catch (error) {
      console.error("Bulk student unlock error:", error);
      res.status(500).json({ message: "Failed to unlock students" });
    }
  });

  // Vacate Seat
  app.post('/api/students/:id/vacate', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason, comment } = req.body;
      const user = await storage.getUser(req.session.userId);

      const student = await storage.getStudent(id);
      if (!student || student.allocationStatus !== 'admitted') {
        return res.status(400).json({ message: "Student is not currently admitted" });
      }

      await storage.insertVacatedSeat({
        studentId: student.id,
        appNo: student.appNo || '',
        meritNumber: student.meritNumber,
        studentName: student.name,
        gender: student.gender || '',
        category: student.category || '',
        stream: student.stream,
        vacatedDistrict: student.allottedDistrict || '',
        vacatedStream: student.allottedStream || '',
        reason: reason || 'Unknown',
        comment: comment || '',
        academicYear: student.academicYear || '',
        counselingRoundId: student.counselingRoundId,
        actionBy: user?.id,
        actionType: 'vacated'
      });

      // Restore the vacated seat back to available vacancies
      const vacancies = await storage.getVacancies(student.academicYear || '2024-2025');
      const targetVacancy = vacancies.find(v =>
        (student.allottedSchoolUdise ? v.udiseCode === student.allottedSchoolUdise : v.district === student.allottedDistrict) &&
        v.stream === student.allottedStream &&
        v.gender === student.gender &&
        v.category === student.category
      );
      if (targetVacancy) {
        const newAvailable = Math.min((targetVacancy.availableSeats || 0) + 1, targetVacancy.totalSeats || 1);
        await storage.updateVacancy(targetVacancy.id, { availableSeats: newAvailable });
      }

      const updatedStudent = await storage.updateStudent(id, { 
        allocationStatus: 'vacated',
        allottedDistrict: null,
        allottedStream: null,
        allottedSchoolUdise: null
      });

      await auditService.log(req.session.userId, 'student_vacated', 'students', id, {
        reason,
        vacatedDistrict: student.allottedDistrict
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student vacate error:", error);
      res.status(500).json({ message: "Failed to vacate seat" });
    }
  });

  // Bulk Vacate Seat
  app.post('/api/students/bulk-vacate', isAuthenticated, async (req: any, res) => {
    try {
      const { studentIds, reason, comment } = req.body;
      const user = await storage.getUser(req.session.userId);

      if (!Array.isArray(studentIds) || studentIds.length === 0) return res.status(400).json({ message: "No students provided" });

      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const vacancies = await storage.getVacancies(academicYear);

      for (const id of studentIds) {
        const student = await storage.getStudent(id);
        if (student && student.allocationStatus === 'admitted') {
          await storage.insertVacatedSeat({
            studentId: student.id,
            appNo: student.appNo || '',
            meritNumber: student.meritNumber,
            studentName: student.name,
            gender: student.gender || '',
            category: student.category || '',
            stream: student.stream,
            vacatedDistrict: student.allottedDistrict || '',
            vacatedStream: student.allottedStream || '',
            reason: reason || 'Unknown',
            comment: comment || '',
            academicYear: student.academicYear || '',
            counselingRoundId: student.counselingRoundId,
            actionBy: user?.id,
            actionType: 'vacated'
          });

          // Restore the vacated seat
          const targetVacancy = vacancies.find(v =>
            (student.allottedSchoolUdise ? v.udiseCode === student.allottedSchoolUdise : v.district === student.allottedDistrict) &&
            v.stream === student.allottedStream &&
            v.gender === student.gender &&
            v.category === student.category
          );
          if (targetVacancy) {
            targetVacancy.availableSeats = Math.min((targetVacancy.availableSeats || 0) + 1, targetVacancy.totalSeats || 1);
            await storage.updateVacancy(targetVacancy.id, { availableSeats: targetVacancy.availableSeats });
          }

          await storage.updateStudent(id, { 
            allocationStatus: 'vacated',
            allottedDistrict: null,
            allottedStream: null,
            allottedSchoolUdise: null
          });
        }
      }

      await auditService.log(req.session.userId, 'bulk_student_vacated', 'students', 'multiple', {
        reason,
        count: studentIds.length
      }, req.ip, req.get('User-Agent'));

      res.json({ message: `${studentIds.length} seats vacated successfully` });
    } catch (error) {
      console.error("Bulk student vacate error:", error);
      res.status(500).json({ message: "Failed to vacate seats" });
    }
  });

  // Mark Admitted
  app.post('/api/students/:id/mark-admitted', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const student = await storage.getStudent(id);
      if (!student || student.allocationStatus !== 'allotted') {
        return res.status(400).json({ message: "Student is not currently allotted to a seat" });
      }

      const updatedStudent = await storage.updateStudent(id, { 
        allocationStatus: 'admitted',
      });

      await auditService.log(req.session.userId, 'student_admitted', 'students', id, {
        admittedDistrict: student.allottedDistrict
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student mark admitted error:", error);
      res.status(500).json({ message: "Failed to mark student as admitted" });
    }
  });

  // Mark Not Admitted
  app.post('/api/students/:id/mark-not-admitted', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason, comment } = req.body;
      const user = await storage.getUser(req.session.userId);

      const student = await storage.getStudent(id);
      if (!student || student.allocationStatus !== 'allotted') {
        return res.status(400).json({ message: "Student is not currently allotted a seat" });
      }

      await storage.insertVacatedSeat({
        studentId: student.id,
        appNo: student.appNo || '',
        meritNumber: student.meritNumber,
        studentName: student.name,
        gender: student.gender || '',
        category: student.category || '',
        stream: student.stream,
        vacatedDistrict: student.allottedDistrict || '',
        vacatedStream: student.allottedStream || '',
        reason: reason || 'Declined/Not Admitted',
        comment: comment || '',
        academicYear: student.academicYear || '',
        counselingRoundId: student.counselingRoundId,
        actionBy: user?.id,
        actionType: 'not_admitted'
      });

      // Restore the vacated seat back to available vacancies
      const vacancies = await storage.getVacancies(student.academicYear || '2024-2025');
      const targetVacancy = vacancies.find(v =>
        (student.allottedSchoolUdise ? v.udiseCode === student.allottedSchoolUdise : v.district === student.allottedDistrict) &&
        v.stream === student.allottedStream &&
        v.gender === student.gender &&
        v.category === student.category
      );
      if (targetVacancy) {
        const newAvailable = Math.min((targetVacancy.availableSeats || 0) + 1, targetVacancy.totalSeats || 1);
        await storage.updateVacancy(targetVacancy.id, { availableSeats: newAvailable });
      }

      const updatedStudent = await storage.updateStudent(id, { 
        allocationStatus: 'not_admitted',
        allottedDistrict: null,
        allottedStream: null,
        allottedSchoolUdise: null
      });

      await auditService.log(req.session.userId, 'student_not_admitted', 'students', id, {
        reason,
        vacatedDistrict: student.allottedDistrict
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student mark not admitted error:", error);
      res.status(500).json({ message: "Failed to mark student as not admitted" });
    }
  });

  // Reset Status
  app.post('/api/students/:id/reset-status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      const updatedStudent = await storage.updateStudent(id, { 
        allocationStatus: 'pending',
      });

      await auditService.log(req.session.userId, 'student_status_reset', 'students', id, {
        previousStatus: student.allocationStatus
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Student reset status error:", error);
      res.status(500).json({ message: "Failed to reset student status" });
    }
  });

  // Bulk status update
  app.put('/api/students/bulk-status', isCentralAdmin, async (req: any, res) => {
    try {
      const { studentIds, status } = req.body;
      
      if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: "Student IDs are required" });
      }

      const validStatuses = ['registered', 'pending', 'allotted', 'not_allotted', 'admitted', 'not_admitted', 'vacated'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      await Promise.all(studentIds.map(id => storage.updateStudent(id, { 
        allocationStatus: status,
        ...(status === 'pending' || status === 'registered' ? {
          counselingRoundId: null,
          counselingRoundNumber: null
        } : {})
      })));

      await auditService.log(req.session.userId, 'bulk_status_update', 'students', 'multiple', {
        status,
        count: studentIds.length
      }, req.ip, req.get('User-Agent'));

      res.json({ message: `Status updated to ${status} for ${studentIds.length} students` });
    } catch (error) {
      console.error("Bulk status update error:", error);
      res.status(500).json({ message: "Failed to update statuses" });
    }
  });

  // Per-record status update
  app.put('/api/students/:id/status', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['registered', 'pending', 'allotted', 'not_allotted', 'admitted', 'not_admitted', 'vacated'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      const updatedStudent = await storage.updateStudent(id, { 
        allocationStatus: status,
        ...(status === 'pending' || status === 'registered' ? {
          counselingRoundId: null,
          counselingRoundNumber: null
        } : {})
      });

      await auditService.log(req.session.userId, 'status_update', 'students', id, {
        status,
        previousStatus: student.allocationStatus
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Status update error:", error);
      res.status(500).json({ message: "Failed to update status" });
    }
  });


  // Finalize allocation process
  app.post('/api/allocation/finalize', isCentralAdmin, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      const { counselingTitleId } = req.body;

      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = counselingTitleId
        ? await storage.getActiveCounselingRoundForTitle(counselingTitleId as string)
        : await storage.getActiveCounselingRound(academicYear);

      if (!activeRound) {
        return res.status(400).json({ message: "No active counseling round found" });
      }

      if (activeRound.isAllocationFinalized) {
        return res.status(400).json({
          message: "Allocation process has already been finalized for the active round"
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
      eligibleDistricts.add('SAS Nagar (Mohali)');

      const eligibleDistrictStatuses = districtStatuses.filter(ds => eligibleDistricts.has(ds.district));
      const unfinalizedDistricts = eligibleDistrictStatuses.filter(ds => !ds.isFinalized);

      if (unfinalizedDistricts.length > 0) {
        return res.status(400).json({
          message: `Cannot finalize allocation: ${unfinalizedDistricts.length} districts are not finalized yet: ${unfinalizedDistricts.map(d => d.district).join(', ')}`
        });
      }

      const currentTime = new Date();

      // Fetch exact current state of all students for snapshotting
      const currentStudents = await storage.getStudents(10000, 0, academicYear);
      // Determine relevant counseling title scoped bounds.
      const snapshotStudents = activeRound.counselingTitleId 
        ? currentStudents.filter(s => s.counselingTitleId === activeRound.counselingTitleId)
        : currentStudents;

      // Set allocation as finalized on the active round
      await storage.updateCounselingRound(activeRound.id, {
        isAllocationFinalized: true,
        allocationFinalizedAt: currentTime,
        allocationFinalizedBy: req.session.userId,
        snapshotData: snapshotStudents
      });

      // Automatically finalize SAS Nagar (Mohali) district when allocation is finalized
      // SAS Nagar is managed directly by central admin
      try {
        const sasNagarStatus = await storage.getDistrictStatus('SAS Nagar');
        if (!sasNagarStatus?.isFinalized) {
          // This will need to be refactored to support round-level finalizeDistrict
          // For now, we update the existing method logic elsewhere or accept this generic fallback
          await storage.finalizeDistrict('SAS Nagar (Mohali)', req.session.userId);

          await auditService.log(req.session.userId, 'district_finalized', 'district', 'SAS Nagar (Mohali)', {
            reason: 'Auto-finalized during allocation finalization',
            finalizedBy: req.session.userId,
            finalizedAt: currentTime,
            counselingRoundId: activeRound.id
          }, req.ip, req.get('User-Agent'));
        }
      } catch (error) {
        console.warn('Warning: Could not auto-finalize SAS Nagar district during allocation finalization:', error);
        // Continue with allocation finalization even if SAS Nagar finalization fails
      }

      await auditService.log(req.session.userId, 'allocation_finalize', 'allocation', 'system', {
        finalizedBy: req.session.userId,
        finalizedAt: currentTime,
        counselingRoundId: activeRound.id
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
  app.post('/api/students/bulk-omr-form', isAuthenticated, async (req, res) => {
    try {
      const { studentIds } = req.body;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: "No students provided for bulk generation" });
      }
      const jobId = req.query.jobId as string | undefined;
      const pdfBytes = await omrService.generateBulkOMRForms(studentIds, false, jobId);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="bulk_omr_forms_${Date.now()}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error("Bulk OMR Generation error:", error);
      res.status(500).json({ message: error.message || "Failed to generate bulk OMR forms" });
    }
  });

  // Bulk generate fully filled (randomized) bubbles for optical OpenCV testing
  app.post('/api/omr/test-scenarios', isAuthenticated, async (req, res) => {
    try {
      const { studentIds } = req.body;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: "No students provided for testing mock generation" });
      }

      const jobId = req.query.jobId as string | undefined;
      const pdfBytes = await omrService.generateBulkOMRForms(studentIds, true, jobId); // testFillMode = true

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="mock_scenarios_${studentIds.length}_students.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error("Test Scenarios OMR Generation error:", error);
      res.status(500).json({ message: error.message || "Failed to generate Mock OMR testing forms" });
    }
  });

  app.get('/api/omr/progress/:jobId', isAuthenticated, (req, res) => {
    const { jobId } = req.params;
    const progress = pdfProgressMap.get(jobId);
    if (!progress) {
      return res.status(404).json({ message: "Job not found or already completed" });
    }
    res.json(progress);
  });

  app.get('/api/students/:id/omr-form', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const pdfBytes = await omrService.generateStudentOMRForm(id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="student_${id}_omr_form.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error("OMR Generation error:", error);
      res.status(error.message === 'Student not found' ? 404 : 500)
        .json({ message: error.message || "Failed to generate OMR form" });
    }
  });

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
        counselingDistrict = counselingDistrict || 'SAS Nagar (Mohali)';
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

  // Vacate a student's allotted seat
  app.post('/api/students/:id/vacate-seat', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const student = await storage.getStudent(id);

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      if (student.allocationStatus !== 'allotted') {
        return res.status(400).json({ message: "Only allotted students can vacate their seats." });
      }

      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';

      // Find the specific vacancy the student took, if `allottedSchoolUdise` exists then use it, else default find
      const vacancies = await storage.getVacancies(academicYear);
      let targetVacancy = undefined;

      if (student.allottedSchoolUdise) {
        targetVacancy = vacancies.find(v =>
          v.udiseCode === student.allottedSchoolUdise &&
          v.stream === student.allottedStream &&
          v.gender === student.gender &&
          v.category === student.category
        );
      } else {
        targetVacancy = vacancies.find(v =>
          v.district === student.allottedDistrict &&
          v.stream === student.allottedStream &&
          v.gender === student.gender &&
          v.category === student.category
        );
      }

      if (targetVacancy) {
        await storage.updateVacancy(targetVacancy.id, {
          availableSeats: (targetVacancy.availableSeats || 0) + 1
        });
      }

      const updatedStudent = await storage.updateStudent(id, {
        allocationStatus: 'vacated',
        allottedDistrict: null,
        allottedStream: null,
        allottedSchoolUdise: null
      });

      await auditService.log(req.session.userId, 'student_vacate_seat', 'students', id, {
        vacatedBy: req.session.userId,
        studentName: student.name,
        meritNumber: student.meritNumber,
        previousDistrict: student.allottedDistrict,
        previousSchoolUdise: student.allottedSchoolUdise
      }, req.ip, req.get('User-Agent'));

      res.json(updatedStudent);
    } catch (error) {
      console.error("Vacate seat error:", error);
      res.status(500).json({ message: "Failed to vacate seat" });
    }
  });

  // File validation routes (validate without saving to database)
  app.post('/api/files/validate/students', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const result = await fileService.validateStudentFile(req.file, req.user.username);
      res.json(result);
    } catch (error) {
      console.error("Validate students file error:", error);
      res.status(500).json({ message: "Failed to validate file" });
    }
  });

  app.post('/api/files/validate/vacancies', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const result = await fileService.validateVacancyFile(req.file, req.user.username);
      res.json(result);
    } catch (error) {
      console.error("Validate vacancies file error:", error);
      res.status(500).json({ message: "Failed to validate file" });
    }
  });

  app.post('/api/files/validate/entrance-results', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const result = await fileService.validateEntranceResultsFile(req.file, req.user.username);
      res.json(result);
    } catch (error) {
      console.error("Validate entrance results file error:", error);
      res.status(500).json({ message: "Failed to validate file" });
    }
  });

  // Students entrance results routes
  app.get('/api/students-entrance-results', isDistrictAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const counselingTitleId = req.query.counselingTitleId as string | undefined;

      const results = await storage.getStudentsEntranceResults(limit, offset, counselingTitleId);
      const total = await storage.getStudentsEntranceResultsCount(counselingTitleId);

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

      // Add counseling district and district admin info
      const preferencesWithDistrict = {
        ...preferences,
        counselingDistrict: req.user.district,
        districtAdmin: `${req.user.firstName} ${req.user.lastName}`.trim(),
      };

      const student = await storage.updateStudentPreferences(studentId, preferencesWithDistrict);

      await auditService.log(req.user.id, 'student_preferences_set', 'students', studentId, {
        entranceResultId,
        preferences: preferencesWithDistrict,
        userDistrict: req.user.district,
      }, req.ip, req.get('User-Agent'));

      res.json(student);
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

      // Create student from entrance result
      const newStudent = await storage.createStudent({
        appNo: entranceResult.applicationNo,
        meritNumber: entranceResult.meritNo,
        name: entranceResult.studentName,
        stream: stream || entranceResult.stream,
        gender: entranceResult.gender,
        category: entranceResult.category,
        counselingDistrict: req.user.district,
        districtAdmin: `${req.user.firstName} ${req.user.lastName}`.trim(),
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

  // Create next round for an existing title
  app.post('/api/counseling-titles/:id/next', isCentralAdmin, async (req: any, res) => {
    try {
      const titleId = req.params.id;

      console.log(`[NextRound] Params: titleId="${titleId}"`);

      // Verify vacancies
      const titleVacancies = await storage.getVacancies(undefined, undefined, titleId);
      console.log(`[NextRound] Found: ${titleVacancies.length} vacancies`);
      
      let totalAvailableSeats = 0;
      titleVacancies.forEach(v => {
        totalAvailableSeats += (v.availableSeats || 0);
      });
      console.log(`[NextRound] Total available seats: ${totalAvailableSeats}`);

      const titleRounds = await storage.getCounselingRounds(undefined, titleId);
      console.log(`[NextRound] Found ${titleRounds.length} rounds, statuses: ${titleRounds.map((r: any) => `R${r.roundNumber}:fin=${r.isAllocationFinalized},comp=${r.isCompleted}`).join(', ')}`);
      
      if (titleRounds.length === 0) {
        console.log(`[NextRound] REJECTED: No rounds found`);
        return res.status(404).json({ message: "Counseling title not found" });
      }

      if (titleVacancies.length > 0 && totalAvailableSeats <= 0) {
        console.log(`[NextRound] REJECTED: ${titleVacancies.length} vacancies but 0 available seats`);
        return res.status(400).json({ message: "Cannot create next round: All vacancies have been filled." });
      }

      // Check if the latest round is finalized
      const maxRoundNum = Math.max(...titleRounds.map((r: any) => r.roundNumber));
      const latestRound = titleRounds.find((r: any) => r.roundNumber === maxRoundNum);
      
      if (latestRound && !latestRound.isAllocationFinalized && !latestRound.isCompleted) {
         return res.status(400).json({ message: "Cannot create next round: The latest round must be finalized first." });
      }

      // Mark current round as inactive
      if (latestRound) {
        await storage.updateCounselingRound(latestRound.id, { isActive: false });
      }

      const title = await storage.getCounselingTitle(titleId);
      if (!title) {
        return res.status(404).json({ message: "Counseling title not found" });
      }

      // Spawn new round
      const newRoundNumber = maxRoundNum + 1;
      const newRound = await storage.createCounselingRound({
        academicYear: title.academicYear,
        counselingTitleId: titleId,
        roundName: title.titleName,
        roundNumber: newRoundNumber,
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
        isActive: true,
        isAllocationCompleted: false,
        isAllocationFinalized: false
      });

      await auditService.log(req.user.id, 'counseling_round_spawned', 'counseling_rounds', newRound.id, {
        previousRoundId: latestRound?.id,
        newRoundName: newRound.roundName,
        newRoundNumber: newRound.roundNumber
      }, req.ip, req.get('User-Agent'));

      res.status(201).json(newRound);
    } catch (error: any) {
      console.error("Create next round error:", error);
      res.status(500).json({ message: error.message || "Failed to create next round" });
    }
  });

  // Iterative rounds endpoints
  app.post('/api/counseling-rounds/next', isCentralAdmin, async (req: any, res) => {
    try {
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';

      const activeRound = await storage.getActiveCounselingRound(academicYear);
      if (!activeRound) {
        return res.status(400).json({ message: "Cannot spawn next round: No active counseling round found" });
      }

      if (!activeRound.isAllocationFinalized) {
        return res.status(400).json({ message: "Current counseling round must be finalized before spawning the next round" });
      }

      // Mark current round as inactive
      await storage.updateCounselingRound(activeRound.id, {
        isActive: false
      });

      // Spawn new round
      const newRoundNumber = activeRound.roundNumber + 1;
      const newRound = await storage.createCounselingRound({
        academicYear,
        roundName: `Round ${newRoundNumber}`,
        roundNumber: newRoundNumber,
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
        isActive: true,
        isAllocationCompleted: false,
        isAllocationFinalized: false
      });

      // Reset specific district finalization statuses for the new round
      // Notice we do NOT reset global settings since we decoupled

      await auditService.log(req.user.id, 'counseling_round_spawned', 'counseling_rounds', newRound.id, {
        previousRoundId: activeRound.id,
        newRoundName: newRound.roundName,
      }, req.ip, req.get('User-Agent'));

      res.status(201).json(newRound);
    } catch (error) {
      console.error("Spawn next counseling round error:", error);
      res.status(500).json({ message: "Failed to create the next counseling round" });
    }
  });

  // Session Management
  app.post('/api/sessions/close', isCentralAdmin, async (req: any, res) => {
    try {
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value;

      if (!academicYear) {
        return res.status(400).json({ message: "No active session to close" });
      }

      const activeRound = await storage.getActiveCounselingRound(academicYear);
      if (activeRound) {
        // Option to verify if it's finalized or force close it
        await storage.updateCounselingRound(activeRound.id, {
          isActive: false
        });
      }

      const session = await storage.getYearSessionByName(academicYear);
      if (session) {
        await storage.updateYearSession(session.id, {
          isActive: false,
          isCurrent: false,
          endDate: new Date().toISOString().split('T')[0]
        });
      }

      await storage.setSetting({
        key: 'session_closed',
        value: 'true'
      });

      await auditService.log(req.user.id, 'session_closed', 'year_session', academicYear, {
        closedBy: req.user.id
      }, req.ip, req.get('User-Agent'));

      res.json({ message: `Session ${academicYear} closed successfully` });
    } catch (error) {
      console.error("Close session error:", error);
      res.status(500).json({ message: "Failed to close session" });
    }
  });

  // Vacancies routes
  app.get('/api/vacancies', isAuthenticated, async (req, res) => {
    try {
      const counselingTitleId = req.query.counselingTitleId as string | undefined;
      const vacancies = await storage.getVacancies(undefined, undefined, counselingTitleId);
      res.json(vacancies);
    } catch (error) {
      console.error("Get vacancies error:", error);
      res.status(500).json({ message: "Failed to fetch vacancies" });
    }
  });

  // Vacated Seats / Attrition Tracking API
  app.get('/api/vacated-seats', isAuthenticated, async (req, res) => {
    try {
      const academicYear = req.query.academicYear as string | undefined;
      const vacatedSeats = await storage.getVacatedSeats(academicYear);
      res.json(vacatedSeats);
    } catch (error) {
      console.error("Get vacated seats error:", error);
      res.status(500).json({ message: "Failed to fetch vacated seats history" });
    }
  });

  // Counseling Rounds API
  app.get('/api/counseling-rounds', isAuthenticated, async (req: any, res) => {
    try {
      const { academicYear, counselingTitleId } = req.query;
      const rounds = await storage.getCounselingRounds(academicYear as string, counselingTitleId as string);
      res.json(rounds);
    } catch (error) {
      console.error("Fetch counseling rounds error:", error);
      res.status(500).json({ message: "Failed to fetch rounds" });
    }
  });

  // GET a single counseling round by ID
  app.get('/api/counseling-rounds/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const round = await storage.getCounselingRound(id);
      if (!round) return res.status(404).json({ message: "Round not found" });
      res.json(round);
    } catch (error) {
      console.error("Fetch counseling round error:", error);
      res.status(500).json({ message: "Failed to fetch round" });
    }
  });

  // GET allocation results for a round (cutoffs + allotted students)
  app.get('/api/allocation/results/:roundId', isAuthenticated, async (req: any, res) => {
    try {
      const { roundId } = req.params;
      const round = await storage.getCounselingRound(roundId);
      if (!round) return res.status(404).json({ message: "Round not found" });

      // Fetch all students allocated in this round
      const allStudents = await storage.getStudents(10000, 0);
      const allottedStudents = allStudents.filter(s =>
        (s.allocationStatus === 'allotted' || s.allocationStatus === 'admitted') && s.counselingRoundId === roundId
      );

      // Build cutoff table: track per district|stream|gender|category the max merit number (worst rank admitted = cutoff)
      const cutoffMap: Record<string, { district: string; stream: string; gender: string; category: string; cutoffMerit: number; studentsAllotted: number }> = {};

      // Fetch entrance results to get per-student gender and category
      const entranceResults = await storage.getStudentsEntranceResults(10000, 0);
      const entranceResultMap = new Map<string, any>();
      entranceResults.forEach(er => {
        if (er.applicationNo) entranceResultMap.set(er.applicationNo, er);
      });

      allottedStudents.forEach(student => {
        const er = entranceResultMap.get(student.appNo || '');
        if (!er) return;
        const key = `${student.allottedDistrict}|${student.stream}|${er.gender}|${er.category}`;
        if (!cutoffMap[key]) {
          cutoffMap[key] = {
            district: student.allottedDistrict || '',
            stream: student.stream || '',
            gender: er.gender || '',
            category: er.category || '',
            cutoffMerit: student.meritNumber,
            studentsAllotted: 0,
          };
        }
        // Cut-off = worst (highest) merit number admitted
        if (student.meritNumber > cutoffMap[key].cutoffMerit) {
          cutoffMap[key].cutoffMerit = student.meritNumber;
        }
        cutoffMap[key].studentsAllotted++;
      });

      const cutoffs = Object.values(cutoffMap).sort((a, b) =>
        a.district.localeCompare(b.district) || a.stream.localeCompare(b.stream)
      );

      // Simplified allotted student list for display
      const studentList = allottedStudents.map(student => {
        const er = entranceResultMap.get(student.appNo || '');
        return {
          id: student.id,
          name: student.name,
          meritNumber: student.meritNumber,
          appNo: student.appNo,
          allottedDistrict: student.allottedDistrict,
          allottedStream: student.allottedStream,
          allottedSchoolUdise: student.allottedSchoolUdise,
          counselingDistrict: student.counselingDistrict,
          gender: er?.gender,
          category: er?.category,
        };
      }).sort((a, b) => a.meritNumber - b.meritNumber);

      const districtSummary: Record<string, number> = {};
      allottedStudents.forEach(s => {
        if (s.allottedDistrict) districtSummary[s.allottedDistrict] = (districtSummary[s.allottedDistrict] || 0) + 1;
      });

      res.json({
        round: { id: round.id, roundName: round.roundName, roundNumber: round.roundNumber, academicYear: round.academicYear },
        summary: {
          totalAllotted: allottedStudents.length,
          districtSummary,
        },
        cutoffs,
        students: studentList,
      });
    } catch (error) {
      console.error("Get allocation results error:", error);
      res.status(500).json({ message: "Failed to fetch allocation results" });
    }
  });

  // Counseling display live endpoint — used by the projector display page
  app.get('/api/counseling-display/live', isAuthenticated, async (req: any, res) => {
    try {
      const gender = (req.query.gender as string) || 'Female';
      const roundId = req.query.roundId as string | undefined;

      // Find the relevant counseling round
      let round: any = null;
      if (roundId) {
        round = await storage.getCounselingRound(roundId);
      } else {
        const currentSessionSetting = await storage.getSetting('current_session');
        const academicYear = currentSessionSetting?.value || '2024-2025';
        round = await storage.getActiveCounselingRound(academicYear);
      }
      if (!round) return res.status(404).json({ message: 'No active counseling round found' });

      // Fetch students + entrance results for this gender
      const allStudents = await storage.getStudents(100000, 0, round.academicYear);
      const entranceResults = await storage.getStudentsEntranceResults(100000, 0);
      const erMap = new Map<string, any>();
      entranceResults.forEach((er: any) => { if (er.applicationNo) erMap.set(er.applicationNo, er); });

      // Filter eligible students for this gender who have at least one preference
      const eligibleStudents = allStudents
        .filter((s: any) => {
          const er = erMap.get(s.appNo || '');
          return er && er.gender === gender && s.choice1;
        })
        .sort((a: any, b: any) => a.meritNumber - b.meritNumber);

      // Category progress bars — priority order
      const categoryOrder = gender === 'Female'
        ? ['WHH', 'Disabled', 'Private', 'Open']
        : ['Disabled', 'Private', 'Open'];

      const categoryProgress = categoryOrder.map(cat => {
        const inCat = eligibleStudents.filter((s: any) => erMap.get(s.appNo || '')?.category === cat);
        const filled = inCat.filter((s: any) => s.allocationStatus === 'allotted' || s.allocationStatus === 'admitted').length;
        return { category: cat, filled, total: inCat.length };
      });

      // Ordered playback list (all students in merit order for 1-per-second stepping on the frontend)
      const playbackStudents = eligibleStudents.map((s: any) => {
        const er = erMap.get(s.appNo || '');
        return {
          id: s.id,
          meritNumber: s.meritNumber,
          name: s.name,
          gender: er?.gender || gender,
          category: er?.category || '',
          counselingDistrict: s.counselingDistrict || '',
          choice1: s.choice1, choice2: s.choice2, choice3: s.choice3,
          choice4: s.choice4, choice5: s.choice5,
          allottedStream: s.allottedStream || null,
          allottedDistrict: s.allottedDistrict || null,
          allottedSchoolUdise: s.allottedSchoolUdise || null,
          allocationStatus: s.allocationStatus || 'pending',
        };
      });

      // District remaining seats for this gender
      const vacancies = await storage.getVacancies(round.academicYear, round.roundName);
      const districtSeatsMap: Record<string, Record<string, number>> = {};
      vacancies.forEach((v: any) => {
        if (!v.district || v.gender !== gender) return;
        if (!districtSeatsMap[v.district]) districtSeatsMap[v.district] = {};
        const cat = v.category || 'Open';
        districtSeatsMap[v.district][cat] = (districtSeatsMap[v.district][cat] || 0) + (Number(v.availableSeats) || 0);
      });
      const districtSeats = Object.entries(districtSeatsMap).map(([district, cats]) => ({
        district,
        ...cats,
        total: Object.values(cats).reduce((a: number, b: number) => a + b, 0),
      })).sort((a, b) => a.district.localeCompare(b.district));

      res.json({
        round: {
          id: round.id,
          roundName: round.roundName,
          roundNumber: round.roundNumber,
          academicYear: round.academicYear,
          startedAt: round.updatedAt || round.createdAt,
        },
        gender,
        categoryProgress,
        students: playbackStudents,
        districtSeats,
        totalStudents: playbackStudents.length,
      });
    } catch (error) {
      console.error('Counseling display live error:', error);
      res.status(500).json({ message: 'Failed to fetch counseling display data' });
    }
  });

  app.get('/api/counseling-rounds/:id/prerequisites', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const round = await storage.getCounselingRound(id);
      if (!round) return res.status(404).json({ message: "Round not found" });

      const vacancies = await storage.getVacancies(round.academicYear, round.roundName || '');
      const results = await storage.getStudentsEntranceResultsByRound(round.academicYear, round.roundName || '');
      const pendingStudents = await storage.getStudentsByStatus('pending', round.academicYear);
      const notAllottedStudents = await storage.getStudentsByStatus('not_allotted', round.academicYear);

      const students = [...pendingStudents, ...notAllottedStudents];
      const studentsWithChoices = students.filter(s => s.choice1 && s.stream);
      const studentsWithChoicesCount = studentsWithChoices.length;
      const lockedStudentsCount = students.filter(s => s.lockedBy || s.isLocked).length;
      const hasStudentChoices = studentsWithChoicesCount > 0;

      // 1. Check merit matching
      const studentsWithMeritDataCount = students.filter(s => results.some(er => er.applicationNo === s.appNo && er.meritNo)).length;

      // 2. Check if all eligible districts configured preferences and are finalized
      const districtsWithEligibleStudents = new Set<string>();
      students.forEach(student => {
        if (student.counselingDistrict) {
          // Normalize to lowercase for reliable comparison
          districtsWithEligibleStudents.add(student.counselingDistrict.toLowerCase());
        }
      });
      districtsWithEligibleStudents.add('sas nagar (mohali)'); // Central always included

      const allDistrictStatuses = await storage.getAllDistrictStatuses(round.id);
      const eligibleDistrictStatuses = allDistrictStatuses.filter(ds =>
        districtsWithEligibleStudents.has(ds.district.toLowerCase())
      );

      const totalDistrictsCount = Array.from(districtsWithEligibleStudents).length;
      const finalizedDistrictsCount = eligibleDistrictStatuses.filter(ds => ds.isFinalized).length;
      const allDistrictsFinalized = totalDistrictsCount > 0 && finalizedDistrictsCount === totalDistrictsCount;

      // 3. Central Finalization
      const isAllocationFinalized = round.isAllocationFinalized === true;

      res.json({
        hasVacancyData: vacancies.length > 0,
        vacancyCount: vacancies.length,
        totalAvailableSeats: vacancies.reduce((acc, v) => acc + (v.availableSeats || 0), 0),
        hasEntranceResults: results.length > 0,
        entranceResultsCount: results.length,
        hasStudentChoices,
        studentsWithChoicesCount,
        lockedStudentsCount,
        studentsWithMeritDataCount,
        allDistrictsFinalized,
        totalDistrictsCount,
        finalizedDistrictsCount,
        isAllocationFinalized,
        allPrerequisitesMet: vacancies.length > 0 && results.length > 0 && hasStudentChoices && studentsWithMeritDataCount > 0 && allDistrictsFinalized && isAllocationFinalized
      });
    } catch (error) {
      console.error("Prerequisites error:", error);
      res.status(500).json({ message: "Failed to check prerequisites" });
    }
  });

  app.put('/api/counseling-rounds/:id', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate, isActive, isSuspended, isCompleted, isAllocationFinalized } = req.body;
      const updates: any = {};
      if (startDate !== undefined) updates.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;
      if (isActive !== undefined) updates.isActive = isActive;
      if (isSuspended !== undefined) updates.isSuspended = isSuspended;
      if (req.body.hasOwnProperty('isCompleted')) updates.isCompleted = isCompleted;
      if (req.body.hasOwnProperty('isAllocationFinalized')) {
        updates.isAllocationFinalized = isAllocationFinalized;
        if (isAllocationFinalized) {
          updates.allocationFinalizedAt = new Date();
          updates.allocationFinalizedBy = req.user.id;
        }
      }

      const round = await storage.updateCounselingRound(id, updates);
      res.json(round);
    } catch (error) {
      console.error("Update round error:", error);
      res.status(500).json({ message: "Failed to update round" });
    }
  });

  app.delete('/api/counseling-rounds/:id', isCentralAdmin, async (req: any, res) => {
    try {
      await storage.deleteCounselingRound(req.params.id);
      res.json({ message: "Success" });
    } catch (error) {
      console.error("Delete round error:", error);
      res.status(500).json({ message: "Failed to delete round" });
    }
  });

  // ─── Counseling Titles API ───
  app.get('/api/counseling-titles', async (req, res) => {
    try {
      const { academicYear } = req.query;
      const titles = await storage.getCounselingTitles(academicYear as string | undefined);
      res.json(titles);
    } catch (error) {
      console.error("Get titles error:", error);
      res.status(500).json({ message: "Failed to fetch counseling titles" });
    }
  });

  app.post('/api/counseling-titles', isCentralAdmin, async (req: any, res) => {
    try {
      const { academicYear, roundName, yearSessionId } = req.body;
      if (!academicYear || !roundName || !yearSessionId) {
        return res.status(400).json({ message: "Year, Title, and Session ID required" });
      }

      // Check if counseling title (roundName) already exists for this year
      const existing = await storage.getCounselingTitleByName(academicYear, roundName);
      if (existing) {
        return res.status(400).json({ message: "Counseling title already exists for this academic year" });
      }

      // Get the session to get the start date
      const sessions = await storage.getYearSessions();
      const session = sessions.find(s => s.id === yearSessionId);

      // Create the counseling title registry entry
      const newTitle = await storage.createCounselingTitle({
        academicYear,
        yearSessionId,
        titleName: roundName, // Using roundName as the machine key titleName
        displayName: roundName,
        isActive: true
      });

      // Auto-create Round 1 for this title
      const newRound = await storage.createCounselingRound({
        academicYear,
        counselingTitleId: newTitle.id,
        roundName,
        roundNumber: 1,
        startDate: session ? new Date(session.startDate) : new Date(),
        isActive: false,
        isCompleted: false,
        isAllocationCompleted: false,
        isAllocationFinalized: false
      });

      res.status(201).json({ 
        message: "Counseling title created successfully. Round 1 auto-created.", 
        title: newTitle,
        round: newRound 
      });
    } catch (error: any) {
      console.error("Create title error:", error);
      res.status(500).json({ message: error.message || "Failed to create title" });
    }
  });

  app.get('/api/counseling-titles/active', async (req, res) => {
    try {
      const { academicYear } = req.query;
      const titles = await storage.getCounselingTitles(academicYear as string | undefined);
      // Only active ones
      res.json(titles.filter(t => t.isActive));
    } catch (error) {
      console.error("Get active titles error:", error);
      res.status(500).json({ message: "Failed to fetch active counseling titles" });
    }
  });

  app.post('/api/counseling-titles/legacy', isCentralAdmin, async (req: any, res) => {
    try {
      const { academicYear, roundName } = req.body;
      if (!academicYear || !roundName) return res.status(400).json({ message: "Year and Title required" });

      const newRound = await storage.createCounselingRound({
        academicYear,
        roundName,
        roundNumber: 1,
        startDate: new Date(),
        isActive: false,
        isCompleted: false,
        isAllocationCompleted: false,
        isAllocationFinalized: false
      });
      res.status(201).json({ message: "Counseling title created successfully", round: newRound });
    } catch (error: any) {
      console.error("Create title error:", error);
      res.status(500).json({ message: error.message || "Failed to create title" });
    }
  });

  app.post('/api/counseling-titles/:academicYear/:roundName/suspend', isCentralAdmin, async (req: any, res) => {
    try {
      const { academicYear, roundName } = req.params;
      const { suspend } = req.body;
      const rounds = await storage.toggleSuspendCounseling(academicYear, roundName, suspend);
      res.json({ message: "Success", rounds, suspend });
    } catch (error) {
      console.error("Suspend error:", error);
      res.status(500).json({ message: "Failed to suspend" });
    }
  });

  // Allocation routes
  app.post('/api/counseling-rounds/:id/run-allocation', isCentralAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const activeRound = await storage.getCounselingRound(id);

      if (!activeRound || !activeRound.isActive) {
        return res.status(400).json({ message: "No active counseling round found" });
      }
      const academicYear = activeRound.academicYear;

      // Note: isAllocationFinalized and isAllocationCompleted are cleared automatically
      // by resetAllocation() at the start of each allocation run, so no blocking check needed here.

      // Check if all districts with eligible students are finalized
      const allDistrictStatuses = await storage.getAllDistrictStatuses();
      const studentsData = await storage.getStudents(10000, 0);

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

      // Wire real-time progress: allocation service calls onProgress, we write to in-memory store
      setProgress(id, { status: 'starting', queues: {}, processed: 0, total: 0, allottedCount: 0, notAllottedCount: 0, logs: [], startedAt: Date.now() });

      // Before kicking off allocation algorithm, snapshot the exact live student state
      const preCurrentStudents = await storage.getStudents(10000, 0, academicYear);
      const preSnapshotStudents = activeRound.counselingTitleId 
        ? preCurrentStudents.filter(s => s.counselingTitleId === activeRound.counselingTitleId)
        : preCurrentStudents;

      await storage.updateCounselingRound(activeRound.id, {
        preSnapshotData: preSnapshotStudents
      });

      // RUN IN BACKGROUND - DO NOT AWAIT to prevent browser timeout on long pauses
      allocationService.runAllocation(academicYear, activeRound.roundNumber, activeRound.id, (event) => {
        setProgress(id, {
          status: event.status || 'running',
          processed: event.processed,
          total: event.total,
          totalSeats: event.totalSeats,
          seatsFilled: event.seatsFilled,
          allottedCount: event.allottedCount,
          notAllottedCount: event.notAllottedCount,
          queues: event.queues,
          districtCounters: event.districtCounters,
        });
      }).then(async (result) => {
        setProgress(id, { status: 'completed', processed: result.totalStudents, total: result.totalStudents });

        await storage.updateCounselingRound(activeRound.id, {
          isAllocationCompleted: true
        });

        await auditService.log(req.user.id, 'allocation_run', 'allocation', 'system', {
          counselingRoundId: activeRound.id,
          result,
        }, req.ip, req.get('User-Agent'));

        // Clear progress store after 60 seconds of completion
        setTimeout(() => clearProgress(id), 60000);
      }).catch((error) => {
        setProgress(id, { status: 'error' });
        console.error("Run allocation background error:", error);
      });

      // Return immediately so the browser request doesn't timeout if the allocation is paused for minutes/hours
      res.status(202).json({ message: "Allocation started and running in background", status: "starting" });
    } catch (error: any) {
      setProgress(req.params.roundId, { status: 'error' });
      console.error("Run allocation init error:", error);
      res.status(500).json({ message: error.message || "Failed to initialize allocation" });
    }
  });

  // Real-time allocation progress polling endpoint
  app.get('/api/allocation/progress/:roundId', isAuthenticated, async (req, res) => {
    try {
      const { roundId } = req.params;
      const progress = getProgress(roundId);
      if (!progress) {
        return res.json({ status: 'idle', isPaused: false, isCancelled: false, delayMs: 100, queues: {}, processed: 0, total: 0, totalSeats: 0, seatsFilled: 0, allottedCount: 0, notAllottedCount: 0, districtCounters: [] });
      }
      res.json(progress);
    } catch (error) {
      res.status(500).json({ message: "Failed to get progress" });
    }
  });

  // Allocation Control Endpoints
  app.post('/api/allocation/:roundId/pause', isCentralAdmin, async (req, res) => {
    const { roundId } = req.params;
    setProgress(roundId, { isPaused: true, status: 'paused' });
    res.json({ message: 'Paused' });
  });

  app.post('/api/allocation/:roundId/resume', isCentralAdmin, async (req, res) => {
    const { roundId } = req.params;
    setProgress(roundId, { isPaused: false, status: 'running' });
    res.json({ message: 'Resumed' });
  });

  app.post('/api/allocation/:roundId/cancel', isCentralAdmin, async (req, res) => {
    const { roundId } = req.params;
    setProgress(roundId, { isCancelled: true, status: 'cancelled' });
    res.json({ message: 'Cancelled' });
  });

  app.post('/api/allocation/:roundId/speed', isCentralAdmin, async (req, res) => {
    const { roundId } = req.params;
    const { delayMs } = req.body;
    setProgress(roundId, { delayMs: Number(delayMs) || 0 });
    res.json({ message: 'Speed updated' });
  });

  // Reset allocation for a specific round
  app.post('/api/counseling-rounds/:id/reset-allocation', isCentralAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const round = await storage.getCounselingRound(id);
      if (!round) {
        return res.status(404).json({ message: "Counseling round not found" });
      }

      // Initialize progress tracking
      setProgress(id, {
        status: 'resetting',
        processed: 0,
        total: 0,
        allottedCount: 0,
        notAllottedCount: 0,
        queues: {},
        logs: [],
        startedAt: Date.now(),
      });

      // Get ALL students for this academic year, but ONLY reset those allotted in this specific counseling round
      const allStudents = await storage.getStudents(10000, 0, round.academicYear);
      const studentsToReset = allStudents.filter(s =>
        s.counselingRoundId === id || s.counselingRoundNumber === round.roundNumber
      );

      const totalToProcess = studentsToReset.length;
      let clearedCount = 0;

      setProgress(id, { total: totalToProcess, queues: { 'Resetting': { currentStudent: null, previousStudent: null, nextStudent: null, processedCount: 0, allottedCount: 0, deniedCount: 0, message: `Clearing ${totalToProcess} student allocations...` } } });

      // Clear ALL students with any allocation data
      for (const student of studentsToReset) {
        await storage.updateStudent(student.id, {
          allottedDistrict: null,
          allottedStream: null,
          allottedSchoolUdise: null,
          counselingRoundId: null,
          counselingRoundNumber: null,
          allocationStatus: 'pending',
        });
        clearedCount++;

        // Update progress in memory for every student, the frontend polls every 500ms
        // Emit progress
        if (clearedCount % 10 === 0) {
          setProgress(id, {
            processed: clearedCount,
            total: studentsToReset.length,
            queues: {
              'Resetting': {
                currentStudent: {
                  name: student.name,
                  meritNumber: student.meritNumber,
                  appNo: student.appNo || '',
                  gender: student.gender,
                  category: student.category,
                  stream: student.stream,
                  counselingDistrict: student.counselingDistrict || undefined,
                  result: 'processing',
                  allottedDistrict: student.allottedDistrict || undefined,
                },
                previousStudent: null,
                nextStudent: null,
                processedCount: clearedCount,
                allottedCount: 0,
                deniedCount: 0,
                message: `Clearing students... ${clearedCount}/${totalToProcess}`,
              }
            }
          });
        }
      }

      // Restore specific vacancies for seats given up by these students
      setProgress(id, { queues: { 'Restoring': { currentStudent: null, previousStudent: null, nextStudent: null, processedCount: 0, allottedCount: 0, deniedCount: 0, message: 'Restoring vacancy seats...' } } });
      let restoredVacancies = 0;
      const allVacancies = await storage.getVacancies(round.academicYear);
      
      for (const student of studentsToReset) {
        if (student.allottedSchoolUdise && student.allottedStream && student.gender && student.category) {
          // Find the exact vacancy that was used
          const vac = allVacancies.find(v => 
            v.udiseCode === student.allottedSchoolUdise && 
            v.stream === student.allottedStream &&
            v.gender === student.gender &&
            v.category === student.category
          );
          
          if (vac && typeof vac.availableSeats === 'number') {
            await storage.updateVacancy(vac.id, { availableSeats: vac.availableSeats + 1 });
            vac.availableSeats += 1; // Update local copy for subsequent checks
            restoredVacancies++;
          }
        }
      }

      // Reset round flags — bring back to pre-allocation state
      await storage.updateCounselingRound(id, {
        isAllocationCompleted: false,
      });

      // Mark progress as completed
      setProgress(id, {
        status: 'completed',
        processed: totalToProcess,
        total: totalToProcess,
        queues: { 'Completed': { currentStudent: null, previousStudent: null, nextStudent: null, processedCount: totalToProcess, allottedCount: 0, deniedCount: 0, message: 'Reset complete!' } },
      });

      // Clear progress after 10 seconds
      setTimeout(() => clearProgress(id), 10000);

      await auditService.log(req.user.id, 'allocation_reset', 'allocation', 'system', {
        counselingRoundId: id,
        clearedStudents: clearedCount,
        restoredVacancies,
        totalStudentsInYear: allStudents.length,
      }, req.ip, req.get('User-Agent'));

      res.json({
        message: `Reset complete. Cleared ${clearedCount} student allocations. Restored ${restoredVacancies} vacancies.`,
        clearedStudents: clearedCount,
        restoredVacancies,
      });
    } catch (error: any) {
      setProgress(id, { status: 'error' });
      console.error("Reset allocation error:", error);
      res.status(500).json({ message: error.message || "Failed to reset allocation" });
    }
  });

  app.get('/api/allocation/status', isAuthenticated, async (req, res) => {
    try {
      const { counselingTitleId } = req.query;
      const yearSessions = await storage.getYearSessions();
      const currentYS = yearSessions.find(y => y.isCurrent);
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentYS?.sessionName || currentSessionSetting?.value || '2024-2025';
      const activeRound = counselingTitleId
        ? await storage.getActiveCounselingRoundForTitle(counselingTitleId as string)
        : await storage.getActiveCounselingRound(academicYear);

      res.json({
        completed: activeRound ? activeRound.isAllocationCompleted : false,
        finalized: activeRound ? activeRound.isAllocationFinalized : false,
        roundId: activeRound?.id,
        roundName: activeRound?.roundName,
        roundNumber: activeRound?.roundNumber,
      });
    } catch (error) {
      console.error("Get allocation status error:", error);
      res.status(500).json({ message: "Failed to fetch allocation status" });
    }
  });

  app.get('/api/allocation/lifecycle-stats', isAuthenticated, async (req: any, res) => {
    try {
      const { counselingTitleId, roundId, timing } = req.query;
      
      if (!counselingTitleId) {
        return res.status(400).json({ message: "counselingTitleId is required" });
      }

      // 1. Get total from entrance result for baseline tracking
      const totalStudents = await storage.getStudentsEntranceResultsCount(counselingTitleId as string);

      let workingSet: any[] = [];
      
      if (roundId && roundId !== 'current') {
        const round = await storage.getCounselingRound(roundId as string);
        if (!round) return res.status(404).json({ message: "Round not found" });
        
        if (timing === 'before') {
          workingSet = (round.preSnapshotData as any[]) || [];
        } else {
          workingSet = (round.snapshotData as any[]) || [];
        }
      } else {
        // If no round selected, we show CURRENT LIVE DATA
        workingSet = await storage.getStudents(10000, 0, undefined, undefined, undefined, undefined, undefined, counselingTitleId as string);
      }

      // Initialize counter
      const stats = {
        total: totalStudents,
        registered: 0,
        pending: 0,
        locked: 0, // In db, locked status is actually allocationStatus = pending && isLocked = true
        allotted: 0,
        not_allotted: 0,
        admitted: 0,
        not_admitted: 0,
        vacated: 0
      };

      // Count actuals
      let trackedInSystem = 0;
      workingSet.forEach(student => {
        trackedInSystem++;
        // If they are locked...
        if (student.allocationStatus === 'pending' && student.isLocked) {
          stats.locked++;
        } else if (student.allocationStatus === 'pending') {
          stats.pending++;
        } else if (student.allocationStatus === 'registered') {
          stats.registered++;
        } else if (student.allocationStatus === 'allotted') {
          stats.allotted++;
        } else if (student.allocationStatus === 'not_allotted') {
          stats.not_allotted++;
        } else if (student.allocationStatus === 'admitted') {
          stats.admitted++;
        } else if (student.allocationStatus === 'not_admitted') {
          stats.not_admitted++;
        } else if (student.allocationStatus === 'vacated') {
          stats.vacated++;
        }
      });
      
      // Anyone who isn't even in the students table yet is effectively 'registered' awaiting preference entry
      stats.registered += Math.max(0, totalStudents - trackedInSystem);

      return res.json(stats);
    } catch (error) {
      console.error("Lifecycle stats error:", error);
      res.status(500).json({ message: "Failed to fetch lifecycle stats" });
    }
  });

  app.get('/api/allocation/stats', isAuthenticated, async (req, res) => {
    try {
      const { counselingTitleId } = req.query;
      // Get total students from entrance results (all students)
      const totalEntranceResults = await storage.getStudentsEntranceResultsCount(counselingTitleId as string);

      // Get students with allocation data (only those with preferences set)
      const students = await storage.getStudents(10000, 0, undefined, undefined, undefined, undefined, undefined, counselingTitleId as string);
      const allottedStudents = students.filter(s => s.allocationStatus === 'allotted' || s.allocationStatus === 'admitted');
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

  // Download snapshot report for a finalized counseling round
  app.get('/api/counseling-rounds/:id/snapshot', isAuthenticated, async (req: any, res) => {
    try {
      const round = await storage.getCounselingRound(req.params.id);
      if (!round) {
        return res.status(404).json({ message: "Counseling round not found" });
      }
      if (!round.isAllocationFinalized) {
        return res.status(400).json({ message: "Round is not finalized yet" });
      }

      // If snapshotData is null, regenerate from live data and backfill
      let snapshotStudents: any[];
      if (!round.snapshotData) {
        console.log(`[Snapshot] No snapshot data for round ${round.id}, regenerating from live data...`);
        const liveStudents = await storage.getStudents(10000, 0, round.academicYear);
        snapshotStudents = liveStudents.filter(s => 
          s.allocationStatus === 'allotted' || 
          s.allocationStatus === 'admitted' || 
          s.allocationStatus === 'vacated' || 
          s.allocationStatus === 'not_allotted'
        );
        // Backfill the snapshot column so it's available next time
        await storage.updateCounselingRound(round.id, { snapshotData: snapshotStudents });
        console.log(`[Snapshot] Backfilled ${snapshotStudents.length} students into snapshotData for round ${round.id}`);
      } else {
        snapshotStudents = round.snapshotData as any[];
      }

      const format = (req.query.format as string) || 'csv';

      if (format === 'csv') {
        const headers = ['Merit No', 'App No', 'Name', 'Gender', 'Category', 'Stream',
          'Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Choice 5',
          'Choice 6', 'Choice 7', 'Choice 8', 'Choice 9', 'Choice 10',
          'Allotted District', 'Allotted Stream', 'Status', 'Round'];

        const rows = snapshotStudents.map(s => [
          s.meritNumber, s.appNo || '', s.name, s.gender || '', s.category || '', s.stream || '',
          s.choice1 || '', s.choice2 || '', s.choice3 || '', s.choice4 || '', s.choice5 || '',
          s.choice6 || '', s.choice7 || '', s.choice8 || '', s.choice9 || '', s.choice10 || '',
          s.allottedDistrict || '', s.allottedStream || '', s.allocationStatus || '', s.counselingRoundNumber || ''
        ]);

        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="snapshot-${round.roundName}-R${round.roundNumber}.csv"`);
        return res.send(csvContent);
      }

      // PDF format
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="snapshot-${round.roundName}-R${round.roundNumber}.pdf"`);
      doc.pipe(res);

      // ─── FETCH VACANCY DATA FOR TOTAL SEATS ───
      const vacancyData = await storage.getVacancies(round.academicYear, round.roundName || undefined);

      // ─── PAGE 1: SUMMARY MATRIX ───
      doc.fontSize(16).fillColor('#111827').text(`Snapshot Report: ${round.roundName} — Round ${round.roundNumber}`, { align: 'center' }).moveDown(0.3);
      const dateStr = round.allocationFinalizedAt ? new Date(round.allocationFinalizedAt as any).toLocaleString('en-IN') : 'N/A';
      doc.fontSize(9).fillColor('#64748b').text(`Finalized: ${dateStr}  |  Total Students Processed: ${snapshotStudents.length}`, { align: 'center' }).moveDown(0.8);

      const allotted = snapshotStudents.filter((s: any) => s.allocationStatus === 'allotted' || s.allocationStatus === 'admitted');
      const notAllotted = snapshotStudents.filter((s: any) => s.allocationStatus === 'not_allotted');
      const vacated = snapshotStudents.filter((s: any) => s.allocationStatus === 'vacated');

      // Build summary matrix: District → Stream → Gender → Category → { allotted, total }
      const categories = ['Open', 'WHH', 'Disabled', 'Private'];
      const genders = ['Male', 'Female'];
      const streams = Array.from(new Set(snapshotStudents.map((s: any) => s.stream).filter(Boolean))) as string[];
      const districts = Array.from(new Set(snapshotStudents.map((s: any) => s.allottedDistrict || s.counselingDistrict).filter(Boolean))) as string[];
      districts.sort();

      // Build total seats map from vacancies
      const totalSeatsMap: Record<string, number> = {};
      vacancyData.forEach((v: any) => {
        const key = `${v.district}|${v.stream}|${v.gender}|${v.category}`;
        totalSeatsMap[key] = (totalSeatsMap[key] || 0) + (v.totalSeats || 0);
      });

      // Build allotted counts map from snapshot
      const allottedMap: Record<string, number> = {};
      allotted.forEach((s: any) => {
        const dist = s.allottedDistrict || '';
        const key = `${dist}|${s.stream}|${s.gender}|${s.category}`;
        allottedMap[key] = (allottedMap[key] || 0) + 1;
      });

      // ─── OVERALL SUMMARY BAR ───
      doc.fontSize(11).fillColor('#1e293b');
      const summaryY = doc.y;
      const barHeight = 22;
      const barWidth = 780;
      const barX = 30;
      doc.rect(barX, summaryY, barWidth, barHeight).fillAndStroke('#f0fdf4', '#bbf7d0');
      doc.fontSize(10).fillColor('#166534').text(
        `✓ Allotted: ${allotted.length}     ✗ Not Allotted: ${notAllotted.length}     ⊘ Vacated: ${vacated.length}     ═ Total: ${snapshotStudents.length}`,
        barX + 10, summaryY + 6, { width: barWidth - 20, align: 'center' }
      );
      doc.y = summaryY + barHeight + 12;

      // ─── MATRIX TABLE: Per-District, Gender × Category ───
      // Column layout: District | Stream | M-Open | M-WHH | M-Dis | M-Pvt | F-Open | F-WHH | F-Dis | F-Pvt | Total
      const mCols = [
        { label: 'District', width: 90 },
        { label: 'Stream', width: 65 },
      ];
      genders.forEach(g => {
        categories.forEach(c => {
          mCols.push({ label: `${g.charAt(0)}-${c.substring(0, 3)}`, width: 52 });
        });
      });
      mCols.push({ label: 'Total', width: 50 });
      
      const totalTableWidth = mCols.reduce((s, c) => s + c.width, 0);
      
      // Draw matrix header
      doc.fontSize(9).fillColor('#334155').text('Allotted / Total Seats Matrix by District, Stream, Gender & Category', 30, doc.y, { align: 'left' }).moveDown(0.3);

      const drawMatrixHeader = (yPos: number) => {
        let xPos = 30;
        mCols.forEach(col => {
          doc.rect(xPos, yPos, col.width, 16).fillAndStroke('#1e293b', '#0f172a');
          doc.fontSize(6.5).fillColor('#ffffff').text(col.label, xPos + 2, yPos + 4, { width: col.width - 4, align: 'center' });
          xPos += col.width;
        });
        return yPos + 16;
      };

      let my = drawMatrixHeader(doc.y);

      // Grand totals
      const grandTotals: Record<string, { allotted: number; total: number }> = {};
      genders.forEach(g => categories.forEach(c => {
        grandTotals[`${g}|${c}`] = { allotted: 0, total: 0 };
      }));
      let globalAllotted = 0;
      let globalTotal = 0;

      // Per-district rows
      let rowIdx = 0;
      districts.forEach(district => {
        streams.forEach(stream => {
          if (my > doc.page.height - 50) {
            doc.addPage();
            my = drawMatrixHeader(30);
          }

          let xPos = 30;
          const bgColor = rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
          let rowAllotted = 0;
          let rowTotal = 0;

          // District cell
          doc.rect(xPos, my, mCols[0].width, 14).fillAndStroke(bgColor, '#e2e8f0');
          doc.fontSize(6).fillColor('#1e293b').text(district.length > 14 ? district.substring(0, 14) + '…' : district, xPos + 2, my + 4, { width: mCols[0].width - 4, align: 'left' });
          xPos += mCols[0].width;

          // Stream cell
          doc.rect(xPos, my, mCols[1].width, 14).fillAndStroke(bgColor, '#e2e8f0');
          doc.fontSize(6).fillColor('#475569').text(stream, xPos + 2, my + 4, { width: mCols[1].width - 4, align: 'center' });
          xPos += mCols[1].width;

          // Gender × Category cells
          let colIdx = 2;
          genders.forEach(g => {
            categories.forEach(c => {
              const key = `${district}|${stream}|${g}|${c}`;
              const a = allottedMap[key] || 0;
              const t = totalSeatsMap[key] || 0;
              rowAllotted += a;
              rowTotal += t;
              grandTotals[`${g}|${c}`].allotted += a;
              grandTotals[`${g}|${c}`].total += t;

              const cellBg = a > 0 && a >= t ? '#dcfce7' : a > 0 ? '#fef9c3' : bgColor;
              doc.rect(xPos, my, mCols[colIdx].width, 14).fillAndStroke(cellBg, '#e2e8f0');
              doc.fontSize(6).fillColor(a > 0 ? '#166534' : '#94a3b8').text(`${a}/${t}`, xPos + 2, my + 4, { width: mCols[colIdx].width - 4, align: 'center' });
              xPos += mCols[colIdx].width;
              colIdx++;
            });
          });

          globalAllotted += rowAllotted;
          globalTotal += rowTotal;

          // Total cell
          const totalBg = rowAllotted > 0 ? '#dbeafe' : bgColor;
          doc.rect(xPos, my, mCols[mCols.length - 1].width, 14).fillAndStroke(totalBg, '#e2e8f0');
          doc.fontSize(6.5).fillColor('#1e40af').text(`${rowAllotted}/${rowTotal}`, xPos + 2, my + 4, { width: mCols[mCols.length - 1].width - 4, align: 'center' });

          my += 14;
          rowIdx++;
        });
      });

      // Grand total row
      if (my > doc.page.height - 50) { doc.addPage(); my = drawMatrixHeader(30); }
      let xPos = 30;
      doc.rect(xPos, my, mCols[0].width + mCols[1].width, 16).fillAndStroke('#1e293b', '#0f172a');
      doc.fontSize(7).fillColor('#ffffff').text('GRAND TOTAL', xPos + 4, my + 4, { width: mCols[0].width + mCols[1].width - 8, align: 'center' });
      xPos += mCols[0].width + mCols[1].width;

      let colIdx = 2;
      genders.forEach(g => {
        categories.forEach(c => {
          const gt = grandTotals[`${g}|${c}`];
          doc.rect(xPos, my, mCols[colIdx].width, 16).fillAndStroke('#1e293b', '#0f172a');
          doc.fontSize(6.5).fillColor('#fbbf24').text(`${gt.allotted}/${gt.total}`, xPos + 2, my + 5, { width: mCols[colIdx].width - 4, align: 'center' });
          xPos += mCols[colIdx].width;
          colIdx++;
        });
      });
      doc.rect(xPos, my, mCols[mCols.length - 1].width, 16).fillAndStroke('#1e293b', '#0f172a');
      doc.fontSize(7).fillColor('#fbbf24').text(`${globalAllotted}/${globalTotal}`, xPos + 2, my + 5, { width: mCols[mCols.length - 1].width - 4, align: 'center' });

      // ─── PAGE 2+: DETAILED STUDENT LISTING ───
      doc.addPage();
      doc.fontSize(12).fillColor('#111827').text(`Student Detail — ${round.roundName} Round ${round.roundNumber}`, { align: 'center' }).moveDown(0.6);

      const colWidths = [40, 60, 100, 35, 50, 60, 100, 80, 60, 30];
      const detailHeaders = ['Merit', 'App No', 'Name', 'Gen', 'Cat', 'Stream', 'Allotted Dist', 'Allotted Stream', 'Status', 'Rnd'];

      const drawDetailHeader = (yPos: number) => {
        let x = 30;
        detailHeaders.forEach((h, i) => {
          doc.rect(x, yPos, colWidths[i], 18).fillAndStroke('#1f2937', '#111827');
          doc.fontSize(8).fillColor('#ffffff').text(h, x + 2, yPos + 5, { width: colWidths[i] - 4, align: 'left' });
          x += colWidths[i];
        });
        return yPos + 18;
      };

      let dy = drawDetailHeader(doc.y);

      snapshotStudents.sort((a: any, b: any) => (a.meritNumber || 0) - (b.meritNumber || 0)).forEach((s: any, idx: number) => {
        if (dy > doc.page.height - 40) {
          doc.addPage();
          dy = drawDetailHeader(30);
        }
        let x = 30;
        const status = s.allocationStatus || 'pending';
        const statusColor = status === 'allotted' ? '#10b981' : status === 'not_allotted' ? '#ef4444' : '#f59e0b';
        const texts = [
          s.meritNumber?.toString() || '', s.appNo || '', s.name || '', (s.gender || '').substring(0, 1),
          s.category || '', s.stream || '', s.allottedDistrict || '-', s.allottedStream || '-',
          status.replace('_', ' '), s.counselingRoundNumber?.toString() || ''
        ];
        texts.forEach((text, i) => {
          const bg = idx % 2 === 0 ? '#fafafa' : '#ffffff';
          doc.rect(x, dy, colWidths[i], 14).fillAndStroke(bg, '#e5e7eb');
          doc.fontSize(7).fillColor(i === 8 ? statusColor : '#374151').text(text, x + 2, dy + 4, { width: colWidths[i] - 4, align: 'left' });
          x += colWidths[i];
        });
        dy += 14;
      });

      doc.end();
    } catch (error) {
      console.error("Snapshot download error:", error);
      res.status(500).json({ message: "Failed to generate snapshot" });
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

  app.get('/api/export/counseling/csv', isCentralAdmin, async (req: any, res) => {
    try {
      const { roundIds } = req.query;
      if (!roundIds) return res.status(400).json({ message: 'roundIds parameter is required' });
      const ids = String(roundIds).split(',');

      const csvData = await exportService.exportCounseledStudentsAsCSV(ids);

      await auditService.log(req.user.id, 'export_counseling_csv', 'export', 'results', {
        format: 'csv', roundIds: ids
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=counseled_students.csv');
      res.send(csvData);
    } catch (error) {
      console.error("Export counseling CSV error:", error);
      res.status(500).json({ message: "Failed to export counseling CSV" });
    }
  });

  app.get('/api/export/counseling/pdf', isCentralAdmin, async (req: any, res) => {
    try {
      const { roundIds } = req.query;
      if (!roundIds) return res.status(400).json({ message: 'roundIds parameter is required' });
      const ids = String(roundIds).split(',');

      const pdfBuffer = await exportService.exportCounseledStudentsAsPDF(ids);

      await auditService.log(req.user.id, 'export_counseling_pdf', 'export', 'results', {
        format: 'pdf', roundIds: ids
      }, req.ip, req.get('User-Agent'));

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=counseled_students.pdf');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Export counseling PDF error:", error);
      res.status(500).json({ message: "Failed to export counseling PDF" });
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

  // Export Reports PDF
  app.get('/api/export/reports/pdf', isAuthenticated, async (req: any, res) => {
    try {
      const academicYear = req.query.academicYear as string | undefined;
      await exportService.exportReportsPDF(academicYear || '', res);
    } catch (error) {
      console.error("Export reports PDF error:", error);
      res.status(500).send("Failed to generate insights PDF");
    }
  });

  // Custom Export Routes
  app.post('/api/export/custom/csv', isAuthenticated, async (req: any, res) => {
    try {
      const { academicYear, filters, columns } = req.body;
      const csvData = await exportService.exportCustomCSV(academicYear, filters, columns);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=custom_allotment_report.csv');
      res.send(csvData);
    } catch (error) {
      console.error("Custom export CSV error:", error);
      res.status(500).send("Failed to generate custom CSV");
    }
  });

  app.post('/api/export/custom/pdf', isAuthenticated, async (req: any, res) => {
    try {
      const { academicYear, filters, columns } = req.body;
      await exportService.exportCustomPDF(academicYear, filters, columns, res);
    } catch (error) {
      console.error("Custom export PDF error:", error);
      res.status(500).send("Failed to generate custom PDF");
    }
  });

  // District status routes
  app.get('/api/district-status', isDistrictAdmin, async (req: any, res) => {
    try {
      const user = req.user;
      const { counselingTitleId } = req.query;
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = counselingTitleId
        ? await storage.getActiveCounselingRoundForTitle(counselingTitleId as string)
        : await storage.getActiveCounselingRound(academicYear);

      if (user.role === 'central_admin') {
        // Central admin can see all district statuses
        let statuses = await storage.getAllDistrictStatuses(activeRound?.id);

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
          statuses = await storage.getAllDistrictStatuses(activeRound?.id);
        }

        // Dynamically overwrite the locked and studentsWithChoices counters using real time studentData
        const dynamicStatuses = statuses.map((status) => {
          const districtSts = studentsData.filter(s => s.counselingDistrict === status.district && s.districtAdmin && s.choice1);
          return {
            ...status,
            totalStudents: districtSts.length,
            lockedStudents: districtSts.filter(s => s.isLocked).length,
            studentsWithChoices: districtSts.filter(s => s.choice1).length
          };
        });

        res.json(dynamicStatuses);
      } else if (user.role === 'district_admin') {
        // District admin can only see their own district status
        const status = await storage.getDistrictStatus(user.district, activeRound?.id);
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
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = await storage.getActiveCounselingRound(academicYear);

      const status = await storage.getDistrictStatus(district, activeRound?.id);
      
      // Merge live student counts into the static status object
      const districtStudents = await storage.getStudentsByDistrict(district, 10000, 0);
      const eligibleStudents = districtStudents.students.filter(s => s.counselingDistrict === district && s.districtAdmin && s.choice1);
      
      const responseStatus = status || { district, isFinalized: false, totalStudents: 0, lockedStudents: 0, studentsWithChoices: 0 };
      res.json({
        ...responseStatus,
        totalStudents: eligibleStudents.length,
        lockedStudents: eligibleStudents.filter(s => s.isLocked).length,
        studentsWithChoices: eligibleStudents.filter(s => s.choice1).length
      });
    } catch (error) {
      console.error("Get district status error:", error);
      res.status(500).json({ message: "Failed to fetch district status" });
    }
  });

  // Fetch the currently active counseling round
  app.get('/api/counseling/active-round', isAuthenticated, async (req: any, res) => {
    try {
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = await storage.getActiveCounselingRound(academicYear);
      
      if (!activeRound) {
        return res.json(null); // Return null instead of 404 if no round is active so frontend can handle it gracefully.
      }
      
      res.json(activeRound);
    } catch (error) {
      console.error("Fetch active counseling round error:", error);
      res.status(500).json({ message: "Failed to fetch active counseling round" });
    }
  });

  app.post('/api/district-status/:district/unfinalize', isCentralAdmin, async (req: any, res) => {
    try {
      const { district } = req.params;
      
      const unfinalized = await storage.unfinalizeDistrict(district);
      if (!unfinalized) {
        return res.status(404).json({ message: "District status not found" });
      }

      await auditService.log(req.session.userId, 'district_unfinalized', 'district', district, {
        reason: req.body?.reason || 'unfinalized by central admin'
      }, req.ip, req.get('User-Agent'));

      res.json(unfinalized);
    } catch (error) {
      console.error("Unfinalize district error:", error);
      res.status(500).json({ message: "Failed to unfinalize district" });
    }
  });

  app.post('/api/district-status/:district/finalize', isDistrictAdmin, async (req: any, res) => {
    try {
      const { district } = req.params;
      const user = await storage.getUser(req.session.userId);

      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = await storage.getActiveCounselingRound(academicYear);

      if (!activeRound) {
        console.warn(`[Finalization] No active counseling round found for ${academicYear}. Finalizing district ${district} without an associated round ID.`);
      }

      // Permission check: District admins can only finalize their own district
      if (user?.role === 'district_admin' && normalizeDistrict(user.district || '') !== normalizeDistrict(district)) {
        return res.status(403).json({ message: "Can only finalize your own district" });
      }

      // Check if all eligible students in district are locked
      const districtStudents = await storage.getStudentsByDistrict(district);

      // Only consider students that belong to this district AND have district admin assigned AND have preference data for finalization
      const eligibleStudents = districtStudents.students.filter(s =>
        s.counselingDistrict === district && s.districtAdmin && s.choice1 // Must belong to district, have district admin and at least first choice
      );

      const unlockedEligibleStudents = eligibleStudents.filter(s => !s.isLocked);

      if (unlockedEligibleStudents.length > 0) {
        if (user?.role === 'central_admin') {
          // Central Admin override: Auto-lock remaining unlocked eligible students
          for (const s of unlockedEligibleStudents) {
            await storage.updateStudent(s.id, { isLocked: true });
          }
        } else {
          return res.status(400).json({
            message: `Cannot finalize district: ${unlockedEligibleStudents.length} eligible students are not locked. All students with district admin assignments and preferences must be locked before finalization.`,
            unlockedCount: unlockedEligibleStudents.length,
            eligibleTotal: eligibleStudents.length
          });
        }
      }

      const status = await storage.finalizeDistrict(district, req.session.userId, activeRound?.id);

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

  // District Admin Unfinalize Request
  app.post('/api/district-status/:district/unfinalize-request', isAuthenticated, async (req: any, res) => {
    try {
      const { district } = req.params;
      const { reason } = req.body;
      const user = await storage.getUser(req.session.userId);

      if (user?.role !== 'district_admin' || user.district !== district) {
        return res.status(403).json({ message: "Only the assigned district admin can request unfinalization" });
      }

      if (!reason) {
        return res.status(400).json({ message: "Reason is required" });
      }

      const status = await storage.getDistrictStatus(district);
      if (!status?.isFinalized) {
        return res.status(400).json({ message: "District is not finalized" });
      }

      // Check if there's already a pending request
      const pendingRequests = await storage.getUnfinalizeRequestsByDistrict(district);
      if (pendingRequests.some(r => r.status === 'pending')) {
        return res.status(400).json({ message: "A request is already pending for this district" });
      }

      const request = await storage.createUnfinalizeRequest({
        district,
        counselingRoundId: status.counselingRoundId,
        requestedBy: req.session.userId,
        reason
      });

      await auditService.log(req.session.userId, 'unfinalize_request_created', 'unfinalizeRequests', request.id, {
        district, reason
      }, req.ip, req.get('User-Agent'));

      res.json(request);
    } catch (error) {
      console.error("Create unfinalize request error:", error);
      res.status(500).json({ message: "Failed to create unfinalize request" });
    }
  });

  // Central Admin Review Unfinalize Request
  app.post('/api/unfinalize-requests/:id/review', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, reviewComments } = req.body; // 'approved' | 'rejected'

      if (status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ message: "Invalid status. Must be approved or rejected" });
      }

      const request = (await storage.getUnfinalizeRequests()).find(r => r.id === id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ message: "Request is already processed" });
      }

      const updatedRequest = await storage.updateUnfinalizeRequest(id, {
        status,
        reviewComments,
        reviewedBy: req.session.userId,
        reviewedAt: new Date()
      });

      if (status === 'approved') {
        await storage.unfinalizeDistrict(request.district);
        await auditService.log(req.session.userId, 'district_unfinalized', 'district', request.district, {
          reason: 'Approved unfinalize request: ' + request.reason,
          comments: reviewComments
        }, req.ip, req.get('User-Agent'));
      }

      await auditService.log(req.session.userId, `unfinalize_request_${status}`, 'unfinalizeRequests', id, {
        district: request.district,
        comments: reviewComments
      }, req.ip, req.get('User-Agent'));

      res.json(updatedRequest);
    } catch (error) {
      console.error("Review unfinalize request error:", error);
      res.status(500).json({ message: "Failed to review unfinalize request" });
    }
  });

  // Get unfinalize requests (Central Admin sees all, District Admin sees theirs)
  app.get('/api/unfinalize-requests', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      let requests: UnfinalizeRequest[] = [];

      if (user?.role === 'central_admin') {
        requests = await storage.getUnfinalizeRequests();
      } else if (user?.role === 'district_admin' && user.district) {
        requests = await storage.getUnfinalizeRequestsByDistrict(user.district);
      } else {
        requests = [];
      }

      res.json(requests);
    } catch (error) {
      console.error("Get unfinalize requests error:", error);
      res.status(500).json({ message: "Failed to fetch unfinalize requests" });
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

      // Check if district is finalized
      if (user?.role !== 'central_admin' && student.counselingDistrict) {
        const districtStatus = await storage.getDistrictStatus(student.counselingDistrict);
        if (districtStatus?.isFinalized) {
          return res.status(403).json({ message: "Cannot change lock status: District is already finalized" });
        }
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
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res: any) => {
    try {
      const user = await storage.getUser(req.session.userId);
      const { academicYear, counselingTitleId } = req.query;
      const stats = await storage.getDashboardStats(user, academicYear as string, counselingTitleId as string);
      res.json(stats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Year Sessions routes
  app.get('/api/year-sessions', isAuthenticated, async (req, res) => {
    try {
      const sessions = await storage.getYearSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Get year sessions error:", error);
      res.status(500).json({ message: "Failed to fetch year sessions" });
    }
  });

  app.post('/api/year-sessions', isCentralAdmin, async (req, res) => {
    try {
      const { startDate } = req.body;
      if (!startDate) {
        return res.status(400).json({ message: "Start date is required" });
      }

      const date = new Date(startDate);
      const month = date.getMonth();
      const year = date.getFullYear();
      let sessionName = "";
      if (month >= 3) {
        sessionName = `${year}-${year + 1}`;
      } else {
        sessionName = `${year - 1}-${year}`;
      }

      const endDate = new Date(year + (month >= 3 ? 1 : 0), 2, 31).toISOString(); // March 31 of next year

      const session = await storage.createYearSession({
        sessionName,
        startDate: new Date(startDate).toISOString(),
        endDate,
        isCurrent: false,
        isActive: true,
      });
      res.status(201).json(session);
    } catch (error) {
      console.error("Create year session error:", error);
      res.status(500).json({ message: "Failed to create year session" });
    }
  });

  app.put('/api/year-sessions/:id/set-current', isCentralAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.setCurrentYearSession(id);

      // Keep the legacy setting in sync
      await storage.setSetting({
        key: 'current_session',
        value: session.sessionName,
        description: 'Current Academic Year'
      });

      res.json(session);
    } catch (error) {
      console.error("Set current session error:", error);
      res.status(500).json({ message: "Failed to set current session" });
    }
  });

  app.put('/api/year-sessions/:id', isCentralAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const session = await storage.updateYearSession(id, { isActive });
      res.json(session);
    } catch (error) {
      console.error("Update year session error:", error);
      res.status(500).json({ message: "Failed to update year session" });
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
