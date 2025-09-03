import bcrypt from 'bcrypt';
import { db } from './db.js';
import { users } from '@shared/schema';

async function seed() {
  try {
    // Check if admin user already exists
    const existingAdmin = await db.select().from(users).where({ username: 'admin' }).limit(1);
    
    if (existingAdmin.length > 0) {
      console.log('Admin user already exists');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('password', 10);

    // Create admin user
    await db.insert(users).values({
      username: 'admin',
      email: 'admin@seatallotment.local',
      password: hashedPassword,
      role: 'central_admin',
      firstName: 'System',
      lastName: 'Administrator',
    });

    console.log('Admin user created successfully');
    console.log('Username: admin');
    console.log('Password: password');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    process.exit(0);
  }
}

seed();