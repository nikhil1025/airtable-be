#!/bin/bash

echo "=============================================================="
echo "🚀 Calling Revision History Fetch API"
echo "=============================================================="
echo ""
echo "📡 Endpoint: http://localhost:3000/api/revision-history-fetch/fetch/user_1764525443009"
echo "👤 User ID: user_1764525443009"
echo ""
echo "⏳ This may take a few minutes as it scrapes all tickets..."
echo ""
echo "=============================================================="
echo ""

# Make the API call and display response
curl -X GET "http://localhost:3000/api/revision-history-fetch/fetch/user_1764525443009" \
  -H "Content-Type: application/json" \
  2>&1

echo ""
echo ""
echo "=============================================================="
echo "✅ API Call Completed"
echo "=============================================================="
