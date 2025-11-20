# Fix for Counseling Rounds Not Showing (2024-2025)

## Issues Found and Fixed

### 1. Query Key Mismatch
**Problem**: The query key was using an object `{ academicYear: selectedAcademicYear }` but the invalidation was using a different format.

**Fix**: Changed query key to use `selectedAcademicYear` directly as the second parameter, matching the invalidation pattern.

### 2. Storage Ordering
**Problem**: Rounds were only ordered by `roundNumber`, not grouped by counseling title.

**Fix**: Updated `getCounselingRounds` to order by `roundName` first, then `roundNumber` to group rounds by counseling.

### 3. Query Invalidation
**Problem**: After creating rounds, the query wasn't being invalidated with the correct key.

**Fix**: Updated invalidation to include `selectedAcademicYear` in the query key.

### 4. Added Debug Logging
**Fix**: Added console.log to help debug what data is being fetched.

## Changes Made

### `server/storage.ts`
```typescript
async getCounselingRounds(academicYear?: string): Promise<CounselingRound[]> {
  if (academicYear) {
    return db.select().from(counselingRounds)
      .where(eq(counselingRounds.academicYear, academicYear))
      .orderBy(asc(counselingRounds.roundName), asc(counselingRounds.roundNumber));
  }
  return db.select().from(counselingRounds)
    .orderBy(desc(counselingRounds.academicYear), asc(counselingRounds.roundName), asc(counselingRounds.roundNumber));
}
```

### `client/src/pages/counseling-rounds.tsx`
- Fixed query key format
- Added `refetch` function
- Updated query invalidation to include academic year
- Added debug logging
- Set `staleTime: 0` to always refetch fresh data

## Testing Steps

1. **Restart the server**:
   ```bash
   ./restart-server.sh
   ```

2. **Open browser console** (F12) to see debug logs

3. **Navigate to Counseling Rounds page**

4. **Select academic year "2024-2025"**

5. **Check console** - you should see:
   ```
   Fetched rounds: [array of rounds]
   ```

6. **Verify rounds are displayed** in the table

## Expected Result

- All 14 rounds for 2024-2025 should be visible
- Rounds should be grouped by counseling title (Demo Counseling, Meritorious School, Regular Counseling)
- Rounds within each counseling should be ordered by round number (1, 2, 3...)

## If Still Not Working

1. Check browser console for errors
2. Check network tab to see if API request is being made
3. Verify the API response in network tab
4. Check server logs for any errors


