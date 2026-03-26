import { DatabaseStorage } from '../server/storage';

async function main() {
  const storage = new DatabaseStorage();
  
  const decodedYear = '2025-2026';
  const decodedName = 'MeritoriousSchoolLudhiana';
  
  console.log(`Simulating next-round check for year="${decodedYear}", roundName="${decodedName}"`);
  
  const vacancies = await storage.getVacancies(decodedYear);
  console.log(`getVacancies(${decodedYear}) returned ${vacancies.length} vacancies`);
  
  const titleVacancies = vacancies.filter(v => v.roundName === decodedName);
  console.log(`Filtered by roundName="${decodedName}": ${titleVacancies.length} vacancies`);
  
  let totalAvailableSeats = 0;
  titleVacancies.forEach(v => {
    totalAvailableSeats += (v.availableSeats || 0);
  });
  console.log(`Total available seats: ${totalAvailableSeats}`);
  
  const allRounds = await storage.getCounselingRounds(decodedYear);
  const titleRounds = allRounds.filter((r: any) => r.roundName === decodedName);
  console.log(`Found ${titleRounds.length} rounds for "${decodedName}"`);
  titleRounds.forEach((r: any) => {
    console.log(`  Round #${r.roundNumber}: active=${r.isActive}, completed=${r.isCompleted}, finalized=${r.isAllocationFinalized}`);
  });
  
  if (titleRounds.length === 0) {
    console.log('ERROR: Counseling title not found');
  } else if (titleVacancies.length > 0 && totalAvailableSeats <= 0) {
    console.log('ERROR: Cannot create next round - All vacancies filled');
  } else {
    const maxRoundNum = Math.max(...titleRounds.map((r: any) => r.roundNumber));
    const latestRound = titleRounds.find((r: any) => r.roundNumber === maxRoundNum);
    console.log(`Latest round: #${maxRoundNum}, finalized=${latestRound?.isAllocationFinalized}, completed=${latestRound?.isCompleted}`);
    
    if (latestRound && !latestRound.isAllocationFinalized && !latestRound.isCompleted) {
      console.log('ERROR: Cannot create next round - latest round must be finalized first');
    } else {
      console.log('SUCCESS: All checks pass - next round CAN be created');
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
