import { db } from './db';
import { users } from '@shared/schema';
import * as bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';

async function initializeUsers() {
  try {
    // Read credentials from the JSON file
    const credentialsPath = path.join(process.cwd(), 'credentials.json');
    const credentialsData = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    
    console.log('🚀 Starting user initialization...');
    
    // Hash passwords and prepare user data
    const usersToInsert = [];
    
    // Add central admin
    const centralAdmin = credentialsData.central_admin;
    const hashedCentralPassword = await bcrypt.hash(centralAdmin.password, 10);
    
    usersToInsert.push({
      username: centralAdmin.username,
      email: centralAdmin.email,
      password: hashedCentralPassword,
      role: centralAdmin.role,
      district: centralAdmin.district,
      firstName: centralAdmin.firstName,
      lastName: centralAdmin.lastName,
      credentials: centralAdmin,
      isBlocked: false
    });
    
    // Add district admins
    for (const districtAdmin of credentialsData.district_admins) {
      const hashedPassword = await bcrypt.hash(districtAdmin.password, 10);
      
      usersToInsert.push({
        username: districtAdmin.username,
        email: districtAdmin.email,
        password: hashedPassword,
        role: districtAdmin.role,
        district: districtAdmin.district,
        firstName: districtAdmin.firstName,
        lastName: districtAdmin.lastName,
        credentials: districtAdmin,
        isBlocked: false
      });
    }
    
    // Insert users into database
    await db.insert(users).values(usersToInsert);
    
    console.log(`✅ Successfully inserted ${usersToInsert.length} users`);
    console.log('✅ Database initialization complete!');
    
    // Log sample credentials for testing
    console.log('\n📋 Test Credentials:');
    console.log('Central Admin: central_admin / Punjab@2024');
    console.log('District Admin Example: amritsar_admin / Amritsar@2024');
    
  } catch (error) {
    console.error('❌ Error initializing users:', error);
    throw error;
  }
}

// Run initialization if this file is executed directly
initializeUsers()
  .then(() => {
    console.log('👍 User initialization completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 User initialization failed:', error);
    process.exit(1);
  });

export { initializeUsers };