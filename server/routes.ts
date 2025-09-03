import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import session from "express-session";
import connectPg from "connect-pg-simple";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { insertUserSchema, insertStudentSchema, insertVacancySchema, USER_ROLES } from "@shared/schema";
import { FileService } from "./services/fileService";
import { AllocationService } from "./services/allocationService";
import { ExportService } from "./services/exportService";
import { AuditService } from "./services/auditService";

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

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
    secret: process.env.SESSION_SECRET || 'seat-allotment-secret-key',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  });
}

const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.session && req.session.userId) {
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
  
  req.user = user;
  return next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", 1);
  app.use(getSession());

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

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      
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
        district: user.district 
      });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // File upload routes
  app.post('/api/files/upload/students', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const result = await fileService.processStudentFile(req.file, req.user.id);
      
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

      const result = await fileService.processVacancyFile(req.file, req.user.id);
      
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
  app.get('/api/students', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const students = await storage.getStudents(limit, offset);
      const total = await storage.getStudentsCount();
      
      res.json({ students, total });
    } catch (error) {
      console.error("Get students error:", error);
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  app.get('/api/students/:meritNumber', isAuthenticated, async (req, res) => {
    try {
      const meritNumber = parseInt(req.params.meritNumber);
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

  app.put('/api/students/:id/preferences', isDistrictAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const preferences = req.body;
      
      // Validate deadline hasn't passed
      const deadline = await storage.getSetting('allocation_deadline');
      if (deadline && new Date() > new Date(deadline.value)) {
        return res.status(403).json({ message: "Deadline has passed. Cannot modify preferences." });
      }

      const student = await storage.updateStudent(id, preferences);
      
      await auditService.log(req.user.id, 'student_preferences_update', 'students', id, {
        preferences,
        userDistrict: req.user.district,
      }, req.ip, req.get('User-Agent'));

      res.json(student);
    } catch (error) {
      console.error("Update student preferences error:", error);
      res.status(500).json({ message: "Failed to update preferences" });
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

  // Allocation routes
  app.post('/api/allocation/run', isCentralAdmin, async (req: any, res) => {
    try {
      // Check if allocation has already been run
      const allocationRun = await storage.getSetting('allocation_completed');
      if (allocationRun && allocationRun.value === 'true') {
        return res.status(400).json({ message: "Allocation has already been completed" });
      }

      const result = await allocationService.runAllocation();
      
      await storage.setSetting({
        key: 'allocation_completed',
        value: 'true',
        description: 'Indicates if the final allocation has been run'
      });

      await auditService.log(req.user.id, 'allocation_run', 'allocation', 'system', {
        result,
      }, req.ip, req.get('User-Agent'));

      res.json(result);
    } catch (error) {
      console.error("Run allocation error:", error);
      res.status(500).json({ message: "Failed to run allocation" });
    }
  });

  app.get('/api/allocation/status', isAuthenticated, async (req, res) => {
    try {
      const allocationCompleted = await storage.getSetting('allocation_completed');
      const deadline = await storage.getSetting('allocation_deadline');
      
      res.json({
        completed: allocationCompleted?.value === 'true',
        deadline: deadline?.value,
      });
    } catch (error) {
      console.error("Get allocation status error:", error);
      res.status(500).json({ message: "Failed to fetch allocation status" });
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
