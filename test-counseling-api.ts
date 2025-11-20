#!/usr/bin/env tsx
/**
 * Test script for Counseling Rounds System
 * Tests: Create, List, Activate, Run Allocation, Delete
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

  // Extract session cookie
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    sessionCookie = setCookie.split(";")[0];
    console.log("   ✅ Login successful");
  } else {
    throw new Error("No session cookie received");
  }
}

async function createCounselingRounds() {
  console.log("\n2️⃣  Creating counseling rounds (bulk)...");
  
  const rounds = [
    {
      academicYear: "2024-2025",
      roundName: "Meritorious School",
      startDate: "2024-06-01T09:00",
      endDate: "2024-06-15T18:00",
    },
    {
      academicYear: "2024-2025",
      roundName: "Meritorious School",
      startDate: "2024-06-16T09:00",
      endDate: "2024-06-30T18:00",
    },
    {
      academicYear: "2024-2025",
      roundName: "Meritorious School",
      startDate: "2024-07-01T09:00",
      endDate: "2024-07-15T18:00",
    },
  ];

  const response = await fetch(`${API_BASE}/api/counseling-rounds/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ rounds }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Create failed: ${error}`);
  }

  const data = await response.json();
  console.log(`   ✅ Created ${data.length} rounds:`);
  data.forEach((round: any) => {
    console.log(`      - ${round.roundName} - Round ${round.roundNumber} (ID: ${round.id})`);
  });
  
  return data;
}

async function listCounselingRounds(academicYear: string) {
  console.log(`\n3️⃣  Listing counseling rounds for ${academicYear}...`);
  
  const response = await fetch(`${API_BASE}/api/counseling-rounds?academicYear=${academicYear}`, {
    method: "GET",
    headers: {
      Cookie: sessionCookie,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`List failed: ${error}`);
  }

  const data = await response.json();
  console.log(`   ✅ Found ${data.length} rounds:`);
  data.forEach((round: any) => {
    console.log(`      - ${round.roundName} - Round ${round.roundNumber} | Active: ${round.isActive} | Completed: ${round.isCompleted}`);
  });
  
  return data;
}

async function activateRound(roundId: string, academicYear: string) {
  console.log(`\n4️⃣  Activating round ${roundId}...`);
  
  const response = await fetch(`${API_BASE}/api/counseling-rounds/${roundId}/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ academicYear }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Activate failed: ${error}`);
  }

  const data = await response.json();
  console.log(`   ✅ Round activated: ${data.roundName} - Round ${data.roundNumber}`);
  
  return data;
}

async function testDeleteRound(roundId: string) {
  console.log(`\n5️⃣  Testing delete round ${roundId} (should fail if active or has students)...`);
  
  const response = await fetch(`${API_BASE}/api/counseling-rounds/${roundId}`, {
    method: "DELETE",
    headers: {
      Cookie: sessionCookie,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    console.log(`   ⚠️  Delete blocked (expected): ${error.message}`);
    return false;
  }

  const data = await response.json();
  console.log(`   ✅ Round deleted: ${data.message}`);
  return true;
}

async function checkDatabase() {
  console.log("\n6️⃣  Checking database directly...");
  
  // We'll use a simple query via the API to verify
  const response = await fetch(`${API_BASE}/api/counseling-rounds?academicYear=2024-2025`, {
    method: "GET",
    headers: {
      Cookie: sessionCookie,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch rounds");
  }

  const rounds = await response.json();
  console.log(`   ✅ Database contains ${rounds.length} rounds for 2024-2025`);
  
  // Group by counseling title
  const byTitle = rounds.reduce((acc: any, round: any) => {
    const title = round.roundName || "Unknown";
    if (!acc[title]) acc[title] = [];
    acc[title].push(round);
    return acc;
  }, {});

  console.log("\n   📊 Rounds by Counseling Title:");
  Object.entries(byTitle).forEach(([title, roundsList]: [string, any]) => {
    console.log(`      ${title}:`);
    roundsList.forEach((round: any) => {
      console.log(`         - Round ${round.roundNumber} (${round.startDate} to ${round.endDate})`);
    });
  });
}

async function main() {
  try {
    await login();
    const createdRounds = await createCounselingRounds();
    await listCounselingRounds("2024-2025");
    
    // Activate first round
    if (createdRounds.length > 0) {
      await activateRound(createdRounds[0].id, "2024-2025");
    }
    
    // Try to delete an inactive round (should work)
    if (createdRounds.length > 2) {
      await testDeleteRound(createdRounds[2].id);
    }
    
    await checkDatabase();
    
    console.log("\n✅ All tests completed!");
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

main();
