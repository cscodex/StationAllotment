#!/usr/bin/env tsx
/**
 * Test the API endpoint directly to see what's being returned
 */

import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:5000";
const USERNAME = "central_admin";
const PASSWORD = "admin123";

let sessionCookie: string = "";

async function login() {
  console.log("1️⃣  Logging in...");
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${await response.text()}`);
  }

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    sessionCookie = setCookie.split(";")[0];
    console.log("   ✅ Login successful\n");
  } else {
    throw new Error("No session cookie received");
  }
}

async function testEndpoint() {
  console.log("2️⃣  Testing API endpoint...\n");
  
  const academicYear = "2024-2025";
  const url = `${API_BASE}/api/counseling-rounds?academicYear=${encodeURIComponent(academicYear)}`;
  
  console.log(`   URL: ${url}`);
  console.log(`   Cookie: ${sessionCookie.substring(0, 50)}...\n`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: sessionCookie,
      },
      credentials: "include",
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ Error: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log(`   ✅ Response received`);
    console.log(`   Type: ${Array.isArray(data) ? 'Array' : typeof data}`);
    console.log(`   Length: ${Array.isArray(data) ? data.length : 'N/A'}\n`);

    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log("   ⚠️  No rounds returned (empty array)");
      } else {
        console.log(`   📊 Found ${data.length} rounds:\n`);
        data.forEach((round: any, index: number) => {
          console.log(`   ${index + 1}. ${round.roundName || 'Unnamed'} - Round ${round.roundNumber}`);
          console.log(`      Academic Year: ${round.academicYear}`);
          console.log(`      Dates: ${round.startDate} to ${round.endDate}`);
          console.log(`      Status: ${round.isActive ? 'Active' : round.isCompleted ? 'Completed' : 'Inactive'}`);
        });
      }
    } else {
      console.log("   Response data:", JSON.stringify(data, null, 2));
    }

  } catch (error: any) {
    console.error(`   ❌ Request failed: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
  }
}

async function main() {
  try {
    await login();
    await testEndpoint();
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

main();


