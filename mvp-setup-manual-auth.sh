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

\echo 'Schema created successfully!'
\dt
EOF

echo ""
echo "When prompted for password, enter: ${YELLOW}94oE1q7K${NC}"
echo "Press Enter when ready..."
read

psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta -f scripts/create-schema.sql

check_status "Schema created"

# Step 8: Create Basic API Server
echo ""
echo "🖥️  Step 8: Creating basic API server..."
cat > api/src/index.js << 'EOF'
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('✅ Database connected:', res.rows[0].now);
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT 1');
        res.json({ 
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
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
check_status "API server created"

# Step 9: Create Admin Password Hash Script
echo ""
echo "🔐 Step 9: Creating admin password script..."
cat > scripts/hash-admin-password.js << 'EOF'
const bcrypt = require('bcrypt');

async function hashPassword() {
    const password = 'Uhr4ryPWey'; // Default admin password
    const hash = await bcrypt.hash(password, 10);
    
    console.log('\n===========================================');
    console.log('Admin Password Hash Generated!');
    console.log('===========================================\n');
    console.log('Copy this SQL and run it:\n');
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@prompt-machine.com';`);
    console.log('\n===========================================');
    console.log('Default login credentials:');
    console.log('Email: admin@prompt-machine.com');
    console.log('Password: Uhr4ryPWey');
    console.log('\n⚠️  CHANGE THIS PASSWORD AFTER FIRST LOGIN!');
    console.log('===========================================\n');
}

hashPassword().catch(console.error);
EOF
check_status "Password script created"

# Generate password hash
echo ""
echo "Generating admin password hash..."
cd api && node ../scripts/hash-admin-password.js && cd ..

# Save update script
echo ""
echo "Saving password update script..."
HASH_OUTPUT=$(cd api && node -e "const bcrypt=require('bcrypt'); bcrypt.hash('Uhr4ryPWey',10).then(h=>console.log(h))" && cd ..)
cat > scripts/update-admin-password.sql << EOF
UPDATE users SET password_hash = '$HASH_OUTPUT' WHERE email = 'admin@prompt-machine.com';
EOF
echo -e "${GREEN}✓ Password update script saved to scripts/update-admin-password.sql${NC}"

# Step 10: Create Nginx Configuration
echo ""
echo "🌐 Step 10: Setting up Nginx..."
sudo tee /etc/nginx/sites-available/prompt-machine > /dev/null << EOF
server {
    listen 80;
    server_name _;

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

# Enable site
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
        <h1 class="text-4xl font-bold mb-8">🚀 Prompt Machine MVP</h1>
        <div class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-2xl mb-4">Setup Complete! ✅</h2>
            <p class="mb-4">Your MVP is ready. Click below to test the API:</p>
            <button onclick="testAPI()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                Test API Connection
            </button>
            <div id="result" class="mt-4"></div>
        </div>
        
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
            <p class="font-bold">⚠️ Final Steps:</p>
            <ol class="list-decimal ml-6 mt-2">
                <li>Update admin password in database</li>
                <li>Add Claude API key to .env file</li>
                <li>Start the API server with: npm start</li>
            </ol>
        </div>
    </div>
    <script>
        async function testAPI() {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '<p class="text-gray-500">Testing...</p>';
            
            try {
                const res = await fetch('/api/health');
                const data = await res.json();
                resultDiv.innerHTML = 
                    '<pre class="bg-gray-100 p-4 rounded overflow-auto">' + 
                    JSON.stringify(data, null, 2) + 
                    '</pre>';
            } catch (err) {
                resultDiv.innerHTML = 
                    '<p class="text-red-500">Error: ' + err.message + '</p>';
            }
        }
    </script>
</body>
</html>
EOF
check_status "Frontend created"

# Create helper script for database access
echo ""
echo "📝 Creating database helper script..."
cat > scripts/db-connect.sh << 'EOF'
#!/bin/bash
# Database connection helper

echo "Connecting to Prompt Machine database..."
echo "Password is: 94oE1q7K"
echo ""
psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta
EOF
chmod +x scripts/db-connect.sh

# Final Summary
echo ""
echo ""
echo "✅ =============================================="
echo "✅ Prompt Machine MVP Setup Complete!"
echo "✅ =============================================="
echo ""
echo "📋 FINAL STEPS (Manual):"
echo ""
echo "1️⃣  Update admin password in database:"
echo "   ${YELLOW}psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta -f scripts/update-admin-password.sql${NC}"
echo "   Password: ${YELLOW}94oE1q7K${NC}"
echo ""
echo "2️⃣  Add your Claude API key:"
echo "   ${YELLOW}nano ~/prompt-machine/.env${NC}"
echo "   Add your key to CLAUDE_API_KEY="
echo ""
echo "3️⃣  Start the API server:"
echo "   ${YELLOW}cd ~/prompt-machine/api${NC}"
echo "   ${YELLOW}npm start${NC}"
echo ""
echo "4️⃣  Visit your site:"
echo "   ${YELLOW}http://$(hostname -I | awk '{print $1}')${NC}"
echo ""
echo "📁 Helper Scripts Created:"
echo "   - scripts/db-connect.sh - Quick database connection"
echo "   - scripts/update-admin-password.sql - Run this to set admin password"
echo ""
echo "💡 Since .pgpass doesn't work with your server, you'll need to"
echo "   enter passwords manually when connecting to the database."
echo ""
echo "🚀 You're ready to build with Claude Code!"