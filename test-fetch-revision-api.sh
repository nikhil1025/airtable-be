#!/bin/bash

echo "=============================================================="
echo "🚀 Testing Revision History Fetch API"
echo "=============================================================="
echo ""
echo "📡 Making request to: http://localhost:3000/api/revision-history-fetch/fetch/user_1764525443009"
echo ""
echo "⏳ This will take some time as it scrapes all tickets..."
echo ""
echo "=============================================================="
echo ""

curl -X GET "http://localhost:3000/api/revision-history-fetch/fetch/user_1764525443009" \
  -H "Content-Type: application/json" \
  2>&1

echo ""
echo ""
echo "=============================================================="
echo "✅ API Request Completed"
echo "=============================================================="
