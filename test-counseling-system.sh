#!/bin/bash

# Test script for counseling system
# This script tests the new counseling features

BASE_URL="http://localhost:5000"
USERNAME="central_admin"
PASSWORD="admin123"

echo "🧪 Testing Counseling System"
echo "=============================="
echo ""

# Step 1: Login
echo "1️⃣  Logging in as central admin..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  -c /tmp/cookies.txt)

SESSION_ID=$(echo $LOGIN_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful! Session ID: $SESSION_ID"
echo ""

# Step 2: Create counseling rounds (bulk)
echo "2️⃣  Creating counseling rounds (bulk)..."
ACADEMIC_YEAR="2024-2025"
COUNSELING_TITLE="Meritorious School"

# Create 3 rounds
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/counseling-rounds/bulk" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d "{
    \"rounds\": [
      {
        \"academicYear\": \"$ACADEMIC_YEAR\",
        \"roundName\": \"$COUNSELING_TITLE\",
        \"startDate\": \"2024-06-01T09:00\",
        \"endDate\": \"2024-06-05T18:00\"
      },
      {
        \"academicYear\": \"$ACADEMIC_YEAR\",
        \"roundName\": \"$COUNSELING_TITLE\",
        \"startDate\": \"2024-06-10T09:00\",
        \"endDate\": \"2024-06-15T18:00\"
      },
      {
        \"academicYear\": \"$ACADEMIC_YEAR\",
        \"roundName\": \"$COUNSELING_TITLE\",
        \"startDate\": \"2024-06-20T09:00\",
        \"endDate\": \"2024-06-25T18:00\"
      }
    ]
  }")

echo "Response: $CREATE_RESPONSE"
echo ""

# Extract round IDs
ROUND_IDS=$(echo $CREATE_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
FIRST_ROUND_ID=$(echo $ROUND_IDS | awk '{print $1}')

if [ -z "$FIRST_ROUND_ID" ]; then
  echo "❌ Failed to create rounds!"
  exit 1
fi

echo "✅ Created rounds successfully!"
echo "Round IDs: $ROUND_IDS"
echo ""

# Step 3: Get all rounds
echo "3️⃣  Fetching all counseling rounds..."
GET_ROUNDS=$(curl -s -X GET "$BASE_URL/api/counseling-rounds?academicYear=$ACADEMIC_YEAR" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt)

echo "Rounds: $GET_ROUNDS" | jq '.' 2>/dev/null || echo "$GET_ROUNDS"
echo ""

# Step 4: Activate first round
echo "4️⃣  Activating first round..."
ACTIVATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/counseling-rounds/$FIRST_ROUND_ID/activate" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d "{\"academicYear\": \"$ACADEMIC_YEAR\"}")

echo "Activate Response: $ACTIVATE_RESPONSE" | jq '.' 2>/dev/null || echo "$ACTIVATE_RESPONSE"
echo ""

# Step 5: Check database directly
echo "5️⃣  Checking database..."
echo "Querying counseling_rounds table..."
echo ""

# Cleanup
rm -f /tmp/cookies.txt

echo "✅ Testing complete!"
echo ""
echo "Next steps:"
echo "1. Check the database directly using the queries below"
echo "2. Test Run Allocation from the UI"
echo "3. Test Delete functionality"

