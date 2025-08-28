#!/bin/bash
# Prompt Machine MVP - Complete Setup Script
# This script sets up EVERYTHING including database

set -e  # Exit on error

echo "🚀 Prompt Machine MVP Complete Setup"
echo "===================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
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
mkdir -p prompt-machine/{api/src/{routes,services,middleware},frontend,deployed-tools,logs}
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

# Step 6: Database Setup
echo ""
echo "🗄️  Step 6: Setting up database..."
echo "Checking database connection..."

# Test connection first
PGPASSWORD=94oE1q7K psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta -c "SELECT 1" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Creating database..."
    PGPASSWORD=Uhr4ryPWey94oE1q7K psql -h sql.prompt-machine.com -U postgres << EOF
CREATE DATABASE promptmachine_dbbeta OWNER promptmachine_userbeta;
EOF
    check_status "Database created"
else
    echo -e "${GREEN}✓ Database already exists${NC}"
fi

# Step 7: Create Database Schema
echo ""
echo "📋 Step 7: Creating database schema..."
PGPASSWORD=94oE1q7K psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta << 'EOF'
-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS usage_logs CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS prompts CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Usage tracking (for billing)
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    tool_slug VARCHAR(255),
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_prompts_project ON prompts(project_id);
CREATE INDEX idx_usage_project ON usage_logs(project_id);

-- Insert default admin (temporary password)
INSERT INTO users (email, password_hash) 
VALUES ('admin@prompt-machine.com', '$2b$10$TEMP_HASH_REPLACE_ME');
EOF
check_status "Database schema created"

# Step 8: Create Basic API Server
echo ""
echo "🖥️  Step 8: Creating basic API server..."
cat > api/src/index.js << 'EOF'
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'MVP API is running!'
    });
});

// Basic routes
app.get('/', (req, res) => {
    res.json({
        name: 'Prompt Machine MVP API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            auth: '/api/auth/login',
            projects: '/api/projects'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ MVP API running on port ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
});
EOF
check_status "Basic API created"

# Step 9: Create Admin Password Hash Script
echo ""
echo "🔐 Step 9: Creating admin password script..."
cat > scripts/hash-admin-password.js << 'EOF'
const bcrypt = require('bcrypt');

async function hashPassword() {
    const password = 'Uhr4ryPWey'; // Default admin password
    const hash = await bcrypt.hash(password, 10);
    
    console.log('\nUse this SQL to update admin password:');
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@prompt-machine.com';`);
    console.log('\nDefault login credentials:');
    console.log('Email: admin@prompt-machine.com');
    console.log('Password: Uhr4ryPWey');
    console.log('\n⚠️  CHANGE THIS PASSWORD AFTER FIRST LOGIN!');
}

hashPassword().catch(console.error);
EOF
check_status "Password script created"

# Run the password hasher
cd ..
node scripts/hash-admin-password.js

# Step 10: Create Nginx Configuration
echo ""
echo "🌐 Step 10: Setting up Nginx..."
sudo tee /etc/nginx/sites-available/prompt-machine > /dev/null << EOF
server {
    listen 80;
    server_name localhost;

    # Frontend
    location / {
        root /home/$USER/prompt-machine/frontend;
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Deployed tools
    location /tools {
        alias /home/$USER/prompt-machine/deployed-tools;
        try_files \$uri \$uri/ =404;
    }
}
EOF
check_status "Nginx config created"

# Enable the site
sudo ln -sf /etc/nginx/sites-available/prompt-machine /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
check_status "Nginx configured"

# Step 11: Create Simple Frontend
echo ""
echo "🎨 Step 11: Creating basic frontend..."
cat > frontend/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Prompt Machine MVP</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto p-8">
        <h1 class="text-4xl font-bold mb-8">Prompt Machine MVP</h1>
        <div class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-2xl mb-4">Quick Test</h2>
            <button onclick="testAPI()" class="bg-blue-500 text-white px-4 py-2 rounded">
                Test API Connection
            </button>
            <div id="result" class="mt-4"></div>
        </div>
    </div>
    <script>
        async function testAPI() {
            try {
                const res = await fetch('/api/health');
                const data = await res.json();
                document.getElementById('result').innerHTML = 
                    '<pre class="bg-gray-100 p-4">' + JSON.stringify(data, null, 2) + '</pre>';
            } catch (err) {
                document.getElementById('result').innerHTML = 
                    '<p class="text-red-500">Error: ' + err.message + '</p>';
            }
        }
    </script>
</body>
</html>
EOF
check_status "Frontend created"

# Final Summary
echo ""
echo "✅ ====================================="
echo "✅ Prompt Machine MVP Setup Complete!"
echo "✅ ====================================="
echo ""
echo "📋 Next Steps:"
echo "1. Add your Claude API key to .env file:"
echo "   nano ~/prompt-machine/.env"
echo ""
echo "2. Update admin password in database:"
echo "   Copy the SQL from above and run it"
echo ""
echo "3. Start the API server:"
echo "   cd ~/prompt-machine/api"
echo "   npm start"
echo ""
echo "4. Visit your site:"
echo "   http://your-server-ip"
echo ""
echo "5. Use Claude Code to build features!"
echo ""
echo "🚀 You're ready to start building!"
