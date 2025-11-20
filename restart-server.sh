#!/bin/bash

# Restart Server Script for Station Allotment System
# This script kills any existing server process and starts a new one

echo "🔄 Restarting Station Allotment Server..."
echo ""

# Find and kill existing server processes
echo "1️⃣  Stopping existing server processes..."
PIDS=$(lsof -ti:5000,5050 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "   Found processes on ports 5000/5050: $PIDS"
  kill -9 $PIDS 2>/dev/null
  sleep 2
  echo "   ✅ Stopped existing processes"
else
  echo "   ℹ️  No existing server processes found"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo ""
  echo "⚠️  Warning: .env file not found"
  echo "   Make sure DATABASE_URL and SESSION_SECRET are set"
fi

# Start the server
echo ""
echo "2️⃣  Starting server..."
echo "   Command: npm run dev"
echo "   Press Ctrl+C to stop the server"
echo ""
npm run dev
