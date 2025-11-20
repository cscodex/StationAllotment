import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { IStorage } from '../storage';
import { InsertStudent, InsertVacancy, InsertStudentsEntranceResult, InsertSchool, DISTRICTS, STREAMS, CounselingRound } from '@shared/schema';

export class FileService {
  constructor(private storage: IStorage) {}

  async processStudentFile(file: Express.Multer.File, uploadedBy: string, academicYear: string, counselingRoundId?: string) {
    // Validate academic year format (YYYY-YYYY)
    if (!academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
      throw new Error('Invalid academic year format. Expected format: YYYY-YYYY (e.g., 2024-2025)');
    }

    // Get counseling round - use provided ID or fallback to active round
    let round: CounselingRound | undefined;
    if (counselingRoundId) {
      round = await this.storage.getCounselingRound(counselingRoundId);
      if (!round) {
        throw new Error(`Counseling round with ID ${counselingRoundId} not found`);
      }
      // Validate that the round belongs to the specified academic year
      if (round.academicYear !== academicYear) {
        throw new Error(`Counseling round ${counselingRoundId} does not belong to academic year ${academicYear}`);
      }
    } else {
      // Fallback to active round if no specific round provided
      round = await this.storage.getActiveCounselingRound(academicYear);
    }

    const fileUpload = await this.storage.createFileUpload({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      type: 'student_choices',
      status: 'uploaded',
      academicYear,
      counselingRoundId: round?.id || null,
      uploadedBy,
    });

    try {
      const students = await this.parseStudentFile(file, academicYear);
      const validationResults = this.validateStudents(students);

      if (validationResults.errors.length > 0) {
        await this.storage.updateFileUpload(fileUpload.id, {
          status: 'failed',
          validationResults,
        });
        return { ...fileUpload, status: 'failed', validationResults };
      }

      // Associate students with the selected or active counseling round
      if (round) {
        students.forEach(student => {
          student.counselingRoundId = round.id;
          student.counselingRoundNumber = round.roundNumber;
        });
      }

      // Clear existing students for this academic year and insert new ones
      // Note: We don't delete all students, only those for this academic year
      const existingStudents = await this.storage.getStudents(10000, 0, academicYear);
      // Delete students for this academic year
      for (const student of existingStudents) {
        // Note: We'll need a delete method or update to handle this
        // For now, we'll bulk upsert which will update existing ones
      }
      await this.storage.bulkCreateStudents(students);

      await this.storage.updateFileUpload(fileUpload.id, {
        status: 'processed',
        validationResults: { 
          errors: [], 
          processed: students.length,
          message: `Successfully processed ${students.length} student records` 
        },
      });

      return { 
        ...fileUpload, 
        status: 'processed', 
        validationResults: { 
          errors: [], 
          processed: students.length,
          message: `Successfully processed ${students.length} student records` 
        } 
      };
    } catch (error) {
      await this.storage.updateFileUpload(fileUpload.id, {
        status: 'failed',
        validationResults: { 
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          processed: 0 
        },
      });
      throw error;
    } finally {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
  }

  async processVacancyFile(file: Express.Multer.File, uploadedBy: string, academicYear: string, counselingRoundId?: string) {
    // Validate academic year format (YYYY-YYYY)
    if (!academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
      throw new Error('Invalid academic year format. Expected format: YYYY-YYYY (e.g., 2024-2025)');
    }

    // Get counseling round - use provided ID or fallback to active round
    let round: CounselingRound | undefined;
    if (counselingRoundId) {
      round = await this.storage.getCounselingRound(counselingRoundId);
      if (!round) {
        throw new Error(`Counseling round with ID ${counselingRoundId} not found`);
      }
      if (round.academicYear !== academicYear) {
        throw new Error(`Counseling round ${counselingRoundId} does not belong to academic year ${academicYear}`);
      }
    } else {
      round = await this.storage.getActiveCounselingRound(academicYear);
    }

    const fileUpload = await this.storage.createFileUpload({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      type: 'vacancies',
      status: 'uploaded',
      academicYear,
      counselingRoundId: round?.id || null,
      uploadedBy,
    });

    try {
      const { vacancies, schools: schoolsList } = await this.parseVacancyFile(file, academicYear);
      const validationResults = this.validateVacancies(vacancies);

      if (validationResults.errors.length > 0) {
        await this.storage.updateFileUpload(fileUpload.id, {
          status: 'failed',
          validationResults,
        });
        return { ...fileUpload, status: 'failed', validationResults };
      }

      // First, upsert schools (create/update school records)
      if (schoolsList.length > 0) {
        await this.storage.bulkUpsertSchools(schoolsList);
      }

      // Clear existing vacancies for this academic year and insert new ones
      // Note: Vacancies are uploaded once per year, so we delete all for this year
      const existingVacancies = await this.storage.getVacancies(academicYear);
      // Delete vacancies for this academic year only
      // We'll need to implement a delete method that filters by year
      // For now, bulkUpsert will update existing ones based on unique constraint
      await this.storage.bulkUpsertVacancies(vacancies);

      await this.storage.updateFileUpload(fileUpload.id, {
        status: 'processed',
        validationResults: { 
          errors: [], 
          processed: vacancies.length,
          message: `Successfully processed ${vacancies.length} vacancy records` 
        },
      });

      return { 
        ...fileUpload, 
        status: 'processed', 
        validationResults: { 
          errors: [], 
          processed: vacancies.length,
          message: `Successfully processed ${vacancies.length} vacancy records` 
        } 
      };
    } catch (error) {
      await this.storage.updateFileUpload(fileUpload.id, {
        status: 'failed',
        validationResults: { 
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          processed: 0 
        },
      });
      throw error;
    } finally {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
  }

  async processEntranceResultsFile(file: Express.Multer.File, uploadedBy: string, academicYear: string, counselingRoundId?: string) {
    // Validate academic year format (YYYY-YYYY)
    if (!academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
      throw new Error('Invalid academic year format. Expected format: YYYY-YYYY (e.g., 2024-2025)');
    }

    // Get counseling round - use provided ID or fallback to active round
    let round: CounselingRound | undefined;
    if (counselingRoundId) {
      round = await this.storage.getCounselingRound(counselingRoundId);
      if (!round) {
        throw new Error(`Counseling round with ID ${counselingRoundId} not found`);
      }
      if (round.academicYear !== academicYear) {
        throw new Error(`Counseling round ${counselingRoundId} does not belong to academic year ${academicYear}`);
      }
    } else {
      round = await this.storage.getActiveCounselingRound(academicYear);
    }

    const fileUpload = await this.storage.createFileUpload({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      type: 'entrance_results',
      status: 'uploaded',
      academicYear,
      counselingRoundId: round?.id || null,
      uploadedBy,
    });

    try {
      const entranceResults = await this.parseEntranceResultsFile(file, academicYear);
      const validationResults = this.validateEntranceResults(entranceResults);

      if (validationResults.errors.length > 0) {
        await this.storage.updateFileUpload(fileUpload.id, {
          status: 'failed',
          validationResults,
        });
        return { ...fileUpload, status: 'failed', validationResults };
      }

      // Insert entrance results (don't clear existing ones, allow additions)
      await this.storage.bulkCreateStudentsEntranceResults(entranceResults);

      // Auto-create student records from entrance results with common fields
      const studentsToCreate: InsertStudent[] = [];
      
      for (const result of entranceResults) {
        // Check if student already exists
        const existingStudent = await this.storage.getStudentByMeritNumber(result.meritNo);
        
        if (!existingStudent) {
          studentsToCreate.push({
            academicYear: academicYear,
            appNo: result.applicationNo,
            meritNumber: result.meritNo,
            name: result.studentName,
            gender: result.gender,
            category: result.category,
            stream: result.stream || '',
            choice1: null,
            choice2: null,
            choice3: null,
            choice4: null,
            choice5: null,
            choice6: null,
            choice7: null,
            choice8: null,
            choice9: null,
            choice10: null,
            allocationStatus: 'pending',
            counselingRoundId: round?.id || null,
            counselingRoundNumber: round?.roundNumber || null,
          });
        } else if (round && !existingStudent.counselingRoundId) {
          // Update existing student with round info if not already set
          await this.storage.updateStudent(existingStudent.id, {
            counselingRoundId: round.id,
            counselingRoundNumber: round.roundNumber,
          });
        }
      }

      // Insert the new student records
      if (studentsToCreate.length > 0) {
        await this.storage.bulkCreateStudents(studentsToCreate);
      }

      await this.storage.updateFileUpload(fileUpload.id, {
        status: 'processed',
        validationResults: { 
          errors: [], 
          processed: entranceResults.length,
          message: `Successfully processed ${entranceResults.length} entrance result records and auto-created ${studentsToCreate.length} student records` 
        },
      });

      return { 
        ...fileUpload, 
        status: 'processed', 
        validationResults: { 
          errors: [], 
          processed: entranceResults.length,
          message: `Successfully processed ${entranceResults.length} entrance result records` 
        } 
      };
    } catch (error) {
      await this.storage.updateFileUpload(fileUpload.id, {
        status: 'failed',
        validationResults: { 
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          processed: 0 
        },
      });
      throw error;
    } finally {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
  }

  generateEntranceResultsTemplate(): string {
    const headers = [
      'Merit No',
      'Application No', 
      'Roll No',
      'Student Name',
      'Marks',
      'Gender',
      'Category',
      'Stream'
    ];

    const sampleRows = [
      ['1001', 'APP2024001', 'ROLL001', 'Sample Student 1', '485', 'Male', 'Open', 'Medical'],
      ['1002', 'APP2024002', 'ROLL002', 'Sample Student 2', '480', 'Female', 'WHH', 'Commerce'],
      ['1003', 'APP2024003', 'ROLL003', 'Sample Student 3', '475', 'Male', 'Disabled', 'NonMedical']
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }

  generateStudentChoicesTemplate(): string {
    const headers = [
      'App No',
      'Merit Number',
      'Name',
      'Gender',
      'Category',
      'Stream',
      'Choice 1',
      'Choice 2',
      'Choice 3',
      'Choice 4',
      'Choice 5',
      'Choice 6',
      'Choice 7',
      'Choice 8',
      'Choice 9',
      'Choice 10'
    ];

    const sampleRows = [
      ['APP2024001', '1001', 'Sample Student 1', 'Male', 'Open', 'Medical', 'Amritsar', 'Ludhiana', 'Jalandhar', '', '', '', '', '', '', ''],
      ['APP2024002', '1002', 'Sample Student 2', 'Female', 'WHH', 'Commerce', 'Patiala', 'Bathinda', 'Moga', 'Barnala', '', '', '', '', '', ''],
      ['APP2024003', '1003', 'Sample Student 3', 'Male', 'Disabled', 'NonMedical', 'Gurdaspur', 'Pathankot', 'Hoshiarpur', 'Jalandhar', 'Kapurthala', '', '', '', '', '']
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }

  generateVacanciesTemplate(): string {
    const headers = [
      'UDISE Code',
      'School Name',
      'District',
      'Stream',
      'Gender',
      'Category',
      'Total Seats',
      'Available Seats'
    ];

    const sampleRows = [
      ['03101234567', 'Government Senior Secondary School, Amritsar', 'Amritsar', 'Medical', 'Male', 'Open', '50', '50'],
      ['03101234567', 'Government Senior Secondary School, Amritsar', 'Amritsar', 'Medical', 'Male', 'Disabled', '5', '5'],
      ['03101234567', 'Government Senior Secondary School, Amritsar', 'Amritsar', 'Medical', 'Male', 'Private', '20', '20'],
      ['03101234567', 'Government Senior Secondary School, Amritsar', 'Amritsar', 'Medical', 'Female', 'Open', '40', '40'],
      ['03101234567', 'Government Senior Secondary School, Amritsar', 'Amritsar', 'Medical', 'Female', 'WHH', '15', '15'],
      ['03101234568', 'Government Senior Secondary School, Ludhiana', 'Ludhiana', 'Commerce', 'Male', 'Open', '60', '60'],
      ['03101234568', 'Government Senior Secondary School, Ludhiana', 'Ludhiana', 'Commerce', 'Female', 'WHH', '20', '20'],
      ['03101234569', 'Government Senior Secondary School, Jalandhar', 'Jalandhar', 'NonMedical', 'Male', 'Open', '45', '45'],
      ['03101234569', 'Government Senior Secondary School, Jalandhar', 'Jalandhar', 'NonMedical', 'Female', 'Open', '35', '35']
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }

  private async parseEntranceResultsFile(file: Express.Multer.File, academicYear: string): Promise<InsertStudentsEntranceResult[]> {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((row: any) => ({
      academicYear: academicYear,
      meritNo: parseInt(row['Merit No'] || row.MeritNo || row.merit_no || row.meritNumber || row.merit_number) || 0,
      applicationNo: String(row['Application No'] || row.ApplicationNo || row.application_no || row.app_no || row.AppNo || ''),
      rollNo: String(row['Roll No'] || row.RollNo || row.roll_no || row.rollNumber || row.roll_number || ''),
      studentName: String(row['Student Name'] || row.StudentName || row.student_name || row.Name || row.name || ''),
      marks: parseInt(row.Marks || row.marks || row.Score || row.score || row.TotalMarks || row.total_marks) || 0,
      gender: String(row.Gender || row.gender || row.Sex || row.sex || ''),
      category: String(row.Category || row.category || row.Quota || row.quota || ''),
      stream: String(row.Stream || row.stream || ''),
    }));
  }

  private async parseStudentFile(file: Express.Multer.File, academicYear: string): Promise<InsertStudent[]> {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((row: any) => ({
      academicYear: academicYear,
      appNo: String(row['App No'] || row.AppNo || row.app_no || row.ApplicationNumber || row.application_number || row['Application Number'] || ''),
      meritNumber: parseInt(row.MeritNo || row.MeritNumber || row.merit_number || row['Merit Number']) || 0,
      name: String(row.Name || row.name || row['Student Name'] || ''),
      gender: String(row.Gender || row.gender || ''),
      category: String(row.Category || row.category || ''),
      stream: String(row.Stream || row.stream || ''),
      choice1: row.choice1 || row.Choice1 || row['Choice 1'] || null,
      choice2: row.choice2 || row.Choice2 || row['Choice 2'] || null,
      choice3: row.choice3 || row.Choice3 || row['Choice 3'] || null,
      choice4: row.choice4 || row.Choice4 || row['Choice 4'] || null,
      choice5: row.choice5 || row.Choice5 || row['Choice 5'] || null,
      choice6: row.choice6 || row.Choice6 || row['Choice 6'] || null,
      choice7: row.choice7 || row.Choice7 || row['Choice 7'] || null,
      choice8: row.choice8 || row.Choice8 || row['Choice 8'] || null,
      choice9: row.choice9 || row.Choice9 || row['Choice 9'] || null,
      choice10: row.choice10 || row.Choice10 || row['Choice 10'] || null,
      allocationStatus: 'pending',
    }));
  }

  private async parseVacancyFile(file: Express.Multer.File, academicYear: string): Promise<{ vacancies: InsertVacancy[], schools: InsertSchool[] }> {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Track unique schools
    const schoolsMap = new Map<string, InsertSchool>();
    const vacancies: InsertVacancy[] = [];

    data.forEach((row: any) => {
      const udiseCode = String(row['UDISE Code'] || row.udiseCode || row.UDISECode || row['UDISE_Code'] || '').trim();
      const schoolName = String(row['School Name'] || row.schoolName || row.SchoolName || row['School_Name'] || '').trim();
      const district = String(row.District || row.district || '').trim();

      // Create school entry if UDISE code provided
      if (udiseCode && schoolName && district) {
        if (!schoolsMap.has(udiseCode)) {
          schoolsMap.set(udiseCode, {
            udiseCode,
            schoolName,
            district,
          });
        }
      }

      // Create vacancy entry with academic year
      const totalSeats = parseInt(row['Total Seats'] || row.totalSeats || row.total_seats || row.TotalSeats) || 0;
      vacancies.push({
        academicYear: academicYear,
        udiseCode: udiseCode || null,
        district,
        stream: String(row.Stream || row.stream || ''),
        gender: String(row.Gender || row.gender || ''),
        category: String(row.Category || row.category || ''),
        totalSeats: totalSeats,
        availableSeats: totalSeats, // Initially, available seats = total seats
      });
    });

    return {
      vacancies,
      schools: Array.from(schoolsMap.values()),
    };
  }

  private validateStudents(students: InsertStudent[]): { errors: string[]; processed: number } {
    const errors: string[] = [];
    const seenMeritNumbers = new Set<number>();

    students.forEach((student, index) => {
      const row = index + 1;

      // Check required fields
      if (!student.appNo || String(student.appNo).trim() === '') {
        errors.push(`Row ${row}: Application Number (App No) is required`);
      }

      if (!student.meritNumber) {
        errors.push(`Row ${row}: Merit Number is required`);
      } else if (seenMeritNumbers.has(student.meritNumber)) {
        errors.push(`Row ${row}: Duplicate Merit Number ${student.meritNumber}`);
      } else {
        seenMeritNumbers.add(student.meritNumber);
      }

      if (!student.name || String(student.name).trim() === '') {
        errors.push(`Row ${row}: Student Name is required`);
      }

      if (!student.stream || !STREAMS.includes(student.stream as any)) {
        errors.push(`Row ${row}: Invalid stream. Must be one of: ${STREAMS.join(', ')}`);
      }

      // Validate choices are valid districts
      for (let i = 1; i <= 10; i++) {
        const choice = (student as any)[`choice${i}`];
        if (choice && !DISTRICTS.includes(choice)) {
          errors.push(`Row ${row}: Invalid district in Choice${i}. Must be one of: ${DISTRICTS.join(', ')}`);
        }
      }
    });

    return { errors, processed: students.length };
  }

  private validateVacancies(vacancies: InsertVacancy[]): { errors: string[]; processed: number } {
    const errors: string[] = [];
    const seenCombinations = new Set<string>();

    vacancies.forEach((vacancy, index) => {
      const row = index + 1;
      // New unique combination: udiseCode-stream-gender-category
      const combination = vacancy.udiseCode 
        ? `${vacancy.udiseCode}-${vacancy.stream}-${vacancy.gender}-${vacancy.category}`
        : `${vacancy.district}-${vacancy.stream}-${vacancy.gender}-${vacancy.category}`;

      // UDISE code validation (required for school-level vacancies)
      if (!vacancy.udiseCode || String(vacancy.udiseCode).trim() === '') {
        errors.push(`Row ${row}: UDISE Code is required`);
      } else {
        // Validate UDISE code format (typically 11 digits)
        const udiseCodeStr = String(vacancy.udiseCode).trim();
        if (!/^\d{11}$/.test(udiseCodeStr)) {
          errors.push(`Row ${row}: Invalid UDISE Code format. Must be 11 digits. Found: ${udiseCodeStr}`);
        }
      }

      if (!vacancy.district || !DISTRICTS.includes(vacancy.district as any)) {
        errors.push(`Row ${row}: Invalid district. Must be one of: ${DISTRICTS.join(', ')}`);
      }

      if (!vacancy.stream || !STREAMS.includes(vacancy.stream as any)) {
        errors.push(`Row ${row}: Invalid stream. Must be one of: ${STREAMS.join(', ')}`);
      }

      if (!vacancy.gender || !['Male', 'Female', 'Other'].includes(vacancy.gender)) {
        errors.push(`Row ${row}: Invalid gender. Must be one of: Male, Female, Other`);
      }

      if (!vacancy.category || !['Open', 'WHH', 'Disabled', 'Private'].includes(vacancy.category)) {
        errors.push(`Row ${row}: Invalid category. Must be one of: Open, WHH, Disabled, Private`);
      }

      if (seenCombinations.has(combination)) {
        errors.push(`Row ${row}: Duplicate combination of UDISE Code-Stream-Gender-Category: ${combination}`);
      } else {
        seenCombinations.add(combination);
      }

      if (vacancy.totalSeats! < 0 || vacancy.availableSeats! < 0) {
        errors.push(`Row ${row}: Seat counts cannot be negative`);
      }

      if (vacancy.availableSeats! > vacancy.totalSeats!) {
        errors.push(`Row ${row}: Available seats cannot exceed total seats`);
      }
    });

    return { errors, processed: vacancies.length };
  }

  private validateEntranceResults(entranceResults: InsertStudentsEntranceResult[]): { errors: string[]; processed: number } {
    const errors: string[] = [];
    const seenMeritNumbers = new Set<number>();
    const seenAppNumbers = new Set<string>();
    const seenRollNumbers = new Set<string>();
    const validGenders = ['Male', 'Female', 'Other'];

    entranceResults.forEach((result, index) => {
      const row = index + 1;

      // Check required fields
      if (!result.meritNo) {
        errors.push(`Row ${row}: Merit Number is required`);
      } else if (seenMeritNumbers.has(result.meritNo)) {
        errors.push(`Row ${row}: Duplicate Merit Number ${result.meritNo}`);
      } else {
        seenMeritNumbers.add(result.meritNo);
      }

      if (!result.applicationNo || String(result.applicationNo).trim() === '') {
        errors.push(`Row ${row}: Application Number is required`);
      } else if (seenAppNumbers.has(result.applicationNo)) {
        errors.push(`Row ${row}: Duplicate Application Number ${result.applicationNo}`);
      } else {
        seenAppNumbers.add(result.applicationNo);
      }

      if (!result.rollNo || String(result.rollNo).trim() === '') {
        errors.push(`Row ${row}: Roll Number is required`);
      } else if (seenRollNumbers.has(result.rollNo)) {
        errors.push(`Row ${row}: Duplicate Roll Number ${result.rollNo}`);
      } else {
        seenRollNumbers.add(result.rollNo);
      }

      if (!result.studentName || String(result.studentName).trim() === '') {
        errors.push(`Row ${row}: Student Name is required`);
      }

      if (!result.marks || result.marks < 0 || result.marks > 500) {
        errors.push(`Row ${row}: Marks must be between 0 and 500`);
      }

      if (!result.gender || !validGenders.includes(result.gender)) {
        errors.push(`Row ${row}: Gender must be one of: ${validGenders.join(', ')}`);
      }

      if (!result.stream || !STREAMS.includes(result.stream as any)) {
        errors.push(`Row ${row}: Invalid stream. Must be one of: ${STREAMS.join(', ')}`);
      }
    });

    return { errors, processed: entranceResults.length };
  }

  // Validation-only methods (don't save to database)
  async validateStudentFile(file: Express.Multer.File, academicYear: string) {
    try {
      const students = await this.parseStudentFile(file, academicYear);
      const validationResults = this.validateStudents(students);
      
      return {
        isValid: validationResults.errors.length === 0,
        message: validationResults.errors.length === 0 
          ? `File is valid. Found ${students.length} student records.`
          : `Found ${validationResults.errors.length} validation errors.`,
        errors: validationResults.errors,
        warnings: [],
        recordCount: students.length,
        allRecords: students.map(student => ({
          appNo: student.appNo,
          meritNumber: student.meritNumber,
          name: student.name,
          stream: student.stream,
          gender: student.gender,
          category: student.category,
          choice1: student.choice1,
          choice2: student.choice2,
          choice3: student.choice3,
          choice4: student.choice4,
          choice5: student.choice5,
          choice6: student.choice6,
          choice7: student.choice7,
          choice8: student.choice8,
          choice9: student.choice9,
          choice10: student.choice10
        })),
        preview: students.slice(0, 10).map(student => ({
          appNo: student.appNo,
          meritNumber: student.meritNumber,
          name: student.name,
          stream: student.stream,
          choice1: student.choice1,
          choice2: student.choice2,
          choice3: student.choice3
        }))
      };
    } catch (error) {
      return {
        isValid: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        recordCount: 0,
        allRecords: [],
        preview: []
      };
    } finally {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
  }

  async validateVacancyFile(file: Express.Multer.File, academicYear: string) {
    try {
      const { vacancies, schools } = await this.parseVacancyFile(file, academicYear);
      const validationResults = this.validateVacancies(vacancies);
      
      return {
        isValid: validationResults.errors.length === 0,
        message: validationResults.errors.length === 0 
          ? `File is valid. Found ${vacancies.length} vacancy records and ${schools.length} unique schools.`
          : `Found ${validationResults.errors.length} validation errors.`,
        errors: validationResults.errors,
        warnings: [],
        recordCount: vacancies.length,
        allRecords: vacancies.map(vacancy => ({
          udiseCode: vacancy.udiseCode,
          district: vacancy.district,
          stream: vacancy.stream,
          gender: vacancy.gender,
          category: vacancy.category,
          totalSeats: vacancy.totalSeats,
          availableSeats: vacancy.availableSeats
        })),
        preview: vacancies.slice(0, 10).map(vacancy => ({
          udiseCode: vacancy.udiseCode,
          district: vacancy.district,
          stream: vacancy.stream,
          totalSeats: vacancy.totalSeats,
          availableSeats: vacancy.availableSeats,
          category: vacancy.category,
          gender: vacancy.gender
        }))
      };
    } catch (error) {
      return {
        isValid: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        recordCount: 0,
        allRecords: [],
        preview: []
      };
    } finally {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
  }

  async validateEntranceResultsFile(file: Express.Multer.File, academicYear: string) {
    try {
      const entranceResults = await this.parseEntranceResultsFile(file, academicYear);
      const validationResults = this.validateEntranceResults(entranceResults);
      
      return {
        isValid: validationResults.errors.length === 0,
        message: validationResults.errors.length === 0 
          ? `File is valid. Found ${entranceResults.length} entrance result records.`
          : `Found ${validationResults.errors.length} validation errors.`,
        errors: validationResults.errors,
        warnings: [],
        recordCount: entranceResults.length,
        allRecords: entranceResults.map(result => ({
          meritNo: result.meritNo,
          applicationNo: result.applicationNo,
          rollNo: result.rollNo,
          studentName: result.studentName,
          marks: result.marks,
          gender: result.gender,
          category: result.category,
          stream: result.stream
        })),
        preview: entranceResults.slice(0, 10).map(result => ({
          meritNo: result.meritNo,
          applicationNo: result.applicationNo,
          rollNo: result.rollNo,
          studentName: result.studentName,
          marks: result.marks,
          gender: result.gender,
          stream: result.stream
        }))
      };
    } catch (error) {
      return {
        isValid: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        recordCount: 0,
        allRecords: [],
        preview: []
      };
    } finally {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
  }
}
