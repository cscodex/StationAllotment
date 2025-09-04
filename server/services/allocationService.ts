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

    // Create vacancy map for gender-category specific tracking
    const vacancyMap = new Map<string, {
      medicalMaleOpen: number;
      medicalFemaleOpen: number;
      medicalMaleWHH: number;
      medicalFemaleWHH: number;
      medicalMaleDisabled: number;
      medicalFemaleDisabled: number;
      medicalMalePrivate: number;
      medicalFemalePrivate: number;
      commerceMaleOpen: number;
      commerceFemaleOpen: number;
      commerceMaleWHH: number;
      commerceFemaleWHH: number;
      commerceMaleDisabled: number;
      commerceFemaleDisabled: number;
      commerceMalePrivate: number;
      commerceFemalePrivate: number;
      nonMedicalMaleOpen: number;
      nonMedicalFemaleOpen: number;
      nonMedicalMaleWHH: number;
      nonMedicalFemaleWHH: number;
      nonMedicalMaleDisabled: number;
      nonMedicalFemaleDisabled: number;
      nonMedicalMalePrivate: number;
      nonMedicalFemalePrivate: number;
    }>();

    // Initialize vacancy map with current vacancies
    vacancies.forEach(vacancy => {
      vacancyMap.set(vacancy.district, {
        medicalMaleOpen: vacancy.medicalMaleOpen || 0,
        medicalFemaleOpen: vacancy.medicalFemaleOpen || 0,
        medicalMaleWHH: vacancy.medicalMaleWHH || 0,
        medicalFemaleWHH: vacancy.medicalFemaleWHH || 0,
        medicalMaleDisabled: vacancy.medicalMaleDisabled || 0,
        medicalFemaleDisabled: vacancy.medicalFemaleDisabled || 0,
        medicalMalePrivate: vacancy.medicalMalePrivate || 0,
        medicalFemalePrivate: vacancy.medicalFemalePrivate || 0,
        commerceMaleOpen: vacancy.commerceMaleOpen || 0,
        commerceFemaleOpen: vacancy.commerceFemaleOpen || 0,
        commerceMaleWHH: vacancy.commerceMaleWHH || 0,
        commerceFemaleWHH: vacancy.commerceFemaleWHH || 0,
        commerceMaleDisabled: vacancy.commerceMaleDisabled || 0,
        commerceFemaleDisabled: vacancy.commerceFemaleDisabled || 0,
        commerceMalePrivate: vacancy.commerceMalePrivate || 0,
        commerceFemalePrivate: vacancy.commerceFemalePrivate || 0,
        nonMedicalMaleOpen: vacancy.nonMedicalMaleOpen || 0,
        nonMedicalFemaleOpen: vacancy.nonMedicalFemaleOpen || 0,
        nonMedicalMaleWHH: vacancy.nonMedicalMaleWHH || 0,
        nonMedicalFemaleWHH: vacancy.nonMedicalFemaleWHH || 0,
        nonMedicalMaleDisabled: vacancy.nonMedicalMaleDisabled || 0,
        nonMedicalFemaleDisabled: vacancy.nonMedicalFemaleDisabled || 0,
        nonMedicalMalePrivate: vacancy.nonMedicalMalePrivate || 0,
        nonMedicalFemalePrivate: vacancy.nonMedicalFemalePrivate || 0,
      });
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

          const districtVacancies = vacancyMap.get(choice);
          if (!districtVacancies) continue;

          // Get the specific vacancy key for this student's gender, category, and stream
          const vacancyKey = this.getVacancyKey(entranceResult.stream, entranceResult.gender, entranceResult.category);
          
          if (districtVacancies[vacancyKey] > 0) {
            // Allocate the seat
            await this.storage.updateStudent(studentPreferences.id, {
              allottedDistrict: choice,
              allottedStream: entranceResult.stream,
              allocationStatus: 'allotted',
            });

            // Reduce vacancy count
            districtVacancies[vacancyKey]--;
            
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

  private getVacancyKey(stream: string, gender: string, category: string): string {
    const streamPrefix = stream.toLowerCase();
    const genderSuffix = gender === 'Male' ? 'Male' : 'Female';
    const categorySuffix = category === 'Open' ? 'Open' : 
                          category === 'WHH' ? 'WHH' :
                          category === 'Disabled' ? 'Disabled' : 'Private';
    
    return `${streamPrefix}${genderSuffix}${categorySuffix}`;
  }

  private getStreamKey(stream: string): 'medical' | 'commerce' | 'nonMedical' {
    switch (stream) {
      case 'Medical':
        return 'medical';
      case 'Commerce':
        return 'commerce';
      case 'NonMedical':
        return 'nonMedical';
      default:
        throw new Error(`Invalid stream: ${stream}`);
    }
  }
}