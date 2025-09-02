#!/bin/bash
# Prompt Machine MVP - Setup Script for Manual PostgreSQL Auth
# This version works with servers that require interactive password entry

set -e  # Exit on error

echo "🚀 Prompt Machine MVP Setup (Manual Auth Version)"
echo "==============================================="
echo ""
echo "⚠️  NOTE: You'll need to enter PostgreSQL passwords when prompted"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1 failed${NC}"
        exit 1
    fi
}

# Step 1: Install System Dependencies
echo "📦 Step 1: Installing system dependencies..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
check_status "Node.js repository added"

sudo apt update
sudo apt install -y nodejs nginx postgresql-client
check_status "Dependencies installed"

# Step 2: Create Project Structure
echo ""
echo "📁 Step 2: Creating project structure..."
cd ~
mkdir -p prompt-machine/{api/src/{routes,services,middleware},frontend,deployed-tools,logs,scripts}
cd prompt-machine
check_status "Directories created"

# Step 3: Create Package.json
echo ""
echo "📄 Step 3: Creating package.json..."
cd api
cat > package.json << 'EOF'
{
  "name": "prompt-machine-mvp",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.3.1",
    "axios": "^1.5.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF
check_status "package.json created"

# Step 4: Install NPM Dependencies
echo ""
echo "📦 Step 4: Installing NPM packages..."
npm install
check_status "NPM packages installed"

# Step 5: Create Environment File
echo ""
echo "🔧 Step 5: Creating .env file..."
cd ..
cat > .env << EOF
# Database
DB_HOST=sql.prompt-machine.com
DB_PORT=5432
DB_NAME=promptmachine_dbbeta
DB_USER=promptmachine_userbeta
DB_PASSWORD=94oE1q7K

# App
PORT=3001
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

# Claude API (YOU MUST ADD YOUR KEY)
CLAUDE_API_KEY=

# Domains
APP_URL=http://localhost:3001
EOF
check_status ".env file created"

# Step 6: Database Setup - Save SQL to file first
echo ""
echo "🗄️  Step 6: Setting up database..."
echo ""
echo -e "${YELLOW}Manual database setup required:${NC}"
echo ""

# Create database setup SQL file
cat > scripts/setup-database.sql << 'EOF'
-- Check and create user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'promptmachine_userbeta') THEN
        CREATE USER promptmachine_userbeta WITH PASSWORD '94oE1q7K';
        RAISE NOTICE 'User promptmachine_userbeta created';
    ELSE
        RAISE NOTICE 'User promptmachine_userbeta already exists';
    END IF;
END$$;

-- Check and create database
SELECT 'Checking for database...' as status;
\set ON_ERROR_STOP off
CREATE DATABASE promptmachine_dbbeta OWNER promptmachine_userbeta;
\set ON_ERROR_STOP on

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE promptmachine_dbbeta TO promptmachine_userbeta;

-- Show result
\l promptmachine_dbbeta
\echo 'Database setup complete!'
EOF

echo "Running database setup..."
echo "When prompted for password, enter: ${YELLOW}Uhr4ryPWey94oE1q7K${NC}"
echo ""
echo "Press Enter when ready..."
read

psql -h sql.prompt-machine.com -U postgres -f scripts/setup-database.sql

check_status "Database setup completed"

# Step 7: Create Schema - Save SQL to file
echo ""
echo "📋 Step 7: Creating database schema..."

cat > scripts/create-schema.sql << 'EOF'
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables for clean setup
DROP TABLE IF EXISTS usage_logs CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS prompts CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users (simple version)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prompts (simplified)
CREATE TABLE prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    system_prompt TEXT,
    fields JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations (for prompt builder)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage tracking
CREATE TABLE usage_logs (