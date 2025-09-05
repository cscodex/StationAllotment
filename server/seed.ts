import fs from 'fs';
import bcrypt from 'bcrypt';
import { storage } from './storage';
import type { InsertUser } from '@shared/schema';

interface CredentialUser {
  username: string;
  email: string;
  password: string;
  role: string;
  district?: string;
  firstName: string;
  lastName: string;
}

interface Credentials {
  central_admin: CredentialUser;
  district_admins: CredentialUser[];
}

async function seedUsers() {
  try {
    console.log('🌱 Starting user seeding...');
    
    // Read credentials.json
    const credentialsData = fs.readFileSync('credentials.json', 'utf-8');
    const credentials: Credentials = JSON.parse(credentialsData);
    
    const usersToSeed: CredentialUser[] = [
      credentials.central_admin,
      ...credentials.district_admins
    ];
    
    let seedCount = 0;
    
    for (const userData of usersToSeed) {
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        console.log(`⏭️  User ${userData.username} already exists, skipping...`);
        continue;
      }
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Prepare user data
      const newUser: InsertUser = {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        role: userData.role as 'central_admin' | 'district_admin',
        district: userData.district || null,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isBlocked: false,
      };
      
      // Create user
      const createdUser = await storage.createUser(newUser);
      console.log(`✅ Created user: ${createdUser.username} (${createdUser.role})`);
      seedCount++;
    }
    
    console.log(`🎉 Seeding completed! Added ${seedCount} new users.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run the seeder
seedUsers();