#!/usr/bin/env tsx
/**
 * Test creating counseling rounds via API endpoint
 */

import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:5000";
const USERNAME = "central_admin";
const PASSWORD = "admin123";

let sessionCookie: string = "";

async function login() {
  console.log("1️⃣  Logging in as central admin...");
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: USERNAME,
      password: PASSWORD,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed: ${error}`);
  }

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    sessionCookie = setCookie.split(";")[0];
    console.log("   ✅ Login successful\n");
  } else {
    throw new Error("No session cookie received");
  }
}

async function createCounselingRounds() {
  console.log("2️⃣  Creating counseling rounds via API...\n");
  
  const rounds = [
    {
      academicYear: "2024-2025",
      roundName: "Demo Counseling",
      startDate: "2024-06-15T09:00",
      endDate: "2024-06-30T18:00",
    },
    {
      academicYear: "2024-2025",
      roundName: "Demo Counseling",
      startDate: "2024-07-15T09:00",
      endDate: "2024-07-31T18:00",
    },
    {
      academicYear: "2024-2025",
      roundName: "Demo Counseling",
      startDate: "2024-08-15T09:00",
      endDate: "2024-08-31T18:00",
    },
    {
      academicYear: "2024-2025",
      roundName: "Demo Counseling",
      startDate: "2024-09-15T09:00",
      endDate: "2024-09-30T18:00",
    },
  ];

  console.log(`   Sending request with ${rounds.length} rounds:`);
  rounds.forEach((r, i) => {
    console.log(`      Round ${i + 1}: ${r.startDate} to ${r.endDate}`);
  });
  console.log();

  try {
    const response = await fetch(`${API_BASE}/api/counseling-rounds/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ rounds }),
    });

    console.log(`   Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ Error response: ${errorText}`);
      throw new Error(`API request failed: ${errorText}`);
    }

    const data = await response.json();
    console.log(`   ✅ Response received:`);
    console.log(`      Type: ${Array.isArray(data) ? 'Array' : typeof data}`);
    console.log(`      Length: ${Array.isArray(data) ? data.length : 'N/A'}`);
    
    if (Array.isArray(data)) {
      console.log(`\n   Created rounds:`);
      data.forEach((round: any, index: number) => {
        console.log(`      ${index + 1}. ${round.roundName} - Round ${round.roundNumber}`);
        console.log(`         ID: ${round.id}`);
        console.log(`         Dates: ${round.startDate} to ${round.endDate}`);
      });
    } else {
      console.log(`   Response data:`, JSON.stringify(data, null, 2));
    }

    return data;
  } catch (error: any) {
    console.error(`   ❌ Request failed: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    throw error;
  }
}

async function verifyRounds() {
  console.log("\n3️⃣  Verifying rounds in database...\n");
  
  const response = await fetch(`${API_BASE}/api/counseling-rounds?academicYear=2024-2025`, {
    method: "GET",
    headers: {
      Cookie: sessionCookie,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch rounds: ${error}`);
  }

  const data = await response.json();
  const demoRounds = data.filter((r: any) => r.roundName === "Demo Counseling");
  
  console.log(`   ✅ Found ${demoRounds.length} "Demo Counseling" rounds:`);
  demoRounds.forEach((round: any) => {
    console.log(`      Round ${round.roundNumber}: ${round.startDate} to ${round.endDate}`);
  });
}

async function main() {
  try {
    await login();
    await createCounselingRounds();
    await verifyRounds();
    
    console.log("\n✅ All tests completed!");
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

main();


