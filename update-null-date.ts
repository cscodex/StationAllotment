/**
 * Script to update the round with null startDate
 * This will set a default date or delete the round
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function updateNullDate() {
  try {
    const roundId = '379c2ad7-e9f9-4cde-ba9b-c9be3335705a';
    
    console.log('🔍 Checking round...');
    const rounds = await sql`
      SELECT id, round_name, round_number, start_date, academic_year
      FROM counseling_rounds
      WHERE id = ${roundId}
    `;
    
    if (rounds.length === 0) {
      console.log('❌ Round not found');
      return;
    }
    
    const round = rounds[0];
    console.log('Current round:', round);
    
    if (round.start_date === null) {
      console.log('⚠️  Round has null startDate. Deleting it...');
      
      await sql`
        DELETE FROM counseling_rounds
        WHERE id = ${roundId}
      `;
      
      console.log('✅ Deleted round with null startDate');
      console.log('💡 Please recreate this round with a valid date.');
    } else {
      console.log('✅ Round has a valid startDate:', round.start_date);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateNullDate();

