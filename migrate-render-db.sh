#!/bin/bash
# Script to migrate Render database
# Usage: ./migrate-render-db.sh "your-database-connection-string"

if [ -z "$1" ]; then
  echo "❌ Error: Database connection string required"
  echo ""
  echo "Usage: ./migrate-render-db.sh \"postgresql://user:pass@host/db?sslmode=require\""
  echo ""
  echo "To get your connection string:"
  echo "1. Go to Render Dashboard → Your Service → Environment"
  echo "2. Copy the DATABASE_URL value"
  echo "3. Run: ./migrate-render-db.sh \"[paste-connection-string]\""
  exit 1
fi

export DATABASE_URL="$1"

echo "🔌 Connecting to database..."
echo "📋 Running migrations..."
echo ""

npm run db:migrate

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migrations completed successfully!"
  echo ""
  echo "🔍 Verifying database health..."
  npx tsx check-database-health.ts
else
  echo ""
  echo "❌ Migration failed. Please check the error above."
  exit 1
fi

