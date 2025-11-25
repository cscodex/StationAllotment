import "dotenv/config";
import bcrypt from "bcrypt";
import { storage } from "./server/storage.js";

const NEW_PASSWORD = "Password123";

async function resetDistrictAdminPasswords() {
  try {
    console.log('🔐 Starting password reset for all district admins...');
    console.log(`📝 New password: ${NEW_PASSWORD}`);
    
    // Get all users
    const allUsers = await storage.getAllUsers();
    
    // Filter district admins
    const districtAdmins = allUsers.filter(user => user.role === 'district_admin');
    
    if (districtAdmins.length === 0) {
      console.log('⚠️  No district admins found in the database.');
      process.exit(0);
    }
    
    console.log(`\n📊 Found ${districtAdmins.length} district admin(s):`);
    districtAdmins.forEach(admin => {
      console.log(`   - ${admin.username} (${admin.district || 'No district'})`);
    });
    
    // Hash the new password
    console.log('\n🔒 Hashing password...');
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);
    
    // Update each district admin's password
    console.log('\n🔄 Updating passwords...');
    let updatedCount = 0;
    
    for (const admin of districtAdmins) {
      try {
        await storage.updateUser(admin.id, { password: hashedPassword });
        console.log(`   ✅ Updated password for: ${admin.username}`);
        updatedCount++;
      } catch (error) {
        console.error(`   ❌ Failed to update password for ${admin.username}:`, error);
      }
    }
    
    console.log(`\n🎉 Password reset completed!`);
    console.log(`   Updated ${updatedCount} out of ${districtAdmins.length} district admin(s).`);
    console.log(`\n📋 Summary:`);
    console.log(`   - New password: ${NEW_PASSWORD}`);
    console.log(`   - All district admins can now login with this password`);
    console.log(`   - Please inform all district admins to change their password after first login.`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Password reset failed:', error);
    process.exit(1);
  }
}

// Run the script
resetDistrictAdminPasswords();

