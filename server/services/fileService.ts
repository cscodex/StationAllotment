import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { IStorage } from '../storage';
import { InsertStudent, InsertVacancy, InsertStudentsEntranceResult, DISTRICTS, STREAMS } from '@shared/schema';

export class FileService {
  constructor(private storage: IStorage) {}

  async processStudentFile(file: Express.Multer.File, uploadedBy: string) {
    const fileUpload = await this.storage.createFileUpload({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      type: 'student_choices',
      status: 'uploaded',
      uploadedBy,
    });

    try {
      const students = await this.parseStudentFile(file);
      const validationResults = this.validateStudents(students);

      if (validationResults.errors.length > 0) {
        await this.storage.updateFileUpload(fileUpload.id, {
          status: 'failed',
          validationResults,
        });
        return { ...fileUpload, status: 'failed', validationResults };
      }

      // Clear existing students and insert new ones
      await this.storage.deleteAllStudents();
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

  async processVacancyFile(file: Express.Multer.File, uploadedBy: string) {
    const fileUpload = await this.storage.createFileUpload({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      type: 'vacancies',
      status: 'uploaded',
      uploadedBy,
    });

    try {
      const vacancies = await this.parseVacancyFile(file);
      const validationResults = this.validateVacancies(vacancies);

      if (validationResults.errors.length > 0) {
        await this.storage.updateFileUpload(fileUpload.id, {
          status: 'failed',
          validationResults,
        });
        return { ...fileUpload, status: 'failed', validationResults };
      }

      // Clear existing vacancies and insert new ones
      await this.storage.deleteAllVacancies();
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

  async processEntranceResultsFile(file: Express.Multer.File, uploadedBy: string) {
    const fileUpload = await this.storage.createFileUpload({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      type: 'entrance_results',
      status: 'uploaded',
      uploadedBy,
    });

    try {
      const entranceResults = await this.parseEntranceResultsFile(file);
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

      await this.storage.updateFileUpload(fileUpload.id, {
        status: 'processed',
        validationResults: { 
          errors: [], 
          processed: entranceResults.length,
          message: `Successfully processed ${entranceResults.length} entrance result records` 
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
      'Stream'
    ];

    const sampleRows = [
      ['1001', 'APP2024001', 'ROLL001', 'Sample Student 1', '485', 'Male', 'Medical'],
      ['1002', 'APP2024002', 'ROLL002', 'Sample Student 2', '480', 'Female', 'Commerce'],
      ['1003', 'APP2024003', 'ROLL003', 'Sample Student 3', '475', 'Male', 'NonMedical']
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }

  private async parseEntranceResultsFile(file: Express.Multer.File): Promise<InsertStudentsEntranceResult[]> {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((row: any) => ({
      meritNo: parseInt(row['Merit No'] || row.MeritNo || row.merit_no || row.meritNumber || row.merit_number) || 0,
      applicationNo: String(row['Application No'] || row.ApplicationNo || row.application_no || row.app_no || row.AppNo || ''),
      rollNo: String(row['Roll No'] || row.RollNo || row.roll_no || row.rollNumber || row.roll_number || ''),
      studentName: String(row['Student Name'] || row.StudentName || row.student_name || row.Name || row.name || ''),
      marks: parseInt(row.Marks || row.marks || row.Score || row.score || row.TotalMarks || row.total_marks) || 0,
      gender: String(row.Gender || row.gender || row.Sex || row.sex || ''),
      stream: String(row.Stream || row.stream || row.Category || row.category || ''),
    }));
  }

  private async parseStudentFile(file: Express.Multer.File): Promise<InsertStudent[]> {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((row: any) => ({
      appNo: String(row['App No'] || row.AppNo || row.app_no || row.ApplicationNumber || row.application_number || row['Application Number'] || ''),
      meritNumber: parseInt(row.MeritNo || row.MeritNumber || row.merit_number || row['Merit Number']) || 0,
      name: String(row.Name || row.name || row['Student Name'] || ''),
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

  private async parseVacancyFile(file: Express.Multer.File): Promise<InsertVacancy[]> {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((row: any) => ({
      district: row.District || row.district,
      medicalVacancies: parseInt(row.Medical_vac || row.medical_vac || row['Medical Vacancies']) || 0,
      commerceVacancies: parseInt(row.Commerce_vac || row.commerce_vac || row['Commerce Vacancies']) || 0,
      nonMedicalVacancies: parseInt(row.NonMedical_vac || row.non_medical_vac || row['NonMedical Vacancies']) || 0,
    }));
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
    const seenDistricts = new Set<string>();

    vacancies.forEach((vacancy, index) => {
      const row = index + 1;

      if (!vacancy.district || !DISTRICTS.includes(vacancy.district as any)) {
        errors.push(`Row ${row}: Invalid district. Must be one of: ${DISTRICTS.join(', ')}`);
      } else if (seenDistricts.has(vacancy.district)) {
        errors.push(`Row ${row}: Duplicate district ${vacancy.district}`);
      } else {
        seenDistricts.add(vacancy.district);
      }

      if (vacancy.medicalVacancies! < 0 || vacancy.commerceVacancies! < 0 || vacancy.nonMedicalVacancies! < 0) {
        errors.push(`Row ${row}: Vacancy counts cannot be negative`);
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
}
