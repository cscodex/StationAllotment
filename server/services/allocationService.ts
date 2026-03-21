import { IStorage } from '../storage';
import { Student, Vacancy, StudentsEntranceResult } from '@shared/schema';
import { AuditService } from './auditService';

export interface ProgressEvent {
  processed: number;
  total: number;
  allottedCount: number;
  notAllottedCount: number;
  currentStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
    result: 'allotted' | 'not_allotted' | 'processing';
    allottedDistrict?: string;
    choiceNumber?: number;
  } | null;
  previousStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
    result: 'allotted' | 'not_allotted';
    allottedDistrict?: string;
    choiceNumber?: number;
  } | null;
  nextStudent: {
    name: string;
    meritNumber: number;
    appNo: string;
    gender: string;
    category: string;
  } | null;
  bucket: string;
}

export class AllocationService {
  constructor(
    private storage: IStorage,
    private auditService?: AuditService,
    private userId?: string
  ) {}

  async runAllocation(academicYear: string, roundNumber: number, counselingRoundId: string, onProgress?: (event: ProgressEvent) => void): Promise<{
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

    // Get the counseling round to extract roundName (counseling title)
    const round = await this.storage.getCounselingRound(counselingRoundId);
    if (!round) {
      throw new Error(`Counseling round ${counselingRoundId} not found`);
    }
    const roundName = round.roundName;

    log(`🔄 Resetting previous allocations for ${academicYear} - "${roundName}"...`);
    await this.storage.resetAllocation(academicYear, roundName);
    log(`   ✅ Database reset successfully. Commencing clean allocation run.`);
    
    // Get students for this academic year
    log('📊 Fetching students data...');
    const allStudents = await this.storage.getStudents(10000, 0, academicYear);
    // Since we just reset, all students should be 'pending'. 
    // We filter just in case, but essentially all return eligible.
    const students = allStudents.filter(s => s.allocationStatus !== 'allotted');
    log(`   Found ${allStudents.length} total students for ${academicYear}`);
    log(`   Processing ${students.length} eligible students`);
    
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
    const totalEligible = eligibleStudents.length;

    log('🎯 Processing students sequentially in merit order...');

    let previousStudentState: any = null;

    // Process ALL students sequentially in merit order for real-time display
    for (let idx = 0; idx < eligibleStudents.length; idx++) {
      const student = eligibleStudents[idx];
      const entranceResult = entranceResultMap.get(student.appNo)!;
      if (!entranceResult) continue;

      const bucket = `${entranceResult.gender} - ${entranceResult.category}`;

      let nextStudentState: any = null;
      if (idx + 1 < eligibleStudents.length) {
        const nextS = eligibleStudents[idx + 1];
        const nextEr = entranceResultMap.get(nextS.appNo);
        if (nextEr) {
          nextStudentState = {
            name: nextS.name,
            meritNumber: nextS.meritNumber,
            appNo: nextS.appNo,
            gender: nextEr.gender,
            category: nextEr.category,
          };
        }
      }

      // Emit "processing" progress
      if (onProgress) {
        onProgress({
          processed: idx,
          total: totalEligible,
          allottedCount,
          notAllottedCount,
          currentStudent: {
            name: student.name,
            meritNumber: student.meritNumber,
            appNo: student.appNo,
            gender: entranceResult.gender,
            category: entranceResult.category,
            result: 'processing',
          },
          previousStudent: previousStudentState,
          nextStudent: nextStudentState,
          bucket,
        });
      }

      let allocated = false;

      // Check each choice from 1 to 10
      for (let i = 1; i <= 10; i++) {
        const choice = (student as any)[`choice${i}`];
        if (!choice) continue;

        const vacancyKey = `${choice}|${student.stream}|${entranceResult.gender}|${entranceResult.category}`;
        const availableVacancies = vacancyMap.get(vacancyKey);
        
        if (availableVacancies && availableVacancies.length > 0) {
          const selectedVacancy = availableVacancies.find(v => v.availableSeats && v.availableSeats > 0);
          
          if (selectedVacancy) {
            await this.storage.updateStudent(student.id, {
              allottedDistrict: choice,
              allottedStream: student.stream,
              allottedSchoolUdise: selectedVacancy.udiseCode || null,
              counselingRoundId: counselingRoundId,
              counselingRoundNumber: roundNumber,
              allocationStatus: 'allotted',
            });

            await this.storage.updateVacancy(selectedVacancy.id, {
              availableSeats: (selectedVacancy.availableSeats || 0) - 1,
            });
            
            selectedVacancy.availableSeats = (selectedVacancy.availableSeats || 0) - 1;
            if (selectedVacancy.availableSeats === 0) {
              vacancyMap.set(vacancyKey, availableVacancies.filter(v => v.id !== selectedVacancy.id));
            }
            
            allottedCount++;
            allocationsByDistrict[choice] = (allocationsByDistrict[choice] || 0) + 1;
            allocated = true;

            // Emit "allotted" progress
            if (onProgress) {
              onProgress({
                processed: idx + 1,
                total: totalEligible,
                allottedCount,
                notAllottedCount,
                currentStudent: {
                  name: student.name,
                  meritNumber: student.meritNumber,
                  appNo: student.appNo,
                  gender: entranceResult.gender,
                  category: entranceResult.category,
                  result: 'allotted',
                  allottedDistrict: choice,
                  choiceNumber: i,
                },
                previousStudent: previousStudentState,
                nextStudent: nextStudentState,
                bucket,
              });
            }

            previousStudentState = {
              name: student.name,
              meritNumber: student.meritNumber,
              appNo: student.appNo,
              gender: entranceResult.gender,
              category: entranceResult.category,
              result: 'allotted',
              allottedDistrict: choice,
              choiceNumber: i,
            };

            break;
          }
        }
      }

      if (!allocated) {
        await this.storage.updateStudent(student.id, { allocationStatus: 'not_allotted' });
        notAllottedCount++;

        // Emit "not_allotted" progress
        if (onProgress) {
          onProgress({
            processed: idx + 1,
            total: totalEligible,
            allottedCount,
            notAllottedCount,
            currentStudent: {
              name: student.name,
              meritNumber: student.meritNumber,
              appNo: student.appNo,
              gender: entranceResult.gender,
              category: entranceResult.category,
              result: 'not_allotted',
            },
            previousStudent: previousStudentState,
            nextStudent: nextStudentState,
            bucket,
          });
        }

        previousStudentState = {
          name: student.name,
          meritNumber: student.meritNumber,
          appNo: student.appNo,
          gender: entranceResult.gender,
          category: entranceResult.category,
          result: 'not_allotted',
        };
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    log('📊 Allocation Summary:');
    log(`   Total Eligible Students: ${eligibleStudents.length}`);
    log(`   Successfully Allotted: ${allottedCount} (${((allottedCount / (eligibleStudents.length || 1)) * 100).toFixed(2)}%)`);
    log(`   Not Allotted: ${notAllottedCount} (${((notAllottedCount / (eligibleStudents.length || 1)) * 100).toFixed(2)}%)`);
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