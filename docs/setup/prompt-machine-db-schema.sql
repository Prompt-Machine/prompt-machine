-- Prompt Machine Database Schema
-- Database: promptmachine_dbbeta

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (Admin users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_superadmin BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table (AI tool projects)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    expert_type VARCHAR(255),
    status VARCHAR(50) DEFAULT 'draft', -- draft, published, archived
    subdomain VARCHAR(255) UNIQUE,
    is_public BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prompts table (Version controlled prompts)
CREATE TABLE prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    system_prompt TEXT NOT NULL,
    user_fields JSONB DEFAULT '[]', -- Array of field configurations
    ai_behavior JSONB DEFAULT '{}', -- AI interaction settings
    is_active BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, version)
);

-- Deployments table
CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    prompt_id UUID REFERENCES prompts(id),
    subdomain VARCHAR(255) NOT NULL,
    ssl_status VARCHAR(50) DEFAULT 'pending', -- pending, active, error
    deployment_status VARCHAR(50) DEFAULT 'deploying', -- deploying, active, failed
    nginx_config TEXT,
    deployment_log TEXT,
    deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deployed_by UUID REFERENCES users(id)
);

-- Analytics table
CREATE TABLE analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(100), -- page_view, api_call, completion
    user_ip VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monetization table
CREATE TABLE monetization (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    monetization_type VARCHAR(50), -- adsense, subscription, api
    configuration JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table (for future SAAS model)
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    permissions JSONB DEFAULT '{}',
    rate_limit INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_prompts_project_id ON prompts(project_id);
CREATE INDEX idx_analytics_project_id ON analytics(project_id);
CREATE INDEX idx_analytics_created_at ON analytics(created_at);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monetization_updated_at BEFORE UPDATE ON monetization
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user
INSERT INTO users (email, password_hash, full_name, is_superadmin)
VALUES (
    'admin@prompt-machine.com',
    '$2b$12$TEMP_HASH_TO_BE_REPLACED', -- Will be replaced with proper hash
    'System Administrator',
    true
);

-- Sample data for development
-- This can be removed in production
INSERT INTO projects (user_id, name, slug, description, expert_type, status)
SELECT 
    id,
    'Story Writer Assistant',
    'story-writer',
    'An AI assistant specialized in helping users write compelling stories',
    'Creative Writing Expert',
    'draft'
FROM users WHERE email = 'admin@prompt-machine.com';