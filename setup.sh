#!/bin/bash

# Democracy OS - Quick Setup Script
# This script helps you get started with Democracy OS in minutes

echo "🗳️  Democracy OS - Quick Setup"
echo "================================"
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

echo "✓ pnpm found"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✓ Docker is running"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1/4: Installing dependencies..."
pnpm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Step 2: Copy environment file
if [ ! -f ".env" ]; then
    echo "📝 Step 2/4: Creating .env file..."
    cp .env.example .env
    echo "✓ .env file created"
else
    echo "📝 Step 2/4: .env file already exists, skipping..."
fi
echo ""

# Step 3: Start Docker services
echo "🐳 Step 3/4: Starting Docker services (PostgreSQL, Redis, MinIO)..."
pnpm docker:up

if [ $? -ne 0 ]; then
    echo "❌ Failed to start Docker services"
    exit 1
fi

echo "✓ Docker services started"
echo ""
echo "⏳ Waiting 10 seconds for services to be ready..."
sleep 10
echo ""

# Step 4: Run database migrations
echo "🗄️  Step 4/4: Running database migrations..."
pnpm db:migrate

if [ $? -ne 0 ]; then
    echo "❌ Failed to run migrations"
    echo "   Try running: pnpm db:migrate"
    exit 1
fi

echo "✓ Database migrations complete"
echo ""

# Success message
echo "================================"
echo "✅ Setup complete!"
echo ""
echo "To start the development servers:"
echo ""
echo "  # Start both API and Web in parallel:"
echo "  pnpm dev"
echo ""
echo "  # Or start them separately:"
echo "  pnpm api   # API server"
echo "  pnpm web   # Frontend"
echo ""
echo "Then visit:"
echo "  Frontend: http://localhost:3000"
echo "  API:      http://localhost:3001"
echo ""
echo "🎉 Happy voting!"
