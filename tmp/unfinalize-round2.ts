import { db } from "../server/db";
import { counselingRounds } from "../shared/schema";
import { eq } from "drizzle-orm";

async function run() {
  // First list all rounds to find the right one
  const allRounds = await db.select().from(counselingRounds);
  console.log("All rounds:", allRounds.map(r => ({
    id: r.id,
    roundNumber: r.roundNumber,
    roundName: r.roundName,
    isActive: r.isActive,
    isAllocationCompleted: r.isAllocationCompleted,
    isAllocationFinalized: r.isAllocationFinalized,
    counselingTitleId: r.counselingTitleId,
  })));

  // Find round 2 that is finalized
  const round2 = allRounds.find(r => r.roundNumber === 2 && r.isAllocationFinalized);
  if (!round2) {
    console.log("No finalized round 2 found");
    process.exit(1);
  }

  console.log(`Unfinalizing round: ${round2.id} (Round ${round2.roundNumber}: ${round2.roundName})`);
  
  const [updated] = await db.update(counselingRounds)
    .set({ 
      isAllocationFinalized: false, 
      isAllocationCompleted: false,
      allocationFinalizedAt: null,
      allocationFinalizedBy: null,
    })
    .where(eq(counselingRounds.id, round2.id))
    .returning();

  console.log("Unfinalized successfully:", {
    id: updated.id,
    roundNumber: updated.roundNumber,
    isAllocationFinalized: updated.isAllocationFinalized,
    isAllocationCompleted: updated.isAllocationCompleted,
  });
  
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
