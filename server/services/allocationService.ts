import { IStorage } from '../storage';
import { Student, Vacancy, StudentsEntranceResult } from '@shared/schema';
import { AuditService } from './auditService';
import { getProgress, QueueProgress, DistrictCounter } from './allocationProgress';

export interface ProgressEvent {
  status?: 'running' | 'paused' | 'cancelled' | 'error';
  processed: number;
  total: number;
  totalSeats: number;
  seatsFilled: number;
  allottedCount: number;
  notAllottedCount: number;
  queues: Record<string, QueueProgress>;
  districtCounters: DistrictCounter[];
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

    log(`🔄 Checking if allocations for ${academicYear} - "${roundName}" are clean...`);
    const existingStudentsWithAllocations = await this.storage.getStudents(10000, 0, academicYear);
    const roundAllocations = existingStudentsWithAllocations.filter(s => s.counselingRoundId === counselingRoundId);
    
    if (roundAllocations.length > 0) {
      throw new Error(`Data is not reset. Please reset counseling round "${roundName}" first.`);
    }
    
    log(`   ✅ Database is clean. Commencing allocation run.`);
    
    // Get students for this academic year
    log('📊 Fetching students data...');
    const allStudents = existingStudentsWithAllocations;
    // Strictly evaluate only 'pending' students. 
    // Students who are 'not_allotted', 'vacated', 'not_admitted', etc require manual reset to 'pending' by an Admin. 
    const students = allStudents.filter(s => s.allocationStatus === 'pending');
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
        // Must have app number, assigned stream, and explicitly completely filled 10 choices
        const hasAllChoices = student.choice1 && student.choice2 && student.choice3 && student.choice4 && student.choice5 && student.choice6 && student.choice7 && student.choice8 && student.choice9 && student.choice10;
        
        if (!student.appNo || !hasAllChoices || !student.stream) return false;
        
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
    const totalEligible = eligibleStudents.length;

    // Compute total seats across all vacancies
    let totalSeats = 0;
    vacancies.forEach(v => { totalSeats += v.totalSeats || 0; });
    let seatsFilled = totalSeats - totalAvailableSeats; // seats already taken before this run

    // Helper to build districtCounters from live vacancy state
    const buildDistrictCounters = () => {
      const districtMap: Record<string, any> = {};
      vacancies.forEach(v => {
        if (!v.district) return;
        if (!districtMap[v.district]) districtMap[v.district] = { district: v.district, mOpen: 0, mDisabled: 0, mPrivate: 0, fOpen: 0, fDisabled: 0, fWHH: 0, fPrivate: 0, total: 0 };
        const d = districtMap[v.district];
        const seats = v.availableSeats || 0;
        const g = v.gender; const c = v.category;
        if (g === 'Male' && c === 'Open') d.mOpen += seats;
        else if (g === 'Male' && c === 'Disabled') d.mDisabled += seats;
        else if (g === 'Male' && c === 'Private') d.mPrivate += seats;
        else if (g === 'Female' && c === 'Open') d.fOpen += seats;
        else if (g === 'Female' && c === 'Disabled') d.fDisabled += seats;
        else if (g === 'Female' && c === 'WHH') d.fWHH += seats;
        else if (g === 'Female' && c === 'Private') d.fPrivate += seats;
        d.total += seats;
      });
      return Object.values(districtMap);
    };

    // Helper to extract student choices array
    const getChoices = (s: Student) => {
      const choices: string[] = [];
      for (let i = 1; i <= 10; i++) { const c = (s as any)[`choice${i}`]; if (c) choices.push(c); }
      return choices;
    };

    log('🎯 Grouping students into independent parallel demographic queues...');
    const studentQueues: Record<string, Student[]> = {};
    eligibleStudents.forEach(student => {
      const entranceResult = entranceResultMap.get(student.appNo)!;
      const bucket = `${entranceResult.gender}_${entranceResult.category}`.replace(/\s+/g, '');
      if (!studentQueues[bucket]) studentQueues[bucket] = [];
      studentQueues[bucket].push(student);
    });

    log(`   Created ${Object.keys(studentQueues).length} independent queues tracking ${totalEligible} distinct eligible students.`);

    // Create the live queues dictionary with full interface
    const liveQueues: Record<string, QueueProgress> = {};
    const queueStats: Record<string, { processed: number; allotted: number; denied: number }> = {};
    Object.keys(studentQueues).forEach(key => {
      liveQueues[key] = { currentStudent: null, previousStudent: null, nextStudent: null, processedCount: 0, allottedCount: 0, deniedCount: 0 };
      queueStats[key] = { processed: 0, allotted: 0, denied: 0 };
    });

    const emitProgress = () => {
      // Sync per-queue stats into liveQueues
      Object.keys(queueStats).forEach(k => {
        if (liveQueues[k]) {
          liveQueues[k].processedCount = queueStats[k].processed;
          liveQueues[k].allottedCount = queueStats[k].allotted;
          liveQueues[k].deniedCount = queueStats[k].denied;
        }
      });
      if (onProgress) {
        onProgress({
          processed: processedCount,
          total: totalEligible,
          totalSeats,
          seatsFilled,
          allottedCount,
          notAllottedCount,
          queues: liveQueues,
          districtCounters: buildDistrictCounters(),
        });
      }
    };

    log('🚀 Launching parallel process engine across all active queues...');

    // Process all queues in parallel
    await Promise.all(Object.entries(studentQueues).map(async ([bucket, queueStudents]) => {
      let previousStudentState: any = null;

      for (let idx = 0; idx < queueStudents.length; idx++) {
        const student = queueStudents[idx];
        const entranceResult = entranceResultMap.get(student.appNo)!;

        // --- PAUSE / DELAY / CANCEL INTERCEPTOR ---
        let progressState = getProgress(counselingRoundId);
        if (progressState?.isCancelled) {
          log(`⏹ [${bucket}] Cancel signal received. Halting queue.`);
          break; // break the loop for this bucket
        }

        while (progressState?.isPaused) {
          await new Promise(r => setTimeout(r, 500));
          progressState = getProgress(counselingRoundId);
          if (progressState?.isCancelled) break;
        }
        if (progressState?.isCancelled) break;

        // Pre-tick delay (Slow Motion)
        if (progressState?.delayMs && progressState.delayMs > 0) {
          await new Promise(r => setTimeout(r, progressState.delayMs));
        }
        // --- END INTERCEPTOR ---

        // Setup live processing state with full details
        const nextIdx = idx + 1;
        const nextStudent = nextIdx < queueStudents.length ? queueStudents[nextIdx] : null;
        const nextER = nextStudent ? entranceResultMap.get(nextStudent.appNo) : null;

        liveQueues[bucket].currentStudent = {
          name: student.name,
          meritNumber: student.meritNumber,
          appNo: student.appNo || '',
          gender: entranceResult.gender,
          category: entranceResult.category,
          stream: student.stream,
          counselingDistrict: student.counselingDistrict || undefined,
          result: 'processing',
          choices: getChoices(student),
        };
        liveQueues[bucket].previousStudent = previousStudentState;
        liveQueues[bucket].nextStudent = nextStudent && nextER ? {
          name: nextStudent.name,
          meritNumber: nextStudent.meritNumber,
          appNo: nextStudent.appNo || '',
          gender: nextER.gender,
          category: nextER.category,
          stream: nextStudent.stream,
          counselingDistrict: nextStudent.counselingDistrict || undefined,
          choices: getChoices(nextStudent),
        } : null;
        emitProgress();

        let allocated = false;
        let lastFailureReason = "No choices matched cutoffs";

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
              seatsFilled++;
              allocationsByDistrict[choice] = (allocationsByDistrict[choice] || 0) + 1;
              allocated = true;
              queueStats[bucket].allotted++;

              previousStudentState = {
                name: student.name,
                meritNumber: student.meritNumber,
                appNo: student.appNo || '',
                gender: entranceResult.gender,
                category: entranceResult.category,
                stream: student.stream,
                counselingDistrict: student.counselingDistrict || undefined,
                result: 'allotted',
                allottedDistrict: choice,
                choiceNumber: i,
                choices: getChoices(student),
              };

              break;
            } else {
              lastFailureReason = `${choice} full.`;
            }
          } else {
            lastFailureReason = `${choice} cutoffs exceeded.`;
          }
        }

        if (!allocated) {
          await this.storage.updateStudent(student.id, { 
            allocationStatus: 'not_allotted',
            counselingRoundId: counselingRoundId,
            counselingRoundNumber: roundNumber,
          });
          notAllottedCount++;
          queueStats[bucket].denied++;

          previousStudentState = {
            name: student.name,
            meritNumber: student.meritNumber,
            appNo: student.appNo || '',
            gender: entranceResult.gender,
            category: entranceResult.category,
            stream: student.stream,
            counselingDistrict: student.counselingDistrict || undefined,
            result: 'not_allotted',
            reason: lastFailureReason,
            choices: getChoices(student),
          };
        }

        processedCount++;
        queueStats[bucket].processed++;

        liveQueues[bucket].currentStudent = null;
        liveQueues[bucket].previousStudent = previousStudentState;
        liveQueues[bucket].nextStudent = null;
        emitProgress();
      }
    }));

    // Check if it was cancelled globally
    const finalState = getProgress(counselingRoundId);
    if (finalState?.isCancelled) {
       log(`⏹ Allocation run was interrupted by CANCEL flag. Exiting gracefully.`);
       throw new Error('Allocation Cancelled');
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
          counselingRoundId: null,
          counselingRoundNumber: null,
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
          counselingRoundId: null,
          counselingRoundNumber: null,
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