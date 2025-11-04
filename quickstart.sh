#!/bin/bash
# Quick Start Script for TopstepX Trading Platform

echo "================================================"
echo "TopstepX Trading Platform - Quick Start"
echo "================================================"
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed."
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"
echo "✓ Node.js found: $(node --version)"
echo ""

# Setup Backend
echo "Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "  Creating virtual environment..."
    python3 -m venv venv
fi

echo "  Activating virtual environment..."
source venv/bin/activate

echo "  Installing Python dependencies..."
pip install -q -r requirements.txt

echo "✓ Backend setup complete"
echo ""

# Setup Frontend
echo "Setting up frontend..."
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "  Installing Node dependencies..."
    npm install --silent
fi

echo "✓ Frontend setup complete"
echo ""

# Instructions
echo "================================================"
echo "Setup Complete!"
echo "================================================"
echo ""
echo "To start the platform:"
echo ""
echo "1. Start the backend API server:"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   python app.py"
echo ""
echo "2. In a new terminal, start the frontend:"
echo "   cd frontend"
echo "   npm start"
echo ""
echo "3. Open your browser to http://localhost:3000"
echo ""
echo "================================================"
