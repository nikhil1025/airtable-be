#!/bin/bash
# Stop script for Ubuntu/Linux

echo "🛑 Stopping Airtable Application..."
echo ""

cd airtable-be
docker compose down

cd ../airtable-fe
docker compose down

echo ""
echo "✅ Application stopped successfully!"
