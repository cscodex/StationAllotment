import fs from 'fs';
import path from 'path';
import * as readline from 'readline/promises';
import { fileURLToPath } from 'url';

// ANSI sequence colors for beautiful CLI
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDistrictBot(admin: any, baseUrl: string, studentLimit: number) {
  const logPrefix = `${c.cyan}[${admin.district}]${c.reset}`;
  console.log(`${logPrefix} ${c.gray}Starting bot for ${admin.username}...${c.reset}`);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': ''
  };

  try {
    // 1. Login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: admin.username, password: admin.password })
    });
    
    if (!loginRes.ok) throw new Error('Login failed');
    
    // Extract Session Cookie
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) headers['Cookie'] = setCookie.split(';')[0];
    
    // 2. Fetch Students
    const studentsRes = await fetch(`${baseUrl}/api/students?district=${encodeURIComponent(admin.district)}&limit=5000`, { headers });
    const studentsData = await (studentsRes.json() as any);
    const students = studentsData.students || [];
    
    console.log(`${logPrefix} Found ${c.bright}${students.length}${c.reset} total students.`);

    // 3. Fill Preferences for unlocked students
    const targetStudents = students.filter((s: any) => !s.isLocked && !s.lockedBy).slice(0, studentLimit);
    
    if (targetStudents.length > 0) {
      console.log(`${logPrefix} Simulated OMR mapping for ${c.yellow}${targetStudents.length}${c.reset} unlocked students...`);
      for (const student of targetStudents) {
        const prefs = {
          stream: "Non-Medical",
          choice1: `Station 1 - ${admin.district}`,
          choice2: `Station 2 - ${admin.district}`,
          choice3: `Station 3 - ${admin.district}`,
          choice4: `Station 4 - ${admin.district}`,
          choice5: `Station 5 - ${admin.district}`
        };
        
        await fetch(`${baseUrl}/api/students/${student.id}/preferences`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(prefs)
        });
        
        // tiny micro-delay to simulate actual web traffic parsing
        await delay(50);
      }
    }

    // 4. Fetch updated students to lock them
    const updatedStudentsRes = await fetch(`${baseUrl}/api/students?district=${encodeURIComponent(admin.district)}&limit=5000`, { headers });
    const updatedStudentsData = await (updatedStudentsRes.json() as any);
    
    const unlockedStudentIds = (updatedStudentsData.students || [])
      .filter((s: any) => !s.isLocked)
      .map((s: any) => s.id);
      
    if (unlockedStudentIds.length > 0) {
      console.log(`${logPrefix} ${c.magenta}Bulk locking ${unlockedStudentIds.length} students...${c.reset}`);
      const lockRes = await fetch(`${baseUrl}/api/students/bulk-lock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ studentIds: unlockedStudentIds })
      });
      if (!lockRes.ok) throw new Error('Bulk lock failed');
    }
    
    // Abstract human interaction delay
    await delay(Math.random() * 1500 + 500);
    
    // 5. Finalize District
    console.log(`${logPrefix} ${c.yellow}Finalizing district mapping...${c.reset}`);
    const finalizeRes = await fetch(`${baseUrl}/api/districts/finalize`, {
      method: 'POST',
      headers
    });
    
    if (finalizeRes.ok) {
      console.log(`${logPrefix} ${c.green}✔ Successfully finalized!${c.reset}`);
      return true;
    } else {
      const err = await finalizeRes.text();
      throw new Error(`Finalization failed: ${err}`);
    }
  } catch (err: any) {
    console.error(`${logPrefix} ${c.red}❌ Error: ${err.message}${c.reset}`);
    return false;
  }
}

async function runCentralAdmin(centralAdmin: any, baseUrl: string) {
  console.log(`\n${c.blue}👑 [Central Admin] Logging in...${c.reset}`);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': ''
  };

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: centralAdmin.username, password: centralAdmin.password })
  });
  
  if (loginRes.ok) {
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) headers['Cookie'] = setCookie.split(';')[0];
    
    console.log(`⚙️  ${c.bright}[Central Admin] Triggering Global Target Allocation Algorithm...${c.reset}`);
    
    // Start measuring time
    const start = performance.now();
    const allocRes = await fetch(`${baseUrl}/api/allocation/run`, {
      method: 'POST',
      headers
    });
    const end = performance.now();
    
    if (allocRes.ok) {
      const data = await allocRes.json();
      console.log(`${c.green}🏆 Allocation completed successfully in ${((end - start)/1000).toFixed(2)}s!${c.reset}`);
      console.log(data);
    } else {
      const err = await allocRes.text();
      console.error(`${c.red}💥 Allocation failed: ${err}${c.reset}`);
    }
  } else {
    console.error(`${c.red}💥 Central admin login failed.${c.reset}`);
  }
}

async function runInteractiveCLI() {
  console.clear();
  console.log(`${c.bright}${c.magenta}====================================================${c.reset}`);
  console.log(`${c.bright}${c.cyan}     🚀 STATION ALLOTMENT - LOAD TEST SCENARIO      ${c.reset}`);
  console.log(`${c.bright}${c.magenta}====================================================${c.reset}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const credsPath = path.join(__dirname, 'credentials.json');
    if (!fs.existsSync(credsPath)) {
      console.error(`${c.red}❌ credentials.json not found in root directory.${c.reset}`);
      process.exit(1);
    }
    
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    let districtAdmins = creds.district_admins || [];
    const centralAdmin = creds.central_admin;

    // 1. Ask for Base URL
    const urlAnswer = await rl.question(`${c.green}?${c.reset} Target Server URL [def: http://localhost:4000]: `);
    const baseUrl = urlAnswer.trim() || 'http://localhost:4000';

    // 2. Ask for Concurrency (Number of Districts)
    const maxDistricts = districtAdmins.length;
    const districtAnswer = await rl.question(`${c.green}?${c.reset} How many concurrent district bots to run? (Max ${maxDistricts}) [def: ${maxDistricts}]: `);
    let botCount = parseInt(districtAnswer.trim());
    if (isNaN(botCount) || botCount <= 0 || botCount > maxDistricts) {
      botCount = maxDistricts;
    }
    
    // Slice admins up to user choice
    districtAdmins = districtAdmins.slice(0, botCount);

    // 3. Ask for Students per District load
    const limitAnswer = await rl.question(`${c.green}?${c.reset} Max students to randomly map & lock PER district [def: 15]: `);
    let studentLimit = parseInt(limitAnswer.trim());
    if (isNaN(studentLimit) || studentLimit <= 0) studentLimit = 15;

    // 4. Confirm start
    console.log(`\n${c.yellow}▶ Target config:${c.reset} ${botCount} Districts, up to ${studentLimit} Students each -> ${baseUrl}`);
    const ready = await rl.question(`\n${c.green}?${c.reset} Press Enter to FIRE THE LOAD TEST, or type 'n' to cancel: `);
    
    if (ready.toLowerCase() === 'n') {
      console.log('Aborted.');
      process.exit(0);
    }
    
    rl.close();
    console.log(`\n${c.bright}Letting the bots loose...${c.reset}\n`);

    // --- RUN TEST ---
    const startTime = performance.now();
    await Promise.all(districtAdmins.map((admin: any) => runDistrictBot(admin, baseUrl, studentLimit)));
    const endTime = performance.now();
    
    console.log(`\n${c.magenta}====================================================${c.reset}`);
    console.log(`🏁 All District Bots finished in ${((endTime - startTime)/1000).toFixed(2)}s.`);
    console.log(`${c.magenta}====================================================${c.reset}`);
    
    // Central Admin Allocation
    await runCentralAdmin(centralAdmin, baseUrl);
    
    console.log(`\n${c.green}✅ Interactive load test complete.${c.reset}\n`);

  } catch (err) {
    console.error(`\n${c.red}Load test script error:${c.reset}`, err);
    rl.close();
  }
}

runInteractiveCLI();
