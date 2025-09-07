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
    
    // Test password comparison
    const testPassword = 'Punjab@2024';
    const isValid = await bcrypt.compare(testPassword, user.password);
    console.log('🔍 Password comparison result:', isValid);
    
    if (!isValid) {
      console.log('❌ Password does not match!');
      console.log('🧪 Testing hash generation...');
      const newHash = await bcrypt.hash(testPassword, 10);
      console.log('📝 New hash would be:', newHash.substring(0, 30) + '...');
      console.log('🔍 Hash prefix check:', user.password.startsWith('$2b$10$'));
    } else {
      console.log('✅ Password matches correctly!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testLogin();