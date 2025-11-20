import { IStorage } from '../storage';
import { CounselingRound } from '@shared/schema';
import { getCurrentSession, isCurrentSession } from '../utils/sessionUtils';

export class RoundActivationService {
  constructor(private storage: IStorage) {}

  /**
   * Check and activate rounds whose start date has been reached
   * Only activates rounds for the current session
   * @returns Array of activated rounds
   */
  async activateDueRounds(): Promise<CounselingRound[]> {
    const currentSession = getCurrentSession();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Today at midnight
    
    // Get all rounds for current session that are not yet active and not completed
    const allRounds = await this.storage.getCounselingRounds(currentSession);
    
    const roundsToActivate = allRounds.filter(round => {
      // Only process rounds for current session
      if (!isCurrentSession(round.academicYear)) return false;
      
      // Skip if already active or completed
      if (round.isActive || round.isCompleted) return false;
      
      // Check if start date has been reached
      const startDate = new Date(round.startDate);
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      
      // Activate if today >= start date
      return today >= startDateOnly;
    });

    const activatedRounds: CounselingRound[] = [];

    // Activate each round
    for (const round of roundsToActivate) {
      try {
        const activated = await this.storage.activateCounselingRound(round.id, round.academicYear);
        activatedRounds.push(activated);
        console.log(`✅ Automatically activated round: ${round.roundName} - Round ${round.roundNumber} (${round.academicYear})`);
      } catch (error) {
        console.error(`❌ Failed to activate round ${round.id}:`, error);
      }
    }

    return activatedRounds;
  }

  /**
   * Check and complete rounds whose end date has passed
   * Only processes rounds for the current session
   * @returns Array of completed rounds
   */
  async completeExpiredRounds(): Promise<CounselingRound[]> {
    const currentSession = getCurrentSession();
    const now = new Date();
    // Get today's date in local timezone (YYYY-MM-DD format for comparison)
    const todayStr = now.toISOString().split('T')[0];
    const today = new Date(todayStr + 'T00:00:00'); // Set to midnight in local time
    
    // Get all active rounds for current session
    const allRounds = await this.storage.getCounselingRounds(currentSession);
    
    const roundsToComplete = allRounds.filter(round => {
      // Only process rounds for current session
      if (!isCurrentSession(round.academicYear)) return false;
      
      // Skip if already completed or not active
      if (round.isCompleted || !round.isActive) return false;
      
      // Check if end date has passed
      // Dates from database come as strings (YYYY-MM-DD format)
      const dateStr = String(round.endDate).split('T')[0]; // Get date part only
      const endDate = new Date(dateStr + 'T00:00:00');
      
      // Compare dates (ignoring time)
      const endDateStr = endDate.toISOString().split('T')[0];
      const todayDateStr = today.toISOString().split('T')[0];
      
      // Complete if today > end date (round ended yesterday or earlier)
      return todayDateStr > endDateStr;
    });

    const completedRounds: CounselingRound[] = [];

    // Complete each round
    for (const round of roundsToComplete) {
      try {
        const completed = await this.storage.completeCounselingRound(round.id);
        completedRounds.push(completed);
        console.log(`✅ Automatically completed round: ${round.roundName} - Round ${round.roundNumber} (${round.academicYear})`);
      } catch (error) {
        console.error(`❌ Failed to complete round ${round.id}:`, error);
      }
    }

    return completedRounds;
  }

  /**
   * Deactivate all rounds from previous sessions
   * This ensures that only current session rounds can be active
   * @returns Number of rounds deactivated
   */
  async deactivatePreviousSessions(): Promise<number> {
    const currentSession = getCurrentSession();
    const allRounds = await this.storage.getCounselingRounds(); // Get all rounds
    
    const roundsToDeactivate = allRounds.filter(round => {
      // Deactivate rounds from previous sessions that are still active
      return !isCurrentSession(round.academicYear) && round.isActive && !round.isCompleted;
    });

    let deactivatedCount = 0;
    for (const round of roundsToDeactivate) {
      try {
        // Deactivate by updating isActive to false
        await this.storage.updateCounselingRound(round.id, { isActive: false });
        deactivatedCount++;
        console.log(`✅ Deactivated previous session round: ${round.roundName} - Round ${round.roundNumber} (${round.academicYear})`);
      } catch (error) {
        console.error(`❌ Failed to deactivate round ${round.id}:`, error);
      }
    }

    return deactivatedCount;
  }

  /**
   * Activate rounds for current session that should be active
   * This checks ALL rounds but only activates current session ones
   * @returns Array of activated rounds
   */
  async activateDueRoundsAll(): Promise<CounselingRound[]> {
    const currentSession = getCurrentSession();
    const now = new Date();
    
    // Get ALL rounds to check (not just current session)
    const allRounds = await this.storage.getCounselingRounds();
    
    const roundsToActivate = allRounds.filter(round => {
      // Only activate rounds for current session
      if (!isCurrentSession(round.academicYear)) return false;
      
      // Skip if already active or completed
      if (round.isActive || round.isCompleted) return false;
      
      // Check if start datetime has been reached
      // startDate is now a timestamp (datetime)
      const startDate = new Date(round.startDate);
      
      // Activate if current time >= start datetime
      return now >= startDate;
    });

    const activatedRounds: CounselingRound[] = [];

    // Activate each round
    for (const round of roundsToActivate) {
      try {
        const activated = await this.storage.activateCounselingRound(round.id, round.academicYear);
        activatedRounds.push(activated);
        console.log(`✅ Automatically activated round: ${round.roundName} - Round ${round.roundNumber} (${round.academicYear})`);
      } catch (error) {
        console.error(`❌ Failed to activate round ${round.id}:`, error);
      }
    }

    return activatedRounds;
  }

  /**
   * Run both activation and completion checks, plus cleanup previous sessions
   * This is the main method to call periodically
   */
  async processRounds(): Promise<{
    activated: CounselingRound[];
    completed: CounselingRound[];
    deactivated: number;
  }> {
    // First, deactivate all previous session rounds
    const deactivated = await this.deactivatePreviousSessions();
    
    // Then activate due rounds (checking all, but only activating current session)
    const activated = await this.activateDueRoundsAll();
    
    // Finally, complete expired rounds
    const completed = await this.completeExpiredRounds();
    
    return { activated, completed, deactivated };
  }
}

