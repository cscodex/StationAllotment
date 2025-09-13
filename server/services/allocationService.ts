import { IStorage } from '../storage';
import { Student, Vacancy, StudentsEntranceResult } from '@shared/schema';

export class AllocationService {
  constructor(private storage: IStorage) {}

  async runAllocation(): Promise<{
    totalStudents: number;
    allottedStudents: number;
    notAllottedStudents: number;
    allocationsByDistrict: Record<string, number>;
  }> {
    // Get all students with preferences and their entrance results
    const students = await this.storage.getStudents(10000, 0);
    const entranceResults = await this.storage.getStudentsEntranceResults(10000, 0);
    const vacancies = await this.storage.getVacancies();

    // Create vacancy map for district->stream->gender->category tracking
    // Key format: "district|stream|gender|category"
    const vacancyMap = new Map<string, number>();

    // Initialize vacancy map with current vacancies
    vacancies.forEach(vacancy => {
      const key = `${vacancy.district}|${vacancy.stream}|${vacancy.gender}|${vacancy.category}`;
      vacancyMap.set(key, vacancy.availableSeats || 0);
    });

    // Create entrance result map for easy lookup by application number
    const entranceResultMap = new Map<string, StudentsEntranceResult>();
    entranceResults.forEach(result => {
      if (result.applicationNo) {
        entranceResultMap.set(result.applicationNo, result);
      }
    });

    // Filter students who have preferences and valid entrance results, then sort by merit number (ascending = better rank)
    const eligibleStudents = students
      .filter(student => {
        // Must have app number and at least one choice
        if (!student.appNo || !student.choice1) return false;
        
        // Must have corresponding entrance result
        const entranceResult = entranceResultMap.get(student.appNo);
        return !!entranceResult;
      })
      .sort((a, b) => a.meritNumber - b.meritNumber); // Lower merit number = better rank

    const allocationsByDistrict: Record<string, number> = {};
    let allottedCount = 0;
    let notAllottedCount = 0;

    // Process students in merit order (best to worst)
    for (const student of eligibleStudents) {
      const entranceResult = entranceResultMap.get(student.appNo);
      if (!entranceResult) continue;

      let allocated = false;

      // Check each choice from 1 to 10
      for (let i = 1; i <= 10; i++) {
        const choice = (student as any)[`choice${i}`];
        if (!choice) continue;

        // Create vacancy key using STUDENT'S stream preference (not entrance stream)
        // This ensures we match against the correct stream the student wants
        const vacancyKey = `${choice}|${student.stream}|${entranceResult.gender}|${entranceResult.category}`;
        const availableSeats = vacancyMap.get(vacancyKey);
        
        if (availableSeats && availableSeats > 0) {
          // Allocate the seat
          await this.storage.updateStudent(student.id, {
            allottedDistrict: choice,
            allottedStream: student.stream, // Use student's preferred stream
            allocationStatus: 'allotted',
          });

          // Reduce vacancy count
          vacancyMap.set(vacancyKey, availableSeats - 1);
          
          // Update statistics
          allottedCount++;
          allocationsByDistrict[choice] = (allocationsByDistrict[choice] || 0) + 1;
          allocated = true;
          break;
        }
      }

      if (!allocated) {
        // Mark as not allotted
        await this.storage.updateStudent(student.id, {
          allocationStatus: 'not_allotted',
        });
        notAllottedCount++;
      }
    }

    return {
      totalStudents: eligibleStudents.length,
      allottedStudents: allottedCount,
      notAllottedStudents: notAllottedCount,
      allocationsByDistrict,
    };
  }


}