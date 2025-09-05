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
    // Get all entrance results (contains students with merit order) and students with preferences
    const entranceResults = await this.storage.getStudentsEntranceResults(10000, 0);
    const students = await this.storage.getStudents(10000, 0);
    const vacancies = await this.storage.getVacancies();

    // Create vacancy map for district->stream->gender->category tracking
    // Key format: "district|stream|gender|category"
    const vacancyMap = new Map<string, number>();

    // Initialize vacancy map with current vacancies
    vacancies.forEach(vacancy => {
      const key = `${vacancy.district}|${vacancy.stream}|${vacancy.gender}|${vacancy.category}`;
      vacancyMap.set(key, vacancy.availableSeats || 0);
    });

    // Create student preference map
    const studentPreferencesMap = new Map<string, Student>();
    students.forEach(student => {
      if (student.appNo) {
        studentPreferencesMap.set(student.appNo, student);
      }
    });

    // Group entrance results by gender, category, and stream, then sort by merit (marks descending)
    const studentGroups = this.groupAndSortStudents(entranceResults);

    const allocationsByDistrict: Record<string, number> = {};
    let allottedCount = 0;
    let notAllottedCount = 0;

    // Process each group in merit order within gender-category
    for (const group of studentGroups) {
      for (const entranceResult of group.students) {
        const studentPreferences = studentPreferencesMap.get(entranceResult.applicationNo);
        if (!studentPreferences) {
          // No preferences set, mark as not allotted
          notAllottedCount++;
          continue;
        }

        let allocated = false;

        // Check each choice from 1 to 10
        for (let i = 1; i <= 10; i++) {
          const choice = (studentPreferences as any)[`choice${i}`];
          if (!choice) continue;

          // Create vacancy key for this specific combination
          const vacancyKey = `${choice}|${entranceResult.stream}|${entranceResult.gender}|${entranceResult.category}`;
          const availableSeats = vacancyMap.get(vacancyKey);
          
          if (availableSeats && availableSeats > 0) {
            // Allocate the seat
            await this.storage.updateStudent(studentPreferences.id, {
              allottedDistrict: choice,
              allottedStream: entranceResult.stream,
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
          await this.storage.updateStudent(studentPreferences.id, {
            allocationStatus: 'not_allotted',
          });
          notAllottedCount++;
        }
      }
    }

    return {
      totalStudents: entranceResults.length,
      allottedStudents: allottedCount,
      notAllottedStudents: notAllottedCount,
      allocationsByDistrict,
    };
  }

  private groupAndSortStudents(entranceResults: StudentsEntranceResult[]) {
    // Group by gender, category, and stream
    const groups = new Map<string, StudentsEntranceResult[]>();
    
    entranceResults.forEach(result => {
      const key = `${result.gender}-${result.category}-${result.stream}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(result);
    });

    // Sort each group by marks (descending - higher marks = better merit)
    const sortedGroups = Array.from(groups.entries()).map(([key, students]) => {
      const [gender, category, stream] = key.split('-');
      return {
        gender,
        category,
        stream,
        students: students.sort((a, b) => b.marks - a.marks)
      };
    });

    return sortedGroups;
  }

}