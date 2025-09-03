import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { IStorage } from '../storage';
import { InsertStudent, InsertVacancy, DISTRICTS, STREAMS } from '@shared/schema';

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

  private async parseStudentFile(file: Express.Multer.File): Promise<InsertStudent[]> {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((row: any) => ({
      appNo: row.AppNo || row.app_no || row['App No'] || row.ApplicationNumber || row.application_number || row['Application Number'],
      meritNumber: parseInt(row.MeritNumber) || parseInt(row.merit_number) || parseInt(row['Merit Number']),
      name: row.Name || row.name || row['Student Name'],
      stream: row.Stream || row.stream,
      choice1: row.Choice1 || row.choice1 || row['Choice 1'],
      choice2: row.Choice2 || row.choice2 || row['Choice 2'],
      choice3: row.Choice3 || row.choice3 || row['Choice 3'],
      choice4: row.Choice4 || row.choice4 || row['Choice 4'],
      choice5: row.Choice5 || row.choice5 || row['Choice 5'],
      choice6: row.Choice6 || row.choice6 || row['Choice 6'],
      choice7: row.Choice7 || row.choice7 || row['Choice 7'],
      choice8: row.Choice8 || row.choice8 || row['Choice 8'],
      choice9: row.Choice9 || row.choice9 || row['Choice 9'],
      choice10: row.Choice10 || row.choice10 || row['Choice 10'],
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
      if (!student.appNo || student.appNo.trim() === '') {
        errors.push(`Row ${row}: Application Number (App No) is required`);
      }

      if (!student.meritNumber) {
        errors.push(`Row ${row}: Merit Number is required`);
      } else if (seenMeritNumbers.has(student.meritNumber)) {
        errors.push(`Row ${row}: Duplicate Merit Number ${student.meritNumber}`);
      } else {
        seenMeritNumbers.add(student.meritNumber);
      }

      if (!student.name || student.name.trim() === '') {
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
}
