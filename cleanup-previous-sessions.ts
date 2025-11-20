/**
 * Cleanup Script: Deactivate Previous Session Rounds
 * 
 * This script deactivates all active rounds from previous sessions
 * and activates rounds for the current session that should be active.
 * 
 * Run with: npx tsx cleanup-previous-sessions.ts
 */

import "dotenv/config";
import { storage } from './server/storage';
import { RoundActivationService } from './server/services/roundActivationService';
import { getCurrentSession, isPreviousSession } from './server/utils/sessionUtils';

async function cleanupPreviousSessions() {
  console.log('🧹 Starting cleanup of previous session rounds...\n');

  try {
    const currentSession = getCurrentSession();
    console.log(`📅 Current Session: ${currentSession}\n`);

    const roundActivationService = new RoundActivationService(storage);

    // Step 1: Get all rounds
    console.log('1️⃣  Fetching all counseling rounds...');
    const allRounds = await storage.getCounselingRounds();
    console.log(`   Found ${allRounds.length} total rounds\n`);

    // Step 2: Identify previous session rounds
    console.log('2️⃣  Identifying previous session rounds...');
    const previousSessionRounds = allRounds.filter(round => 
      isPreviousSession(round.academicYear) && round.isActive && !round.isCompleted
    );
    console.log(`   Found ${previousSessionRounds.length} active rounds from previous sessions:`);
    previousSessionRounds.forEach(round => {
      console.log(`     - ${round.roundName} - Round ${round.roundNumber} (${round.academicYear})`);
    });
    console.log('');

    // Step 3: Deactivate previous session rounds
    console.log('3️⃣  Deactivating previous session rounds...');
    const deactivatedCount = await roundActivationService.deactivatePreviousSessions();
    console.log(`   ✅ Deactivated ${deactivatedCount} rounds from previous sessions\n`);

    // Step 4: Activate due rounds for current session
    console.log('4️⃣  Activating due rounds for current session...');
    const activatedRounds = await roundActivationService.activateDueRoundsAll();
    console.log(`   ✅ Activated ${activatedRounds.length} rounds for current session:`);
    activatedRounds.forEach(round => {
      console.log(`     - ${round.roundName} - Round ${round.roundNumber} (${round.academicYear})`);
    });
    console.log('');

    // Step 5: Complete expired rounds
    console.log('5️⃣  Completing expired rounds...');
    const completedRounds = await roundActivationService.completeExpiredRounds();
    console.log(`   ✅ Completed ${completedRounds.length} expired rounds:`);
    completedRounds.forEach(round => {
      console.log(`     - ${round.roundName} - Round ${round.roundNumber} (${round.academicYear})`);
    });
    console.log('');

    // Step 6: Summary
    console.log('📊 Cleanup Summary:');
    console.log(`   Current Session: ${currentSession}`);
    console.log(`   Deactivated Previous Session Rounds: ${deactivatedCount}`);
    console.log(`   Activated Current Session Rounds: ${activatedRounds.length}`);
    console.log(`   Completed Expired Rounds: ${completedRounds.length}`);
    console.log('\n✅ Cleanup completed successfully!\n');

  } catch (error) {
    console.error('❌ Cleanup failed with error:', error);
    throw error;
  }
}

// Run the cleanup
cleanupPreviousSessions()
  .then(() => {
    console.log('Cleanup script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup script failed:', error);
    process.exit(1);
  });

