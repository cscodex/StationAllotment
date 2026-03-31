import { db } from "../server/db";
import { counselingRounds } from "../shared/schema";
import { eq } from "drizzle-orm";

async function run() {
  const rs = await db.update(counselingRounds)
    .set({ isAllocationFinalized: false, isAllocationCompleted: false })
    .where(eq(counselingRounds.roundNumber, 2));
  console.log("Unfinalized Round 2");
  process.exit(0);
}
run();
