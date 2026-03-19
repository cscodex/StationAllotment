import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

const BASE_URL = 'http://localhost:4000'; // Target local server to prevent Cloudinary rate limits

// 1. Load credentials securely
const credentials = new SharedArray('credentials', function () {
  return [JSON.parse(open('./credentials.json'))];
});

// 2. Load the binary simulated OMR image into memory ONLY ONCE
const dummyOmr = open('./dummy-omr.png', 'b');

// Configure the Load Test to spin up 23 Virtual Users (bots) concurrently
export const options = {
  scenarios: {
    omr_stress_test: {
      executor: 'per-vu-iterations',
      vus: credentials[0].district_admins.length, // Spawn exactly one bot per district Admin
      iterations: 1, // Run the lifecycle exactly once per bot
      maxDuration: '5m', // Give the local server up to 5 mins to chunk through 100s of images
    },
  },
  thresholds: {
    // Generous thresholds since local image OCR is intensely CPU heavy
    http_req_duration: ['p(95)<10000'], // 95% of OMR uploads must finish under 10 seconds
    http_req_failed: ['rate<0.05'], // Max 5% failure rate
  },
};

export default function () {
  const adminIndex = __VU - 1; 
  const admin = credentials[0].district_admins[adminIndex];
  
  if (!admin) return;

  const payload = JSON.stringify({ username: admin.username, password: admin.password });
  const params = { headers: { 'Content-Type': 'application/json' } };

  // --- LOGIN ---
  let res = http.post(`${BASE_URL}/api/auth/login`, payload, params);
  check(res, { 'logged in successfully': (r) => r.status === 200 });
  
  const cookieHeader = res.headers['Set-Cookie'];
  if (cookieHeader) params.headers['Cookie'] = cookieHeader.split(';')[0];


  // --- FETCH STUDENTS ---
  res = http.get(`${BASE_URL}/api/students?district=${encodeURIComponent(admin.district)}&limit=5000`, params);
  const students = res.json('students') || [];
  
  let processedCount = 0;
  // Grab up to 20 students to hammer the CPU with OMR uploads
  const targetStudents = students.slice(0, 20); 

  for (const student of targetStudents) {
    if (student.isLocked || student.lockedBy) continue;
    
    // --- UPLOAD OMR IMAGE (Heavy CPU/Disk task) ---
    // K6 natively sends multipart/form-data when passing a Javascript object containing http.file
    const uploadData = {
      image: http.file(dummyOmr, 'dummy-omr.png', 'image/png')
    };
    
    // Note: Do not explicitly set Content-Type header to multipart/form-data. 
    // K6 will automatically append the correct exact boundary string if we delete the header block.
    const uploadParams = { headers: { 'Cookie': params.headers['Cookie'] } };
    
    let omrRes = http.post(`${BASE_URL}/api/students/${student.id}/omr-image`, uploadData, uploadParams);
    check(omrRes, { 'omr image uploaded & processed': (r) => r.status === 200 || r.status === 201 });

    // --- SAVE OMR PREFERENCES METADATA ---
    const prefs = JSON.stringify({
      stream: "Non-Medical",
      choice1: `Station 1 - ${admin.district}`,
      choice2: `Station 2 - ${admin.district}`,
      choice3: `Station 3 - ${admin.district}`,
      choice4: `Station 4 - ${admin.district}`,
      choice5: `Station 5 - ${admin.district}`
    });

    let prefRes = http.put(`${BASE_URL}/api/students/${student.id}/preferences`, prefs, params);
    check(prefRes, { 'preferences attached': (r) => r.status === 200 });

    processedCount++;
    // Human scanning interval (wait a half second between sheet scans)
    sleep(0.5);
  }

  // --- BULK LOCK ---
  if (processedCount > 0) {
    const unlockedIds = targetStudents.filter(s => !s.isLocked).map(s => s.id);
    let lockRes = http.post(`${BASE_URL}/api/students/bulk-lock`, JSON.stringify({ studentIds: unlockedIds }), params);
    check(lockRes, { 'bulk lock successful': (r) => r.status === 200 });
  }

  sleep(1); 

  // --- FINALIZE ---
  let finalizeRes = http.post(`${BASE_URL}/api/districts/finalize`, null, params);
  check(finalizeRes, { 'finalize district successful': (r) => r.status === 200 });
}

// Teardown executes Exactly ONCE after all Virtual Users Complete!
export function teardown() {
  const centralAdmin = credentials[0].central_admin;
  const payload = JSON.stringify({ username: centralAdmin.username, password: centralAdmin.password });
  const params = { headers: { 'Content-Type': 'application/json' } };

  console.log('🤖 All OMR Stress Tests finished. Central Admin kicking off allocation!');

  let res = http.post(`${BASE_URL}/api/auth/login`, payload, params);
  if (res.headers['Set-Cookie']) params.headers['Cookie'] = res.headers['Set-Cookie'].split(';')[0];

  let allocRes = http.post(`${BASE_URL}/api/allocation/run`, null, params);
  if (allocRes.status === 200) {
    console.log('🎉 Central Allocation Completed Successfully over Local Load Test Dataset!');
  } else {
    console.error(`💥 Central Allocation Failed: Status ${allocRes.status}`);
  }
}

export function handleSummary(data) {
  return {
    "load-test-omr-report.html": htmlReport(data),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
