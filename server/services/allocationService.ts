import { IStorage } from '../storage';
import { Student, Vacancy, StudentsEntranceResult } from '@shared/schema';
import { AuditService } from './auditService';

export class AllocationService {
  constructor(
    private storage: IStorage,
    private auditService?: AuditService,
    private userId?: string
  ) {}

  async runAllocation(academicYear: string, roundNumber: number, counselingRoundId: string): Promise<{
    totalStudents: number;
    allottedStudents: number;
    notAllottedStudents: number;
    allocationsByDistrict: Record<string, number>;
    logs: string[];
  }> {
    const logs: string[] = [];
    const startTime = Date.now();
    
    const log = (message: string) => {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ${message}`;
      logs.push(logMessage);
      console.log(logMessage);
      
      // Also log to audit if available
      if (this.auditService && this.userId) {
        this.auditService.log(
          this.userId,
          'allocation_step',
          'allocation',
          'system',
          { message, step: logs.length, academicYear, roundNumber },
          undefined,
          undefined
        ).catch(err => console.error('Failed to log allocation step:', err));
      }
    };

    log(`🚀 Starting allocation process for ${academicYear} - Round ${roundNumber}...`);
    
    // Get students for this academic year, excluding already-allocated students
    log('📊 Fetching students data...');
    const allStudents = await this.storage.getStudents(10000, 0, academicYear);
    // Exclude students who are already allocated (they cannot participate in later rounds)
    const students = allStudents.filter(s => s.allocationStatus !== 'allotted');
    log(`   Found ${allStudents.length} total students for ${academicYear}`);
    log(`   Excluding ${allStudents.length - students.length} already-allocated students`);
    log(`   Processing ${students.length} eligible students`);
    
    // Get the counseling round to extract roundName (counseling title)
    const round = await this.storage.getCounselingRound(counselingRoundId);
    if (!round) {
      throw new Error(`Counseling round ${counselingRoundId} not found`);
    }
    const roundName = round.roundName;
    
    log(`📋 Fetching entrance results for counseling title: "${roundName}"...`);
    const entranceResults = await this.storage.getStudentsEntranceResults(10000, 0);
    // Filter entrance results by academic year and roundName (counseling title)
    const filteredEntranceResults = entranceResults.filter(er => 
      (!er.academicYear || er.academicYear === academicYear) &&
      (!er.roundName || er.roundName === roundName)
    );
    log(`   Found ${filteredEntranceResults.length} entrance results for ${academicYear} / "${roundName}"`);
    
    log(`📊 Fetching vacancies for counseling title: "${roundName}"...`);
    const vacancies = await this.storage.getVacancies(academicYear, roundName);
    log(`   Found ${vacancies.length} total vacancies for ${academicYear} / "${roundName}"`);

    // Create vacancy map for district->stream->gender->category tracking
    // Key format: "district|stream|gender|category" -> Array of vacancies (school-level)
    // This allows us to group by district but allocate to specific schools
    log('🗺️  Building vacancy map...');
    const vacancyMap = new Map<string, Vacancy[]>();
    let vacanciesWithUdise = 0;
    let totalAvailableSeats = 0;

    // Initialize vacancy map with current vacancies (grouped by district/stream/gender/category)
    vacancies.forEach(vacancy => {
      // Only process vacancies with UDISE code (school-level)
      if (!vacancy.udiseCode) return;
      
      vacanciesWithUdise++;
      totalAvailableSeats += vacancy.availableSeats || 0;
      
      const key = `${vacancy.district}|${vacancy.stream}|${vacancy.gender}|${vacancy.category}`;
      if (!vacancyMap.has(key)) {
        vacancyMap.set(key, []);
      }
      // Only include vacancies with available seats
      if (vacancy.availableSeats && vacancy.availableSeats > 0) {
        vacancyMap.get(key)!.push(vacancy);
      }
    });
    
    log(`   Processed ${vacanciesWithUdise} vacancies with UDISE codes`);
    log(`   Total available seats: ${totalAvailableSeats}`);
    log(`   Created ${vacancyMap.size} unique vacancy groups`);

    // Create entrance result map for easy lookup by application number
    log('🔍 Building entrance result lookup map...');
    const entranceResultMap = new Map<string, StudentsEntranceResult>();
    filteredEntranceResults.forEach(result => {
      if (result.applicationNo) {
        entranceResultMap.set(result.applicationNo, result);
      }
    });
    log(`   Mapped ${entranceResultMap.size} entrance results`);

    // Filter students who have preferences and valid entrance results, then sort by merit number (ascending = better rank)
    log('✅ Filtering eligible students...');
    const eligibleStudents = students
      .filter(student => {
        // Must have app number and at least one choice
        if (!student.appNo || !student.choice1) return false;
        
        // Must have corresponding entrance result
        const entranceResult = entranceResultMap.get(student.appNo);
        return !!entranceResult;
      })
      .sort((a, b) => a.meritNumber - b.meritNumber); // Lower merit number = better rank
    
    log(`   Found ${eligibleStudents.length} eligible students (with preferences and entrance results)`);
    if (eligibleStudents.length > 0) {
      log(`   Merit range: ${eligibleStudents[0].meritNumber} (best) to ${eligibleStudents[eligibleStudents.length - 1].meritNumber} (worst)`);
    }

    const allocationsByDistrict: Record<string, number> = {};
    let allottedCount = 0;
    let notAllottedCount = 0;
    let processedCount = 0;
    const logInterval = Math.max(1, Math.floor(eligibleStudents.length / 10)); // Log every 10%

    log('🎯 Starting allocation process (processing students in merit order)...');
    
    // Process students in merit order (best to worst)
    for (const student of eligibleStudents) {
      processedCount++;
      
      // Log progress every 10%
      if (processedCount % logInterval === 0 || processedCount === eligibleStudents.length) {
        const progress = Math.round((processedCount / eligibleStudents.length) * 100);
        log(`   Progress: ${processedCount}/${eligibleStudents.length} (${progress}%) - Allotted: ${allottedCount}, Not Allotted: ${notAllottedCount}`);
      }
      const entranceResult = entranceResultMap.get(student.appNo);
      if (!entranceResult) continue;

      let allocated = false;

      // Check each choice from 1 to 10
      for (let i = 1; i <= 10; i++) {
        const choice = (student as any)[`choice${i}`];
        if (!choice) continue;

        // STRICT MATCHING: Create vacancy key using exact gender and category combination
        // Student can ONLY be allocated if there's a seat available for their exact:
        // - District (choice), Stream (preference), Gender, and Category combination
        const vacancyKey = `${choice}|${student.stream}|${entranceResult.gender}|${entranceResult.category}`;
        const availableVacancies = vacancyMap.get(vacancyKey);
        
        // STRICT CONSTRAINT: Only allocate if exact gender/category/stream/district combination has seats
        // Find first available school vacancy in this district/stream/gender/category combination
        if (availableVacancies && availableVacancies.length > 0) {
          // Find first vacancy with available seats
          const selectedVacancy = availableVacancies.find(v => v.availableSeats && v.availableSeats > 0);
          
          if (selectedVacancy) {
            // Allocate the seat to this specific school
            await this.storage.updateStudent(student.id, {
              allottedDistrict: choice,
              allottedStream: student.stream,
              allottedSchoolUdise: selectedVacancy.udiseCode || null,
              counselingRoundId: counselingRoundId,
              counselingRoundNumber: roundNumber,
              allocationStatus: 'allotted',
            });

            // Update vacancy: decrement available seats
            await this.storage.updateVacancy(selectedVacancy.id, {
              availableSeats: (selectedVacancy.availableSeats || 0) - 1,
            });
            
            // Log allocation details (only for first few and last few for brevity)
            if (allottedCount <= 5 || allottedCount === eligibleStudents.length - notAllottedCount) {
              log(`   ✓ Allocated: ${student.name} (Merit: ${student.meritNumber}) → ${choice} (School: ${selectedVacancy.udiseCode})`);
            }

            // Remove from map if no seats left, or update the array
            if (selectedVacancy.availableSeats === 1) {
              // Remove this vacancy from the array
              const updated = availableVacancies.filter(v => v.id !== selectedVacancy.id);
              vacancyMap.set(vacancyKey, updated);
            } else {
              // Update the vacancy in the array
              selectedVacancy.availableSeats = (selectedVacancy.availableSeats || 0) - 1;
            }
            
            // Update statistics
            allottedCount++;
            allocationsByDistrict[choice] = (allocationsByDistrict[choice] || 0) + 1;
            allocated = true;
            break;
          }
        }
        // If no seats available for exact gender/category combination, continue to next choice
        // No cross-category or cross-gender allocation allowed
      }

      if (!allocated) {
        // Mark as not allotted
        await this.storage.updateStudent(student.id, {
          allocationStatus: 'not_allotted',
        });
        notAllottedCount++;
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    log('📊 Allocation Summary:');
    log(`   Total Eligible Students: ${eligibleStudents.length}`);
    log(`   Successfully Allotted: ${allottedCount} (${((allottedCount / eligibleStudents.length) * 100).toFixed(2)}%)`);
    log(`   Not Allotted: ${notAllottedCount} (${((notAllottedCount / eligibleStudents.length) * 100).toFixed(2)}%)`);
    log(`   Allocations by District: ${Object.keys(allocationsByDistrict).length} districts`);
    Object.entries(allocationsByDistrict).forEach(([district, count]) => {
      log(`     - ${district}: ${count} students`);
    });
    log(`⏱️  Total processing time: ${duration} seconds`);
    log('✅ Allocation process completed successfully!');

    // Final audit log
    if (this.auditService && this.userId) {
      await this.auditService.log(
        this.userId,
        'allocation_completed',
        'allocation',
        'system',
        {
          totalStudents: eligibleStudents.length,
          allottedStudents: allottedCount,
          notAllottedStudents: notAllottedCount,
          allocationsByDistrict,
          duration: `${duration}s`,
          logsCount: logs.length
        },
        undefined,
        undefined
      );
    }

    return {
      totalStudents: eligibleStudents.length,
      allottedStudents: allottedCount,
      notAllottedStudents: notAllottedCount,
      allocationsByDistrict,
      logs,
    };
  }

  /**
   * Reset allocation - clears all previous allocations and restores vacancies for a specific academic year
   */
  async resetAllocation(academicYear: string): Promise<{
    clearedStudents: number;
    restoredVacancies: number;
    logs: string[];
  }> {
    const logs: string[] = [];
    const startTime = Date.now();
    
    const log = (message: string) => {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ${message}`;
      logs.push(logMessage);
      console.log(logMessage);
      
      if (this.auditService && this.userId) {
        this.auditService.log(
          this.userId,
          'allocation_reset_step',
          'allocation',
          'system',
          { message, step: logs.length, academicYear },
          undefined,
          undefined
        ).catch(err => console.error('Failed to log reset step:', err));
      }
    };

    log(`🔄 Starting allocation reset process for ${academicYear}...`);

    try {
      // Step 1: Get all allocated students for this academic year
      log('📊 Fetching allocated students...');
      const allStudents = await this.storage.getStudents(10000, 0, academicYear);
      const allocatedStudents = allStudents.filter(s => s.allocationStatus === 'allotted');
      log(`   Found ${allocatedStudents.length} allocated students for ${academicYear}`);

      // Step 2: Get all vacancies to restore seats for this academic year
      log('📊 Fetching vacancies to restore...');
      const allVacancies = await this.storage.getVacancies(academicYear);
      log(`   Found ${allVacancies.length} vacancies for ${academicYear}`);

      // Step 3: Clear student allocations
      log('🧹 Clearing student allocations...');
      let clearedCount = 0;
      for (const student of allocatedStudents) {
        // Clear allocation
        await this.storage.updateStudent(student.id, {
          allottedDistrict: null,
          allottedStream: null,
          allottedSchoolUdise: null,
          allocationStatus: 'pending',
        });

        clearedCount++;
        if (clearedCount % 100 === 0) {
          log(`   Cleared ${clearedCount}/${allocatedStudents.length} students...`);
        }
      }
      log(`   ✅ Cleared ${clearedCount} student allocations`);

      // Step 4: Reset all students with 'not_allotted' status back to 'pending'
      log('🔄 Resetting not-allotted students...');
      const notAllottedStudents = allStudents.filter(s => s.allocationStatus === 'not_allotted');
      let resetCount = 0;
      for (const student of notAllottedStudents) {
        await this.storage.updateStudent(student.id, {
          allocationStatus: 'pending',
        });
        resetCount++;
      }
      log(`   ✅ Reset ${resetCount} not-allotted students to pending`);

      // Step 5: Restore vacancy seats (recalculate from total_seats)
      log('🔄 Restoring vacancy available seats...');
      let restoredCount = 0;
      for (const vacancy of allVacancies) {
        // Reset available seats to total seats
        if (vacancy.totalSeats !== vacancy.availableSeats) {
          await this.storage.updateVacancy(vacancy.id, {
            availableSeats: vacancy.totalSeats || 0,
          });
          restoredCount++;
        }
      }
      log(`   ✅ Restored ${restoredCount} vacancies to original seat counts`);

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      log('📊 Reset Summary:');
      log(`   Cleared Students: ${clearedCount}`);
      log(`   Reset Not-Allotted: ${resetCount}`);
      log(`   Restored Vacancies: ${restoredCount}`);
      log(`⏱️  Total reset time: ${duration} seconds`);
      log('✅ Allocation reset completed successfully!');

      // Final audit log
      if (this.auditService && this.userId) {
        await this.auditService.log(
          this.userId,
          'allocation_reset_completed',
          'allocation',
          'system',
          {
            clearedStudents: clearedCount,
            resetNotAllotted: resetCount,
            restoredVacancies: restoredCount,
            duration: `${duration}s`,
            logsCount: logs.length
          },
          undefined,
          undefined
        );
      }

      return {
        clearedStudents: clearedCount,
        restoredVacancies: restoredCount,
        logs,
      };
    } catch (error: any) {
      log(`❌ Reset failed: ${error.message}`);
      throw error;
    }
  }
}