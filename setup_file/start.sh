#!/bin/bash
set -e

echo "🔹 Starting LibreChat build & backend script"

# Navigate to client
echo "📂 Entering client folder..."
cd client

# Install client dependencies
echo "💾 Installing Vite..."
npm install vite

# Install lucide-react for client
echo "💾 Installing lucide-react..."
npm install lucide-react

echo "💾 Installing winston-daily-rotate-file..."
npm install winston-daily-rotate-file

# Re-install lucide-react and rebuild client (as requested)
echo "🔄 Ensuring lucide-react is installed and rebuilding client..."
cd client && npm install lucide-react
cd .. 
npm run build:client

# Install backend dependencies


# Start backend
echo "🚀 Starting backend..."
npm run backend
