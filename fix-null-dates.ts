/**
 * Script to fix null dates in counseling_rounds table
 * This will delete rounds with null startDate or update them with a default date
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function fixNullDates() {
  try {
    console.log('🔍 Checking for rounds with null startDate...');
    
    // Find all rounds with null startDate
    const nullRounds = await sql`
      SELECT id, round_name, round_number, start_date, academic_year, created_at
      FROM counseling_rounds
      WHERE start_date IS NULL
      ORDER BY created_at DESC
    `;
    
    if (nullRounds.length === 0) {
      console.log('✅ No rounds with null dates found!');
      return;
    }
    
    console.log(`⚠️  Found ${nullRounds.length} rounds with null startDate:`);
    nullRounds.forEach((round: any) => {
      console.log(`  - ID: ${round.id}`);
      console.log(`    ${round.round_name} Round ${round.round_number} (${round.academic_year})`);
      console.log(`    Created: ${round.created_at}`);
    });
    
    console.log('\n🗑️  Deleting rounds with null startDate...');
    
    // Delete rounds with null startDate (they're invalid)
    const result = await sql`
      DELETE FROM counseling_rounds
      WHERE start_date IS NULL
    `;
    
    console.log(`✅ Deleted ${nullRounds.length} invalid rounds`);
    console.log('\n💡 Please recreate these rounds with valid dates.');
    
  } catch (error) {
    console.error('❌ Error fixing null dates:', error);
    process.exit(1);
  }
}

fixNullDates();

