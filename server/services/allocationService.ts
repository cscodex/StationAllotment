import { IStorage } from '../storage';
import { Student, Vacancy } from '@shared/schema';

export class AllocationService {
  constructor(private storage: IStorage) {}

  async runAllocation(): Promise<{
    totalStudents: number;
    allottedStudents: number;
    notAllottedStudents: number;
    allocationsByDistrict: Record<string, number>;
  }> {
    // Get all students sorted by merit number (ascending = higher merit first)
    const students = await this.storage.getStudents(10000, 0); // Get all students
    const vacancies = await this.storage.getVacancies();

    // Create vacancy map for easy lookup and tracking
    const vacancyMap = new Map<string, {
      medical: number;
      commerce: number;
      nonMedical: number;
    }>();

    vacancies.forEach(vacancy => {
      vacancyMap.set(vacancy.district, {
        medical: vacancy.medicalVacancies!,
        commerce: vacancy.commerceVacancies!,
        nonMedical: vacancy.nonMedicalVacancies!,
      });
    });

    const allocationsByDistrict: Record<string, number> = {};
    let allottedCount = 0;
    let notAllottedCount = 0;

    // Process each student in merit order
    for (const student of students) {
      let allocated = false;

      // Check each choice from 1 to 10
      for (let i = 1; i <= 10; i++) {
        const choice = (student as any)[`choice${i}`];
        if (!choice) continue;

        const districtVacancies = vacancyMap.get(choice);
        if (!districtVacancies) continue;

        // Check if vacancy exists for the student's stream
        const streamKey = this.getStreamKey(student.stream);
        if (districtVacancies[streamKey] > 0) {
          // Allocate the seat
          await this.storage.updateStudent(student.id, {
            allottedDistrict: choice,
            allottedStream: student.stream,
            allocationStatus: 'allotted',
          });

          // Reduce vacancy count
          districtVacancies[streamKey]--;
          
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
      totalStudents: students.length,
      allottedStudents: allottedCount,
      notAllottedStudents: notAllottedCount,
      allocationsByDistrict,
    };
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
