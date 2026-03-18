import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

const BASE_URL = 'http://localhost:5000'; // Make sure your server is running

// Parse credentials securely into K6 memory
const credentials = new SharedArray('credentials', function () {
  return [JSON.parse(open('./credentials.json'))];
});

// Configure the Load Test to run exactly 1 iteration per Virtual User (VU) for 23 VUs
export const options = {
  scenarios: {
    district_flow: {
      executor: 'per-vu-iterations',
      vus: credentials[0].district_admins.length, // Spin up exactly one bot per district
      iterations: 1, // Run the lifecycle once per bot
      maxDuration: '2m', // Hard stop after 2 mins if backends stall
    },
  },
  thresholds: {
    // Failing thresholds if the application is performing poorly
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'], // Max 5% failure rate
  },
};

export default function () {
  // __VU is a k6 global variable representing the Virtual User ID (1-based index)
  const adminIndex = __VU - 1; 
  const admin = credentials[0].district_admins[adminIndex];
  
  if (!admin) {
    console.warn(`VU ${__VU} mapped to undefined admin. Checking credentials.`);
    return;
  }

  const payload = JSON.stringify({ username: admin.username, password: admin.password });
  const params = { headers: { 'Content-Type': 'application/json' } };

  // 1. Auth Login
  let res = http.post(`${BASE_URL}/api/auth/login`, payload, params);
  check(res, { 'logged in successfully': (r) => r.status === 200 });
  
  // Extract Session Cookie returned from passport/express
  const cookieHeader = res.headers['Set-Cookie'];
  if (cookieHeader) {
     params.headers['Cookie'] = cookieHeader.split(';')[0];
  }

  // 2. Load Dashboard Data (mimicking realistic browser hit payload)
  res = http.get(`${BASE_URL}/api/district-status`, params);
  
  // 3. Fetch specific District Students
  res = http.get(`${BASE_URL}/api/students?district=${encodeURIComponent(admin.district)}&limit=5000`, params);
  check(res, { 'fetched students successfully': (r) => r.status === 200 });
  
  const students = res.json('students') || [];
  
  let updatedCount = 0;
  // 4. Update Preferences for 10 random unlocked students to save test time, 
  // or simulate actual system pressure by iterating over all of them
  const sampleStudents = students.slice(0, 15); 
  for (const student of sampleStudents) {
    if (student.isLocked || student.lockedBy) continue;
    
    const prefs = JSON.stringify({
      stream: "Non-Medical",
      choice1: `Station 1 - ${admin.district}`,
      choice2: `Station 2 - ${admin.district}`,
      choice3: `Station 3 - ${admin.district}`,
      choice4: `Station 4 - ${admin.district}`,
      choice5: `Station 5 - ${admin.district}`
    });

    let prefRes = http.put(`${BASE_URL}/api/students/${student.id}/preferences`, prefs, params);
    check(prefRes, { 'preferences updated': (r) => r.status === 200 });
    updatedCount++;
    
    // Tiny human jitter pause
    sleep(Math.random() * 0.1);
  }

  // 5. Bulk Lock Simulated Students
  const unlockedIds = sampleStudents.filter(s => !s.isLocked).map(s => s.id);
  if (unlockedIds.length > 0) {
    let lockRes = http.post(`${BASE_URL}/api/students/bulk-lock`, JSON.stringify({ studentIds: unlockedIds }), params);
    check(lockRes, { 'bulk lock successful': (r) => r.status === 200 });
  }

  sleep(0.5); // Think time before finalizing

  // 6. Finalize the District
  let finalizeRes = http.post(`${BASE_URL}/api/districts/finalize`, null, params);
  check(finalizeRes, { 'finalize district successful': (r) => r.status === 200 });
}

// Teardown executes Exactly ONCE after all Virtual Users Complete!
export function teardown() {
  const centralAdmin = credentials[0].central_admin;
  const payload = JSON.stringify({ username: centralAdmin.username, password: centralAdmin.password });
  const params = { headers: { 'Content-Type': 'application/json' } };

  console.log('🤖 All 23 VUs finished. Central Admin kicking off allocation!');

  let res = http.post(`${BASE_URL}/api/auth/login`, payload, params);
  if (res.headers['Set-Cookie']) {
     params.headers['Cookie'] = res.headers['Set-Cookie'].split(';')[0];
  }

  let allocRes = http.post(`${BASE_URL}/api/allocation/run`, null, params);
  if (allocRes.status === 200) {
    console.log('🎉 Central Allocation Completed Successfully over Load Test Dataset!');
  } else {
    console.error(`💥 Central Allocation Failed: Status ${allocRes.status}`);
  }
}

// Custom Report Generation Hook
export function handleSummary(data) {
  return {
    // Generates a beautiful HTML report locally to visualize performance
    "load-test-report.html": htmlReport(data),
    // Prints a nice looking summary in your terminal
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
