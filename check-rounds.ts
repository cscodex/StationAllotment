import { db } from './server/db';
import { counselingRounds, settings } from '@shared/schema';

async function main() {
  const rounds = await db.select().from(counselingRounds);
  console.log("Counseling Rounds:", JSON.stringify(rounds, null, 2));
  
  const allSettings = await db.select().from(settings);
  console.log("Settings:", JSON.stringify(allSettings, null, 2));
  
  process.exit(0);
}
main();
