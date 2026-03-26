import { db } from '../server/db';
import { counselingRounds } from '../shared/schema';

async function main() {
  const rounds = await db.select().from(counselingRounds);
  rounds.forEach(r => {
    console.log(JSON.stringify({
      id: r.id,
      roundName: r.roundName,
      roundNumber: r.roundNumber,
      isActive: r.isActive,
      isCompleted: r.isCompleted,
      isAllocationCompleted: r.isAllocationCompleted,
      isAllocationFinalized: r.isAllocationFinalized,
      isSuspended: r.isSuspended,
      hasSnapshot: !!r.snapshotData,
    }, null, 2));
  });
  process.exit(0);
}
main().catch(console.error);
