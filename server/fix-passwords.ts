import { db } from './db';
import { users } from '@shared/schema';
import * as bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';

async function fixPasswords() {
  try {
    console.log('🔧 Fixing user passwords...');
    
    // Read credentials from the JSON file
    const credentialsPath = path.join(process.cwd(), 'credentials.json');
    const credentialsData = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    
    // Fix central admin password
    const centralAdminHash = await bcrypt.hash(credentialsData.central_admin.password, 10);
    await db.update(users)
      .set({ password: centralAdminHash })
      .where(eq(users.username, credentialsData.central_admin.username));
    
    console.log('✅ Fixed central admin password');
    
    // Fix district admin passwords
    let fixedCount = 0;
    for (const districtAdmin of credentialsData.district_admins) {
      const hashedPassword = await bcrypt.hash(districtAdmin.password, 10);
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.username, districtAdmin.username));
      fixedCount++;
    }
    
    console.log(`✅ Fixed ${fixedCount} district admin passwords`);
    console.log('✅ All passwords have been fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing passwords:', error);
    throw error;
  }
}

fixPasswords()
  .then(() => {
    console.log('👍 Password fix completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Password fix failed:', error);
    process.exit(1);
  });