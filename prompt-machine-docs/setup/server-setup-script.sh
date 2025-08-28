#!/bin/bash

# Prompt Machine Server Setup Script
# For Ubuntu 22.04 LTS

set -e  # Exit on error

echo "=== Prompt Machine Server Setup ==="
echo "This script will set up the server environment for Prompt Machine"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
print_status "Installing essential packages..."
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban

# Install Node.js 18 LTS
print_status "Installing Node.js 18 LTS..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node_version=$(node -v)
print_status "Node.js installed: $node_version"

# Install PM2
print_status "Installing PM2..."
sudo npm install -g pm2
pm2 startup systemd -u $USER --hp /home/$USER

# Install Nginx
print_status "Installing Nginx..."
sudo apt install -y nginx

# Install Certbot for Let's Encrypt
print_status "Installing Certbot..."
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Create project directory structure
print_status "Creating project directories..."
mkdir -p ~/prompt-machine/{api,app,tools,config,logs,scripts}
mkdir -p ~/prompt-machine/api/{src,tests,public}
mkdir -p ~/prompt-machine/app/{src,public,build}

# Configure firewall
print_status "Configuring firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Configure fail2ban
print_status "Configuring fail2ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create Nginx configuration for API
print_status "Creating Nginx configuration for API..."
sudo tee /etc/nginx/sites-available/api.prompt-machine.com > /dev/null <<EOF
server {
    listen 80;
    server_name api.prompt-machine.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Create Nginx configuration for App
sudo tee /etc/nginx/sites-available/app.prompt-machine.com > /dev/null <<EOF
server {
    listen 80;
    server_name app.prompt-machine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Create Nginx configuration for wildcard tools subdomain
sudo tee /etc/nginx/sites-available/tools.prompt-machine.com > /dev/null <<EOF
server {
    listen 80;
    server_name *.tool.prompt-machine.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable Nginx sites
print_status "Enabling Nginx sites..."
sudo ln -sf /etc/nginx/sites-available/api.prompt-machine.com /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/app.prompt-machine.com /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/tools.prompt-machine.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
print_status "Testing Nginx configuration..."
sudo nginx -t && sudo systemctl reload nginx

# Create environment file template
print_status "Creating environment configuration template..."
cat > ~/prompt-machine/config/.env.template <<EOF
# Database Configuration
DB_HOST=sql.prompt-machine.com
DB_PORT=5432
DB_NAME=promptmachine_dbbeta
DB_USER=promptmachine_userbeta
DB_PASSWORD=94oE1q7K

# Application Configuration
NODE_ENV=production
API_PORT=3001
APP_PORT=3000
TOOLS_PORT=3002

# Security
JWT_SECRET=CHANGE_THIS_TO_RANDOM_STRING
SESSION_SECRET=CHANGE_THIS_TO_RANDOM_STRING

# Claude API
CLAUDE_API_KEY=YOUR_CLAUDE_API_KEY

# Domains
API_DOMAIN=https://api.prompt-machine.com
APP_DOMAIN=https://app.prompt-machine.com
TOOLS_DOMAIN=https://tool.prompt-machine.com

# Redis (optional, for session management)
REDIS_URL=redis://localhost:6379

# Google AdSense
GOOGLE_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxx
EOF

# Create PM2 ecosystem file
print_status "Creating PM2 ecosystem configuration..."
cat > ~/prompt-machine/ecosystem.config.js <<EOF
module.exports = {
  apps: [
    {
      name: 'prompt-machine-api',
      script: './api/src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'prompt-machine-app',
      script: 'serve',
      args: '-s app/build -l 3000',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log'
    },
    {
      name: 'prompt-machine-tools',
      script: './tools/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: './logs/tools-error.log',
      out_file: './logs/tools-out.log'
    }
  ]
};
EOF

# Install global npm packages
print_status "Installing global npm packages..."
sudo npm install -g serve

# Create SSL certificate setup script
print_status "Creating SSL certificate setup script..."
cat > ~/prompt-machine/scripts/setup-ssl.sh <<EOF
#!/bin/bash
# SSL Certificate Setup Script

echo "Setting up SSL certificates..."

# API certificate
sudo certbot --nginx -d api.prompt-machine.com --non-interactive --agree-tos -m admin@prompt-machine.com

# App certificate  
sudo certbot --nginx -d app.prompt-machine.com --non-interactive --agree-tos -m admin@prompt-machine.com

# Wildcard certificate for tools
sudo certbot certonly --manual --preferred-challenges dns -d "*.tool.prompt-machine.com" --non-interactive --agree-tos -m admin@prompt-machine.com

# Setup auto-renewal
sudo systemctl enable snap.certbot.renew.timer
sudo systemctl start snap.certbot.renew.timer

echo "SSL setup complete!"
EOF

chmod +x ~/prompt-machine/scripts/setup-ssl.sh

# Create deployment script
print_status "Creating deployment helper script..."
cat > ~/prompt-machine/scripts/deploy.sh <<EOF
#!/bin/bash
# Deployment helper script

cd ~/prompt-machine

# Pull latest code (when using git)
# git pull origin main

# Install dependencies
cd api && npm install --production
cd ../app && npm install && npm run build

# Restart services
pm2 restart ecosystem.config.js

echo "Deployment complete!"
EOF

chmod +x ~/prompt-machine/scripts/deploy.sh

print_status "Server setup complete!"
print_warning "Next steps:"
echo "1. Copy .env.template to .env and update with your values"
echo "2. Set up SSL certificates by running: ~/prompt-machine/scripts/setup-ssl.sh"
echo "3. Initialize the database using the SQL schema"
echo "4. Deploy your application code"
echo "5. Start services with: pm2 start ~/prompt-machine/ecosystem.config.js"

echo ""
print_status "Server is ready for Prompt Machine deployment!"