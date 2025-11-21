/**
 * Script to fix invalid dates (1970 epoch) in counseling_rounds table
 * Run this to update any rounds with invalid start dates
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function fixInvalidDates() {
  try {
    console.log('🔍 Checking for invalid dates in counseling_rounds...');
    
    // Find all rounds with dates before year 2000 (likely invalid)
    const invalidRounds = await sql`
      SELECT id, round_name, round_number, start_date, end_date, academic_year
      FROM counseling_rounds
      WHERE EXTRACT(YEAR FROM start_date) < 2000
      ORDER BY created_at DESC
    `;
    
    if (invalidRounds.length === 0) {
      console.log('✅ No invalid dates found!');
      return;
    }
    
    console.log(`⚠️  Found ${invalidRounds.length} rounds with invalid dates:`);
    invalidRounds.forEach((round: any) => {
      console.log(`  - ${round.round_name} Round ${round.round_number}: ${round.start_date}`);
    });
    
    console.log('\n📝 To fix these dates, you can:');
    console.log('1. Delete and recreate the rounds with valid dates');
    console.log('2. Or manually update them using SQL:');
    console.log('\nExample SQL to update a round:');
    console.log(`UPDATE counseling_rounds`);
    console.log(`SET start_date = '2025-11-21 10:00:00'::timestamp`);
    console.log(`WHERE id = 'ROUND_ID_HERE';`);
    
  } catch (error) {
    console.error('❌ Error checking dates:', error);
    process.exit(1);
  }
}

fixInvalidDates();

