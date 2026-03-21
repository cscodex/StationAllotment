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
import { omrService } from "./omrService";
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
      const startTime = Date.now();
      await storage.pingDatabase(); // Assuming storage has a ping method, or we can just run a query
      const responseTime = Date.now() - startTime;
      res.json({ status: 'online', responseTime, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error("Database health check failed:", error);
      res.status(503).json({ status: 'offline', error: "Database connection failed", timestamp: new Date().toISOString() });
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
      const user = await storage.getUser(req.session.userId);

      if (allocated) {
        // For the reports page - return all students
        const students = await storage.getStudents(10000, 0);
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
      students = await storage.getStudents(limit, offset, undefined, undefined, districtAdminUsername, isFinalized);
      total = await storage.getStudentsCount(undefined, districtAdminUsername, isFinalized);

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

      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = await storage.getActiveCounselingRound(academicYear);

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

      // Set allocation as finalized on the active round
      await storage.updateCounselingRound(activeRound.id, {
        isAllocationFinalized: true,
        allocationFinalizedAt: currentTime,
        allocationFinalizedBy: req.session.userId
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

      const pdfBytes = await omrService.generateBulkOMRForms(studentIds);

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

      console.log(`[TESTING] Generating Mock Bubbled OMR forms for ${studentIds.length} students...`);
      const pdfBytes = await omrService.generateBulkOMRForms(studentIds, true); // testFillMode = true

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="mock_scenarios_${studentIds.length}_students.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error("Test Scenarios OMR Generation error:", error);
      res.status(500).json({ message: error.message || "Failed to generate Mock OMR testing forms" });
    }
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
      const vacancies = await storage.getVacancies();
      res.json(vacancies);
    } catch (error) {
      console.error("Get vacancies error:", error);
      res.status(500).json({ message: "Failed to fetch vacancies" });
    }
  });

  // Counseling Rounds API
  app.get('/api/counseling-rounds', isAuthenticated, async (req: any, res) => {
    try {
      const { academicYear } = req.query;
      const rounds = await storage.getCounselingRounds(academicYear as string);
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
        s.allocationStatus === 'allotted' && s.counselingRoundId === roundId
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
        const filled = inCat.filter((s: any) => s.allocationStatus === 'allotted').length;
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
      const { startDate, endDate, isActive, isSuspended } = req.body;
      const updates: any = {};
      if (startDate !== undefined) updates.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;
      if (isActive !== undefined) updates.isActive = isActive;
      if (isSuspended !== undefined) updates.isSuspended = isSuspended;

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

  app.post('/api/counseling-titles', isCentralAdmin, async (req: any, res) => {
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
      setProgress(id, { status: 'resetting', processed: 0, total: 0, allottedCount: 0, notAllottedCount: 0, currentStudent: null, bucket: '', logs: [], startedAt: Date.now() });

      const result = await allocationService.runAllocation(academicYear, activeRound.roundNumber, activeRound.id, (event) => {
        setProgress(id, {
          status: 'running',
          processed: event.processed,
          total: event.total,
          allottedCount: event.allottedCount,
          notAllottedCount: event.notAllottedCount,
          currentStudent: event.currentStudent,
          bucket: event.bucket,
        });
      });

      setProgress(id, { status: 'completed', processed: result.totalStudents, total: result.totalStudents });

      await storage.updateCounselingRound(activeRound.id, {
        isAllocationCompleted: true
      });

      await auditService.log(req.user.id, 'allocation_run', 'allocation', 'system', {
        counselingRoundId: activeRound.id,
        result,
      }, req.ip, req.get('User-Agent'));

      res.json(result);

      // Clear progress store after 30 seconds
      setTimeout(() => clearProgress(id), 30000);
    } catch (error: any) {
      setProgress(id, { status: 'error' });
      console.error("Run allocation error:", error);
      res.status(500).json({ message: error.message || "Failed to run allocation" });
    }
  });

  // Real-time allocation progress polling endpoint
  app.get('/api/allocation/progress/:roundId', isAuthenticated, async (req, res) => {
    try {
      const { roundId } = req.params;
      const progress = getProgress(roundId);
      if (!progress) {
        return res.json({ status: 'idle', processed: 0, total: 0, allottedCount: 0, notAllottedCount: 0, currentStudent: null, bucket: '' });
      }
      res.json(progress);
    } catch (error) {
      res.status(500).json({ message: "Failed to get progress" });
    }
  });

  // Reset allocation for a specific round
  app.post('/api/counseling-rounds/:id/reset-allocation', isCentralAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const round = await storage.getCounselingRound(id);
      if (!round) {
        return res.status(404).json({ message: "Counseling round not found" });
      }

      // Clear allotted district/stream/school for students in this round
      const allStudents = await storage.getStudents(10000, 0, round.academicYear);
      const roundStudents = allStudents.filter(s => s.counselingRoundId === id);
      let clearedCount = 0;

      for (const student of roundStudents) {
        await storage.updateStudent(student.id, {
          allottedDistrict: null,
          allottedStream: null,
          allottedSchoolUdise: null,
          counselingRoundId: null,
          counselingRoundNumber: null,
          allocationStatus: 'pending',
        });
        clearedCount++;
      }

      // Also reset not_allotted students back to pending
      const notAllottedStudents = allStudents.filter(s => s.allocationStatus === 'not_allotted');
      for (const student of notAllottedStudents) {
        await storage.updateStudent(student.id, { allocationStatus: 'pending' });
      }

      // Restore vacancies
      if (round.roundName) {
        const vacancies = await storage.getVacancies(round.academicYear, round.roundName);
        for (const vacancy of vacancies) {
          if (vacancy.totalSeats !== vacancy.availableSeats) {
            await storage.updateVacancy(vacancy.id, { availableSeats: vacancy.totalSeats || 0 });
          }
        }
      }

      // Reset round flags
      await storage.updateCounselingRound(id, {
        isAllocationCompleted: false,
        isAllocationFinalized: false,
        allocationFinalizedAt: null,
        allocationFinalizedBy: null,
      });

      await auditService.log(req.user.id, 'allocation_reset', 'allocation', 'system', {
        counselingRoundId: id,
        clearedStudents: clearedCount,
        resetNotAllotted: notAllottedStudents.length,
      }, req.ip, req.get('User-Agent'));

      res.json({ message: `Reset complete. Cleared ${clearedCount} allocations.`, clearedStudents: clearedCount });
    } catch (error: any) {
      console.error("Reset allocation error:", error);
      res.status(500).json({ message: error.message || "Failed to reset allocation" });
    }
  });

  app.get('/api/allocation/status', isAuthenticated, async (req, res) => {
    try {
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = await storage.getActiveCounselingRound(academicYear);

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
      const currentSessionSetting = await storage.getSetting('current_session');
      const academicYear = currentSessionSetting?.value || '2024-2025';
      const activeRound = await storage.getActiveCounselingRound(academicYear);

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
      const stats = await storage.getDashboardStats(user);
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
