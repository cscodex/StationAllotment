import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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

      const defaultPassword = req.body.defaultPassword || 'Punjab@2024';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

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
        defaultPassword,
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

  app.post('/api/files/upload/entrance-results', isCentralAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const result = await fileService.processEntranceResultsFile(req.file, req.user.id);
      
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
      
      // District admin can only see students in their district
      if (user?.role === 'district_admin' && user.district) {
        const result = await storage.getStudentsByDistrict(user.district, limit, offset);
        students = result.students;
        total = result.total;
      } else {
        // Central admin can see all students
        students = await storage.getStudents(limit, offset);
        total = await storage.getStudentsCount();
      }
      
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

  app.put('/api/students/:id/preferences', isDistrictAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const preferences = req.body;
      const user = await storage.getUser(req.session.userId);
      
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
  app.put('/api/students/:id/lock', isDistrictAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isLocked } = req.body;
      
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
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

      const updatedStudent = await storage.updateStudent(id, { isLocked });
      
      await auditService.log(req.user.id, 'student_lock_status_change', 'students', id, {
        isLocked,
        studentName: student.name,
        appNo: student.appNo,
        userDistrict: req.user.district,
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

      const result = await fileService.validateStudentFile(req.file);
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

      const result = await fileService.validateVacancyFile(req.file);
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

      const result = await fileService.validateEntranceResultsFile(req.file);
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

  // District status routes
  app.get('/api/district-status', isCentralAdmin, async (req, res) => {
    try {
      const statuses = await storage.getAllDistrictStatuses();
      res.json(statuses);
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
      
      if (user?.role === 'district_admin' && user.district !== district) {
        return res.status(403).json({ message: "Can only finalize your own district" });
      }

      // Check if all students in district are locked
      const districtStudents = await storage.getStudentsByDistrict(district);
      const unlockedStudents = districtStudents.students.filter(s => !s.isLocked);
      
      if (unlockedStudents.length > 0) {
        return res.status(400).json({ 
          message: `Cannot finalize district: ${unlockedStudents.length} students are not locked. All students must be locked before finalization.`,
          unlockedCount: unlockedStudents.length
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

      const updatedStudent = isLocked 
        ? await storage.lockStudent(id)
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
      const requests = await storage.getPendingUnlockRequests();
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
