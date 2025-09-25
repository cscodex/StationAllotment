import { db } from './server/db.js';
import { users } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function testLogin() {
  try {
    console.log('Testing login for central_admin...');
    
    // Get user from database
    const [user] = await db.select().from(users).where(eq(users.username, 'central_admin'));
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:', user.username);
    console.log('🔑 Stored password hash:', user.password.substring(0, 30) + '...');
    
    console.log('ℹ️  This is a debug script for testing database connectivity.');
    console.log('🔒 For security reasons, password testing has been removed.');
    console.log('📄 Please check secure-credentials.json for login information.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testLogin();