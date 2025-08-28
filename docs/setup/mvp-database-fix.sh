#!/bin/bash
# Quick Database Fix Script
# Run this if you already ran the setup but database wasn't created

echo "🗄️  Setting up Prompt Machine Database..."

# Step 1: Create database if needed
echo "Checking if database exists..."
PGPASSWORD=94oE1q7K psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta -c "SELECT 1" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "Database doesn't exist. Creating it..."
    PGPASSWORD=Uhr4ryPWey94oE1q7K psql -h sql.prompt-machine.com -U postgres << EOF
CREATE DATABASE promptmachine_dbbeta OWNER promptmachine_userbeta;
GRANT ALL PRIVILEGES ON DATABASE promptmachine_dbbeta TO promptmachine_userbeta;
EOF
    echo "✅ Database created!"
else
    echo "✅ Database already exists!"
fi

# Step 2: Run MVP schema
echo ""
echo "Creating tables..."
PGPASSWORD=94oE1q7K psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta << 'EOF'
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (simple version)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prompts (simplified)
CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    system_prompt TEXT,
    fields JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations (for prompt builder)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage tracking (for billing)
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    tool_slug VARCHAR(255),
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin if doesn't exist
INSERT INTO users (email, password_hash) 
VALUES ('admin@prompt-machine.com', '$2b$10$TEMP_HASH_REPLACE_ME')
ON CONFLICT (email) DO NOTHING;
EOF

echo "✅ Database schema created!"
echo ""
echo "⚠️  IMPORTANT: You need to update the admin password!"
echo ""
echo "Run this in your prompt-machine/api directory:"
echo "node -e \"const bcrypt=require('bcrypt'); bcrypt.hash('Uhr4ryPWey',10).then(h=>console.log('UPDATE users SET password_hash = \\'' + h + '\\' WHERE email = \\'admin@prompt-machine.com\\';'))\""
echo ""
echo "Then run the SQL it outputs in psql."