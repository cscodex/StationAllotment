import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

// Read credentials.json
const credentialsData = fs.readFileSync('credentials.json', 'utf-8');
const credentials = JSON.parse(credentialsData);

const usersToSeed = [
  credentials.central_admin,
  ...credentials.district_admins
];

// Generate SQL file
let sqlContent = `-- Users for Punjab Seat Allotment System
-- Generated on ${new Date().toISOString()}
-- This file contains INSERT statements for central admin and all 23 district admins

-- Note: Passwords are already bcrypt hashed with salt rounds = 10

`;

async function generateSQL() {
  for (const userData of usersToSeed) {
    // Hash the password
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    // Generate UUID
    const userId = nanoid();
    
    // Generate safe credentials JSON (without password)
    const { password: _, ...safeCredentials } = userData;
    const credentialsJson = JSON.stringify(safeCredentials).replace(/'/g, "''");
    
    // Create INSERT statement
    const sqlInsert = `INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  '${userId}',
  '${userData.username}',
  '${userData.email || ''}',
  '${hashedPassword}',
  '${userData.role}',
  ${userData.district ? `'${userData.district}'` : 'NULL'},
  '${userData.firstName || ''}',
  '${userData.lastName || ''}',
  '${credentialsJson}',
  false,
  NOW(),
  NOW()
);

`;
    
    sqlContent += sqlInsert;
  }
  
  // Add comment at the end
  sqlContent += `-- Total users created: ${usersToSeed.length}
-- Central admins: 1
-- District admins: ${credentials.district_admins.length}

-- To execute this file:
-- psql -d your_database_name -f users-seed.sql
-- or execute these statements directly in your database client
`;

  // Write to SQL file
  fs.writeFileSync('users-seed.sql', sqlContent);
  console.log('✅ Generated users-seed.sql successfully!');
  console.log(`📊 Created ${usersToSeed.length} user records (1 central admin + ${credentials.district_admins.length} district admins)`);
  console.log('🔒 All passwords are bcrypt hashed with salt rounds = 10');
  console.log('📄 SQL file: users-seed.sql');
}

generateSQL().catch(console.error);