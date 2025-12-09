#!/bin/bash
# Quick start script for Ubuntu/Linux

echo "🚀 Starting Airtable Application..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

echo "📦 Building and starting backend container..."
cd airtable-be
docker compose -f docker-compose.yml up -d --build

echo ""
echo "📦 Building and starting frontend container..."
cd ../airtable-fe  
docker compose -f docker-compose.yml up -d --build

echo ""
echo "⏳ Waiting for services to start..."
sleep 10

echo ""
echo "✅ Application started successfully!"
echo ""
echo "🌐 Access the application at:"
echo "   Frontend: http://localhost:4200"
echo "   Backend:  http://localhost:3000"
echo ""
echo "📋 Useful commands:"
echo "   View backend logs:   docker logs -f airtable-backend"
echo "   View frontend logs:  docker logs -f airtable-frontend"
echo "   Stop application:    ./stop.sh"
echo ""
