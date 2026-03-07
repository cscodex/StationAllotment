import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { IStorage } from '../storage';
import { InsertStudent, InsertVacancy, InsertStudentsEntranceResult, InsertSchool, School, DISTRICTS, STREAMS, CounselingRound } from '@shared/schema';

import { progressStore } from '../utils/progressStore';

export class FileService {
  constructor(private storage: IStorage) { }

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

    // Validate upload order: Vacancies and Entrance Results must be uploaded first
    const roundName = round?.roundName || undefined;
    const vacancies = await this.storage.getVacancies(academicYear, roundName);
    if (vacancies.length === 0) {
      throw new Error('Upload order required: Please upload Vacancy Data file first before uploading Student Choices file.');
    }

    // Check if entrance results exist for this academic year and round name
    const entranceResults = await this.storage.getStudentsEntranceResults(10000, 0);
    const relevantEntranceResults = entranceResults.filter(er =>
      er.academicYear === academicYear &&
      (roundName ? er.roundName === roundName : true)
    );
    if (relevantEntranceResults.length === 0) {
      throw new Error('Upload order required: Please upload Entrance Results file before uploading Student Choices file.');
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

      // Initialize progress tracking
      progressStore.setProgress(fileUpload.id, {
        uploadId: fileUpload.id,
        total: students.length,
        processed: 0,
        percentage: 0,
        status: 'processing',
      });

      // Clear existing students for this academic year and insert new ones
      // Note: We don't delete all students, only those for this academic year
      const existingStudents = await this.storage.getStudents(10000, 0, academicYear);
      // Delete students for this academic year
      for (const student of existingStudents) {
        // Note: We'll need a delete method or update to handle this
        // For now, we'll bulk upsert which will update existing ones
      }
      await this.storage.bulkCreateStudents(students, (processed, total) => {
        progressStore.setProgress(fileUpload.id, {
          processed,
          total,
          status: 'processing',
        });
      });

      // Mark progress as completed
      progressStore.setProgress(fileUpload.id, {
        status: 'completed',
      });

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
      // Mark progress as failed
      progressStore.setProgress(fileUpload.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

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
      // Get all existing schools to check for name conflicts
      const existingSchools = await this.storage.getAllSchools();
      const existingSchoolsByName = new Map<string, School>();
      const existingSchoolsByUdise = new Map<string, School>();
      existingSchools.forEach(school => {
        existingSchoolsByName.set(school.schoolName, school);
        existingSchoolsByUdise.set(school.udiseCode, school);
      });

      const { vacancies, schools: schoolsList } = await this.parseVacancyFile(file, academicYear, existingSchoolsByName);
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

      // Set roundName on all vacancies (shared across all rounds of the same counseling title)
      const roundName = round?.roundName || null;
      if (roundName) {
        vacancies.forEach(vacancy => {
          vacancy.roundName = roundName;
        });
      }

      // Initialize progress tracking
      progressStore.setProgress(fileUpload.id, {
        uploadId: fileUpload.id,
        total: vacancies.length,
        processed: 0,
        percentage: 0,
        status: 'processing',
      });

      // Clear existing vacancies for this academic year and roundName, then insert new ones
      // Note: Vacancies are uploaded once per counseling title, shared across all rounds
      const existingVacancies = await this.storage.getVacancies(academicYear, roundName || undefined);
      // Delete vacancies for this academic year and roundName only
      // For now, bulkUpsert will update existing ones based on unique constraint
      await this.storage.bulkUpsertVacancies(vacancies, (processed, total) => {
        progressStore.setProgress(fileUpload.id, {
          processed,
          total,
          status: 'processing',
        });
      });

      // Mark progress as completed
      progressStore.setProgress(fileUpload.id, {
        status: 'completed',
      });

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
      // Mark progress as failed
      progressStore.setProgress(fileUpload.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

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

    // Validate upload order: Vacancies must be uploaded first
    const roundName = round?.roundName || undefined;
    const vacancies = await this.storage.getVacancies(academicYear, roundName);
    if (vacancies.length === 0) {
      throw new Error('Upload order required: Please upload Vacancy Data file first before uploading Entrance Results file.');
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

      // Set roundName on all entrance results (shared across all rounds of the same counseling title)
      const roundName = round?.roundName || null;
      if (roundName) {
        entranceResults.forEach(result => {
          result.roundName = roundName;
        });
      }

      // Initialize progress tracking
      progressStore.setProgress(fileUpload.id, {
        uploadId: fileUpload.id,
        total: entranceResults.length,
        processed: 0,
        percentage: 0,
        status: 'processing',
      });

      // Insert entrance results (don't clear existing ones, allow additions)
      // Note: Entrance results are uploaded once per counseling title, shared across all rounds
      await this.storage.bulkCreateStudentsEntranceResults(entranceResults, (processed, total) => {
        progressStore.setProgress(fileUpload.id, {
          processed,
          total,
          status: 'processing',
        });
      });

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

      // Mark progress as completed
      progressStore.setProgress(fileUpload.id, {
        status: 'completed',
      });

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
      // Mark progress as failed
      progressStore.setProgress(fileUpload.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

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

  generateVacanciesTestData(): string {
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

    // School districts with unique UDISE codes
    const districtUdiseCodes: Record<string, string> = {
      'Amritsar': '03010100001',
      'Bathinda': '03020100002',
      'Ferozepur': '03030100003',
      'Gurdaspur': '03040100004',
      'Jalandhar': '03050100005',
      'Ludhiana': '03090508916',
      'Patiala': '03070100007',
      'SAS Nagar': '03090100009',
      'Sangrur': '03100100010',
      'Talwara': '03110100011'
    };

    const rows: string[][] = [];

    // Group 1: Districts with 500 seats per school
    // Amritsar, Bathinda, Jalandhar, Ludhiana, SAS Nagar (Mohali), Patiala
    const group1Districts = ['Amritsar', 'Bathinda', 'Jalandhar', 'Ludhiana', 'SAS Nagar', 'Patiala'];

    group1Districts.forEach((district) => {
      const udiseCode = districtUdiseCodes[district];
      const schoolName = `Government Senior Secondary School, ${district}`;

      // Medical Stream
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'Open', '36', '36']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'Private', '6', '6']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'WHH', '12', '12']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'Disabled', '6', '6']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Male', 'Open', '34', '34']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Male', 'Private', '4', '4']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Male', 'Disabled', '2', '2']);

      // Non-Medical Stream
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'Open', '108', '108']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'Private', '18', '18']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'WHH', '36', '36']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'Disabled', '18', '18']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Male', 'Open', '102', '102']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Male', 'Private', '12', '12']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Male', 'Disabled', '6', '6']);

      // Commerce Stream
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'Open', '36', '36']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'Private', '6', '6']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'WHH', '12', '12']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'Disabled', '6', '6']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Male', 'Open', '34', '34']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Male', 'Private', '4', '4']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Male', 'Disabled', '2', '2']);
    });

    // Group 2: Districts with 500 seats per school (different distribution)
    // Ferozepur, Gurdaspur, Sangrur
    const group2Districts = ['Ferozepur', 'Gurdaspur', 'Sangrur'];

    group2Districts.forEach((district) => {
      const udiseCode = districtUdiseCodes[district];
      const schoolName = `Government Senior Secondary School, ${district}`;

      // Medical Stream
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'Open', '40', '40']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'Private', '7', '7']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'WHH', '14', '14']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Female', 'Disabled', '7', '7']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Male', 'Open', '27', '27']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Male', 'Private', '3', '3']);
      rows.push([udiseCode, schoolName, district, 'Medical', 'Male', 'Disabled', '2', '2']);

      // Non-Medical Stream
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'Open', '113', '113']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'Private', '19', '19']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'WHH', '38', '38']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Female', 'Disabled', '19', '19']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Male', 'Open', '94', '94']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Male', 'Private', '11', '11']);
      rows.push([udiseCode, schoolName, district, 'NonMedical', 'Male', 'Disabled', '6', '6']);

      // Commerce Stream
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'Open', '40', '40']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'Private', '7', '7']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'WHH', '14', '14']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Female', 'Disabled', '7', '7']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Male', 'Open', '27', '27']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Male', 'Private', '3', '3']);
      rows.push([udiseCode, schoolName, district, 'Commerce', 'Male', 'Disabled', '2', '2']);
    });

    // Group 3: Talwara (Girls Only, Class 11 - 100 seats)
    const talwaraDistrict = 'Talwara';
    const talwaraUdiseCode = districtUdiseCodes[talwaraDistrict];
    const talwaraSchoolName = `Government Senior Secondary School, ${talwaraDistrict}`;

    // Class 11 - Medical
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Medical', 'Female', 'Open', '20', '20']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Medical', 'Female', 'Private', '4', '4']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Medical', 'Female', 'WHH', '7', '7']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Medical', 'Female', 'Disabled', '4', '4']);

    // Class 11 - Non-Medical
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'NonMedical', 'Female', 'Open', '20', '20']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'NonMedical', 'Female', 'Private', '4', '4']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'NonMedical', 'Female', 'WHH', '7', '7']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'NonMedical', 'Female', 'Disabled', '4', '4']);

    // Class 11 - Commerce
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Commerce', 'Female', 'Open', '18', '18']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Commerce', 'Female', 'Private', '3', '3']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Commerce', 'Female', 'WHH', '6', '6']);
    rows.push([talwaraUdiseCode, talwaraSchoolName, talwaraDistrict, 'Commerce', 'Female', 'Disabled', '3', '3']);

    // Note: Class 9 seats (50 total) are not included as they are for a different class level
    // The system currently handles Class 11 only

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  generateEntranceResultsTestData(): string {
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

    const rows: string[][] = [];

    // Calculate total seats to determine student count (3-4x seats)
    // Group 1: 6 districts × 500 = 3000 seats
    // Group 2: 3 districts × 500 = 1500 seats
    // Talwara: 100 seats
    // Total: 4600 seats
    // Target: ~3.5x = ~16,100 students

    // Seat distribution by stream, gender, and category (per district)
    // Group 1 (Amritsar, Bathinda, Jalandhar, Ludhiana, SAS Nagar, Patiala)
    const group1Seats = {
      Medical: { Female: { Open: 36, Private: 6, WHH: 12, Disabled: 6 }, Male: { Open: 34, Private: 4, Disabled: 2 } },
      NonMedical: { Female: { Open: 108, Private: 18, WHH: 36, Disabled: 18 }, Male: { Open: 102, Private: 12, Disabled: 6 } },
      Commerce: { Female: { Open: 36, Private: 6, WHH: 12, Disabled: 6 }, Male: { Open: 34, Private: 4, Disabled: 2 } }
    };

    // Group 2 (Ferozepur, Gurdaspur, Sangrur)
    const group2Seats = {
      Medical: { Female: { Open: 40, Private: 7, WHH: 14, Disabled: 7 }, Male: { Open: 27, Private: 3, Disabled: 2 } },
      NonMedical: { Female: { Open: 113, Private: 19, WHH: 38, Disabled: 19 }, Male: { Open: 94, Private: 11, Disabled: 6 } },
      Commerce: { Female: { Open: 40, Private: 7, WHH: 14, Disabled: 7 }, Male: { Open: 27, Private: 3, Disabled: 2 } }
    };

    // Talwara (Girls only)
    const talwaraSeats = {
      Medical: { Female: { Open: 20, Private: 4, WHH: 7, Disabled: 4 } },
      NonMedical: { Female: { Open: 20, Private: 4, WHH: 7, Disabled: 4 } },
      Commerce: { Female: { Open: 18, Private: 3, WHH: 6, Disabled: 3 } }
    };

    let meritNo = 1;
    const firstNames = ['Aman', 'Priya', 'Rahul', 'Kavita', 'Sandeep', 'Neha', 'Vikram', 'Anjali', 'Rohit', 'Pooja', 'Arjun', 'Simran', 'Karan', 'Deepika', 'Manish', 'Radha', 'Ajay', 'Meera', 'Nikhil', 'Shreya'];
    const lastNames = ['Singh', 'Kaur', 'Sharma', 'Kumar', 'Verma', 'Gupta', 'Malhotra', 'Chopra', 'Bedi', 'Sood', 'Gill', 'Dhillon', 'Brar', 'Sidhu', 'Randhawa'];

    // Helper function to generate students for a seat configuration
    const generateStudents = (seats: any, stream: string, gender: string, multiplier: number = 3.5) => {
      const categories = gender === 'Female'
        ? ['Open', 'Private', 'WHH', 'Disabled']
        : ['Open', 'Private', 'Disabled'];

      categories.forEach(category => {
        const seatCount = seats[gender]?.[category] || 0;
        if (seatCount > 0) {
          const studentCount = Math.ceil(seatCount * multiplier);

          for (let i = 0; i < studentCount; i++) {
            const firstName = firstNames[(meritNo - 1) % firstNames.length];
            const lastName = lastNames[Math.floor((meritNo - 1) / firstNames.length) % lastNames.length];
            const studentName = `${firstName} ${lastName} ${meritNo}`;

            // Generate marks: Higher merit = higher marks (0-500 range)
            // Distribute marks so top students have higher marks
            // Merit 1 gets ~500, lower merit gets lower marks
            const marks = 500 - Math.floor((meritNo - 1) / 50) - (i % 30);

            const appNo = `APP2024${String(meritNo).padStart(5, '0')}`;
            const rollNo = `ROLL${String(meritNo).padStart(5, '0')}`;

            rows.push([
              String(meritNo),
              appNo,
              rollNo,
              studentName,
              String(Math.min(500, Math.max(0, marks))),
              gender,
              category,
              stream
            ]);

            meritNo++;
          }
        }
      });
    };

    // Generate students for Group 1 (6 districts × multiplier)
    const group1Multiplier = 3.5;
    ['Medical', 'NonMedical', 'Commerce'].forEach(stream => {
      generateStudents(group1Seats[stream as keyof typeof group1Seats], stream, 'Female', group1Multiplier * 6);
      generateStudents(group1Seats[stream as keyof typeof group1Seats], stream, 'Male', group1Multiplier * 6);
    });

    // Generate students for Group 2 (3 districts × multiplier)
    const group2Multiplier = 3.5;
    ['Medical', 'NonMedical', 'Commerce'].forEach(stream => {
      generateStudents(group2Seats[stream as keyof typeof group2Seats], stream, 'Female', group2Multiplier * 3);
      generateStudents(group2Seats[stream as keyof typeof group2Seats], stream, 'Male', group2Multiplier * 3);
    });

    // Generate students for Talwara (Girls only)
    const talwaraMultiplier = 3.5;
    ['Medical', 'NonMedical', 'Commerce'].forEach(stream => {
      generateStudents(talwaraSeats[stream as keyof typeof talwaraSeats], stream, 'Female', talwaraMultiplier);
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  generateStudentChoicesTestData(): string {
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

    const rows: string[][] = [];
    const districts = [
      'Amritsar', 'Barnala', 'Bathinda', 'Faridkot', 'Fatehgarh Sahib',
      'Fazilka', 'Ferozepur', 'Gurdaspur', 'Hoshiarpur', 'Jalandhar',
      'Kapurthala', 'Ludhiana', 'Mansa', 'Moga', 'Muktsar',
      'Nawanshahr', 'Pathankot', 'Patiala', 'Rupnagar', 'SAS Nagar',
      'Sangrur', 'Tarn Taran', 'Talwara'
    ];

    // First, generate entrance results data to get the student list
    // This matches the logic from generateEntranceResultsTestData
    const entranceResultsStudents: Array<{
      meritNo: number;
      appNo: string;
      rollNo: string;
      studentName: string;
      marks: number;
      gender: string;
      category: string;
      stream: string;
    }> = [];

    // Seat distribution by stream, gender, and category (per district)
    const group1Seats = {
      Medical: { Female: { Open: 36, Private: 6, WHH: 12, Disabled: 6 }, Male: { Open: 34, Private: 4, Disabled: 2 } },
      NonMedical: { Female: { Open: 108, Private: 18, WHH: 36, Disabled: 18 }, Male: { Open: 102, Private: 12, Disabled: 6 } },
      Commerce: { Female: { Open: 36, Private: 6, WHH: 12, Disabled: 6 }, Male: { Open: 34, Private: 4, Disabled: 2 } }
    };

    const group2Seats = {
      Medical: { Female: { Open: 40, Private: 7, WHH: 14, Disabled: 7 }, Male: { Open: 27, Private: 3, Disabled: 2 } },
      NonMedical: { Female: { Open: 113, Private: 19, WHH: 38, Disabled: 19 }, Male: { Open: 94, Private: 11, Disabled: 6 } },
      Commerce: { Female: { Open: 40, Private: 7, WHH: 14, Disabled: 7 }, Male: { Open: 27, Private: 3, Disabled: 2 } }
    };

    const talwaraSeats = {
      Medical: { Female: { Open: 20, Private: 4, WHH: 7, Disabled: 4 } },
      NonMedical: { Female: { Open: 20, Private: 4, WHH: 7, Disabled: 4 } },
      Commerce: { Female: { Open: 18, Private: 3, WHH: 6, Disabled: 3 } }
    };

    let meritNo = 1;
    const firstNames = ['Aman', 'Priya', 'Rahul', 'Kavita', 'Sandeep', 'Neha', 'Vikram', 'Anjali', 'Rohit', 'Pooja', 'Arjun', 'Simran', 'Karan', 'Deepika', 'Manish', 'Radha', 'Ajay', 'Meera', 'Nikhil', 'Shreya'];
    const lastNames = ['Singh', 'Kaur', 'Sharma', 'Kumar', 'Verma', 'Gupta', 'Malhotra', 'Chopra', 'Bedi', 'Sood', 'Gill', 'Dhillon', 'Brar', 'Sidhu', 'Randhawa'];

    // Helper function to generate students for a seat configuration
    const generateEntranceStudents = (seats: any, stream: string, gender: string, multiplier: number = 3.5) => {
      const categories = gender === 'Female'
        ? ['Open', 'Private', 'WHH', 'Disabled']
        : ['Open', 'Private', 'Disabled'];

      categories.forEach(category => {
        const seatCount = seats[gender]?.[category] || 0;
        if (seatCount > 0) {
          const studentCount = Math.ceil(seatCount * multiplier);

          for (let i = 0; i < studentCount; i++) {
            const firstName = firstNames[(meritNo - 1) % firstNames.length];
            const lastName = lastNames[Math.floor((meritNo - 1) / firstNames.length) % lastNames.length];
            const studentName = `${firstName} ${lastName} ${meritNo}`;

            const marks = 500 - Math.floor((meritNo - 1) / 50) - (i % 30);
            const appNo = `APP2024${String(meritNo).padStart(5, '0')}`;
            const rollNo = `ROLL${String(meritNo).padStart(5, '0')}`;

            entranceResultsStudents.push({
              meritNo,
              appNo,
              rollNo,
              studentName,
              marks: Math.min(500, Math.max(0, marks)),
              gender,
              category,
              stream
            });

            meritNo++;
          }
        }
      });
    };

    // Generate students for Group 1 (6 districts × multiplier)
    const group1Multiplier = 3.5;
    ['Medical', 'NonMedical', 'Commerce'].forEach(stream => {
      generateEntranceStudents(group1Seats[stream as keyof typeof group1Seats], stream, 'Female', group1Multiplier * 6);
      generateEntranceStudents(group1Seats[stream as keyof typeof group1Seats], stream, 'Male', group1Multiplier * 6);
    });

    // Generate students for Group 2 (3 districts × multiplier)
    const group2Multiplier = 3.5;
    ['Medical', 'NonMedical', 'Commerce'].forEach(stream => {
      generateEntranceStudents(group2Seats[stream as keyof typeof group2Seats], stream, 'Female', group2Multiplier * 3);
      generateEntranceStudents(group2Seats[stream as keyof typeof group2Seats], stream, 'Male', group2Multiplier * 3);
    });

    // Generate students for Talwara (Girls only)
    const talwaraMultiplier = 3.5;
    ['Medical', 'NonMedical', 'Commerce'].forEach(stream => {
      generateEntranceStudents(talwaraSeats[stream as keyof typeof talwaraSeats], stream, 'Female', talwaraMultiplier);
    });

    // Calculate how many students to use from entrance results (at least 70%)
    const totalEntranceStudents = entranceResultsStudents.length;
    const minStudentsFromEntrance = Math.ceil(totalEntranceStudents * 0.7);
    const studentsToUse = Math.min(minStudentsFromEntrance, totalEntranceStudents);

    // Use at least 70% of entrance results students
    const selectedEntranceStudents = entranceResultsStudents.slice(0, studentsToUse);

    // Generate choices for students from entrance results
    selectedEntranceStudents.forEach(student => {
      const choices: string[] = [];
      // Shuffle districts for variety
      const shuffledDistricts = [...districts].sort(() => Math.random() - 0.5);

      // Fill all 10 choices with different districts
      for (let j = 0; j < 10; j++) {
        choices.push(shuffledDistricts[j % shuffledDistricts.length]);
      }

      rows.push([
        student.appNo,
        String(student.meritNo),
        student.studentName,
        student.gender,
        student.category,
        student.stream,
        ...choices
      ]);
    });

    // Generate remaining students (up to 30%) if needed
    const remainingCount = totalEntranceStudents - studentsToUse;
    if (remainingCount > 0) {
      const streams = ['Medical', 'Commerce', 'NonMedical'];
      const genders = ['Male', 'Female'];
      const maleCategories = ['Open', 'Disabled', 'Private'];
      const femaleCategories = ['Open', 'WHH', 'Disabled', 'Private'];

      for (let i = 0; i < remainingCount; i++) {
        const stream = streams[i % streams.length];
        const gender = genders[i % genders.length];
        const categories = gender === 'Female' ? femaleCategories : maleCategories;
        const category = categories[i % categories.length];

        const firstName = firstNames[(meritNo - 1) % firstNames.length];
        const lastName = lastNames[Math.floor((meritNo - 1) / firstNames.length) % lastNames.length];
        const studentName = `${firstName} ${lastName} ${meritNo}`;

        const appNo = `APP2024${String(meritNo).padStart(5, '0')}`;

        const choices: string[] = [];
        const shuffledDistricts = [...districts].sort(() => Math.random() - 0.5);

        for (let j = 0; j < 10; j++) {
          choices.push(shuffledDistricts[j % shuffledDistricts.length]);
        }

        rows.push([
          appNo,
          String(meritNo),
          studentName,
          gender,
          category,
          stream,
          ...choices
        ]);

        meritNo++;
      }
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => cell ? `"${cell}"` : '').join(','))
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
      choice1: (row.choice1 || row.Choice1 || row['Choice 1'] || '').toString().trim() || null,
      choice2: (row.choice2 || row.Choice2 || row['Choice 2'] || '').toString().trim() || null,
      choice3: (row.choice3 || row.Choice3 || row['Choice 3'] || '').toString().trim() || null,
      choice4: (row.choice4 || row.Choice4 || row['Choice 4'] || '').toString().trim() || null,
      choice5: (row.choice5 || row.Choice5 || row['Choice 5'] || '').toString().trim() || null,
      choice6: (row.choice6 || row.Choice6 || row['Choice 6'] || '').toString().trim() || null,
      choice7: (row.choice7 || row.Choice7 || row['Choice 7'] || '').toString().trim() || null,
      choice8: (row.choice8 || row.Choice8 || row['Choice 8'] || '').toString().trim() || null,
      choice9: (row.choice9 || row.Choice9 || row['Choice 9'] || '').toString().trim() || null,
      choice10: (row.choice10 || row.Choice10 || row['Choice 10'] || '').toString().trim() || null,
      allocationStatus: 'pending',
    }));
  }

  private async parseVacancyFile(file: Express.Multer.File, academicYear: string, existingSchoolsByName?: Map<string, School>): Promise<{ vacancies: InsertVacancy[], schools: InsertSchool[] }> {
    const workbook = XLSX.readFile(file.path, { cellText: false, cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Use raw: false to get formatted values (preserves text formatting)
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

    // Track unique schools by UDISE code (primary key)
    const schoolsMap = new Map<string, InsertSchool>();
    // Track school name + district to UDISE code mapping to detect conflicts
    // This ensures one school name in one district maps to one UDISE code
    const schoolNameDistrictToUdiseMap = new Map<string, string>();
    const vacancies: InsertVacancy[] = [];

    data.forEach((row: any) => {
      // Note: academicYear and roundName are NOT read from the file - they come from form selection
      // Ignore these columns if present in the file
      // Handle UDISE code - preserve leading zeros by treating as string
      let rawUdiseCode = row['UDISE Code'] || row.udiseCode || row.UDISECode || row['UDISE_Code'] || '';
      const schoolName = String(row['School Name'] || row.schoolName || row.SchoolName || row['School_Name'] || '').trim();
      const district = String(row.District || row.district || '').trim();

      // Normalize UDISE code: pad to 11 digits if it's numeric
      let udiseCode: string | null = null;
      if (rawUdiseCode) {
        if (typeof rawUdiseCode === 'number' || /^\d+$/.test(String(rawUdiseCode).trim())) {
          udiseCode = String(rawUdiseCode).trim().padStart(11, '0');
        } else {
          udiseCode = String(rawUdiseCode).trim() || null;
        }
      }

      // Create school entry if UDISE code provided
      // Ensure school is created even if schoolName is missing (use a default)
      if (udiseCode && district) {
        const finalSchoolName = schoolName || `School ${udiseCode}`;

        // Check if this school name already exists in the database (school_name is unique)
        if (existingSchoolsByName && existingSchoolsByName.has(finalSchoolName)) {
          const existingSchool = existingSchoolsByName.get(finalSchoolName)!;
          // School name exists - use its UDISE code
          if (existingSchool.udiseCode !== udiseCode) {
            console.warn(`School "${finalSchoolName}" already exists with UDISE code ${existingSchool.udiseCode}, using existing UDISE code instead of ${udiseCode}`);
            udiseCode = existingSchool.udiseCode;
          }
        } else {
          // Check if this school name already exists in the current batch
          const schoolKey = `${finalSchoolName}|${district}`;
          if (schoolNameDistrictToUdiseMap.has(schoolKey)) {
            const existingUdiseCode = schoolNameDistrictToUdiseMap.get(schoolKey)!;
            if (existingUdiseCode !== udiseCode) {
              // Same school name in same district, different UDISE code - use the first one encountered
              console.warn(`School "${finalSchoolName}" in district "${district}" already has UDISE code ${existingUdiseCode}, ignoring new UDISE code ${udiseCode}`);
              udiseCode = existingUdiseCode; // Use the existing UDISE code
            }
          } else {
            // New school name + district combination - add to mapping
            schoolNameDistrictToUdiseMap.set(schoolKey, udiseCode);
          }
        }

        // Create/update school entry (UDISE code is primary key, school_name is unique)
        if (!schoolsMap.has(udiseCode)) {
          schoolsMap.set(udiseCode, {
            udiseCode,
            schoolName: finalSchoolName,
            district,
          });
        } else {
          // Update existing school if name or district changed (though UDISE should be unique)
          const existing = schoolsMap.get(udiseCode)!;
          if (existing.schoolName !== finalSchoolName || existing.district !== district) {
            schoolsMap.set(udiseCode, {
              udiseCode,
              schoolName: finalSchoolName, // Use the most recent school name
              district,
            });
          }
        }
      }

      // Create vacancy entry - academicYear comes from form, not file
      // Only read file columns: UDISE Code, School Name, District, Stream, Gender, Category, Total Seats, Available Seats
      const totalSeats = parseInt(row['Total Seats'] || row.totalSeats || row.total_seats || row.TotalSeats) || 0;

      vacancies.push({
        academicYear: academicYear, // Set from form selection, not from file
        udiseCode: udiseCode, // Already normalized to 11 digits with leading zeros
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

      // Validate all 10 choices are required and valid districts
      for (let i = 1; i <= 10; i++) {
        const choice = (student as any)[`choice${i}`];
        if (!choice || String(choice).trim() === '') {
          errors.push(`Row ${row}: Choice ${i} is required. All 10 choices must be filled.`);
        } else if (!DISTRICTS.includes(choice)) {
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

      // UDISE code validation (optional - validate format if provided)
      if (vacancy.udiseCode && String(vacancy.udiseCode).trim() !== '') {
        // Validate UDISE code format (typically 11 digits) if provided
        // Handle both string and number formats, pad if needed
        let udiseCodeStr: string;
        if (typeof vacancy.udiseCode === 'number') {
          // If it's a number, convert to string and pad to 11 digits
          udiseCodeStr = String(vacancy.udiseCode).padStart(11, '0');
        } else {
          udiseCodeStr = String(vacancy.udiseCode).trim();
          // If it's a numeric string with less than 11 digits, pad with leading zeros
          if (/^\d+$/.test(udiseCodeStr) && udiseCodeStr.length < 11) {
            udiseCodeStr = udiseCodeStr.padStart(11, '0');
          }
        }
        // Update the vacancy object with padded value
        vacancy.udiseCode = udiseCodeStr;
        // Validate it's exactly 11 digits
        if (!/^\d{11}$/.test(udiseCodeStr)) {
          errors.push(`Row ${row}: Invalid UDISE Code format. Must be 11 digits (with leading zeros if needed). Found: ${String(vacancy.udiseCode)}`);
        }
      }

      if (!vacancy.district || !DISTRICTS.includes(vacancy.district as any)) {
        errors.push(`Row ${row}: Invalid district. Must be one of: ${DISTRICTS.join(', ')}`);
      }

      if (!vacancy.stream || !STREAMS.includes(vacancy.stream as any)) {
        errors.push(`Row ${row}: Invalid stream. Must be one of: ${STREAMS.join(', ')}`);
      }

      if (!vacancy.gender || !['Male', 'Female'].includes(vacancy.gender)) {
        const genderValue = vacancy.gender ? `"${vacancy.gender}"` : '(empty)';
        errors.push(`Row ${row}: Invalid gender ${genderValue}. Must be one of: Male, Female (Note: "Other" is not allowed for vacancies)`);
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
