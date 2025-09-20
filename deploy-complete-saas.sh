#!/bin/bash

# ========================================
# PROMPT MACHINE COMPLETE SAAS DEPLOYMENT
# Version 2.0.0 Full Release
# ========================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PROMPT MACHINE SAAS DEPLOYMENT v2.0  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# ========================================
# CONFIGURATION
# ========================================

DOMAIN="prompt-machine.com"
API_DOMAIN="api.${DOMAIN}"
APP_DOMAIN="app.${DOMAIN}"
TOOL_DOMAIN="tool.${DOMAIN}"
DB_HOST="sql.prompt-machine.com"
DB_NAME="promptmachine_dbbeta"
DB_USER="promptmachine_userbeta"
DB_PASSWORD="94oE1q7K"
ADMIN_EMAIL="admin@prompt-machine.com"
ADMIN_PASSWORD="Uhr4ryPWey"

# ========================================
# PRE-DEPLOYMENT CHECKS
# ========================================

echo -e "${YELLOW}[1/10]${NC} Running pre-deployment checks..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Check required software
for cmd in node npm nginx psql certbot git pm2; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}$cmd is not installed. Please install it first.${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓${NC} All prerequisites installed"

# ========================================
# DATABASE SETUP
# ========================================

echo -e "${YELLOW}[2/10]${NC} Setting up database..."

# Create database schema
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME << EOF
-- Check if tables exist, if not create them
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users_extended') THEN
        RAISE NOTICE 'Creating database schema...';
        \\i /home/ubuntu/prompt-machine/complete-database-schema.sql
    ELSE
        RAISE NOTICE 'Database schema already exists';
    END IF;
END
\$\$;
EOF

echo -e "${GREEN}✓${NC} Database configured"

# ========================================
# BACKUP EXISTING INSTALLATION
# ========================================

echo -e "${YELLOW}[3/10]${NC} Backing up existing installation..."

BACKUP_DIR="/var/backups/prompt-machine/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

if [ -d "/var/www/prompt-machine" ]; then
    cp -r /var/www/prompt-machine $BACKUP_DIR/
    echo -e "${GREEN}✓${NC} Backup created at $BACKUP_DIR"
else
    echo -e "${YELLOW}!${NC} No existing installation found"
fi

# ========================================
# CREATE APPLICATION DIRECTORY
# ========================================

echo -e "${YELLOW}[4/10]${NC} Setting up application directory..."

APP_DIR="/var/www/prompt-machine"
mkdir -p $APP_DIR
cd $APP_DIR

# Copy files from development
cp -r /home/ubuntu/prompt-machine/* $APP_DIR/ 2>/dev/null || true

# Copy new v2.0 files
mkdir -p $APP_DIR/api/services
mkdir -p $APP_DIR/api/routes
mkdir -p $APP_DIR/frontend

# Copy all new services
cp /home/ubuntu/prompt-machine/api/services/*.js $APP_DIR/api/services/
cp /home/ubuntu/prompt-machine/api/routes/*.js $APP_DIR/api/routes/
cp /home/ubuntu/prompt-machine/api/src/index-v2.js $APP_DIR/api/src/index.js
cp /home/ubuntu/prompt-machine/frontend/*.html $APP_DIR/frontend/

echo -e "${GREEN}✓${NC} Application files deployed"

# ========================================
# INSTALL DEPENDENCIES
# ========================================

echo -e "${YELLOW}[5/10]${NC} Installing dependencies..."

cd $APP_DIR/api
cat > package.json << 'EOF'
{
  "name": "prompt-machine-api",
  "version": "2.0.0",
  "description": "Prompt Machine SAAS API",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "pm2": "pm2 start src/index.js -i max --name prompt-machine-api"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^6.10.0",
    "pg": "^8.11.3",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.3.1",
    "stripe": "^13.6.0",
    "nodemailer": "^6.9.5",
    "moment": "^2.29.4",
    "uuid": "^9.0.1",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.32.5",
    "axios": "^1.5.0",
    "winston": "^3.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

npm install --production

echo -e "${GREEN}✓${NC} Dependencies installed"

# ========================================
# ENVIRONMENT CONFIGURATION
# ========================================

echo -e "${YELLOW}[6/10]${NC} Configuring environment..."

cat > $APP_DIR/.env << EOF
# Server Configuration
NODE_ENV=production
PORT=3001

# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Authentication
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# URLs
FRONTEND_URL=https://$APP_DOMAIN
API_URL=https://$API_DOMAIN

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@$DOMAIN
SMTP_PASS=your_smtp_password
SMTP_FROM=Prompt Machine <noreply@$DOMAIN>

# Stripe Configuration (Update with your keys)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_ENABLED=false

# PayPal Configuration (Update with your keys)
PAYPAL_CLIENT_ID=xxxxx
PAYPAL_SECRET=xxxxx
PAYPAL_ENABLED=false

# SSL Configuration
SSL_EMAIL=$ADMIN_EMAIL

# Claude API Configuration
CLAUDE_API_KEY=your_claude_api_key_here

# Google AdSense
ADSENSE_CLIENT=ca-pub-xxxxx
ADSENSE_ENABLED=false

# Analytics
GA_TRACKING_ID=UA-xxxxx
ANALYTICS_ENABLED=true

# Security
ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
EOF

chmod 600 $APP_DIR/.env
echo -e "${GREEN}✓${NC} Environment configured"

# ========================================
# NGINX CONFIGURATION
# ========================================

echo -e "${YELLOW}[7/10]${NC} Configuring Nginx..."

# API server configuration
cat > /etc/nginx/sites-available/$API_DOMAIN << EOF
server {
    listen 80;
    server_name $API_DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $API_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$API_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$API_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

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
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# App frontend configuration
cat > /etc/nginx/sites-available/$APP_DOMAIN << EOF
server {
    listen 80;
    server_name $APP_DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $APP_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$APP_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root $APP_DIR/frontend;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Tool subdomain wildcard configuration
cat > /etc/nginx/sites-available/$TOOL_DOMAIN << EOF
server {
    listen 80;
    server_name *.$TOOL_DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name *.$TOOL_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$TOOL_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$TOOL_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/tools/\$subdomain;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable sites
ln -sf /etc/nginx/sites-available/$API_DOMAIN /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/$APP_DOMAIN /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/$TOOL_DOMAIN /etc/nginx/sites-enabled/

# Test and reload Nginx
nginx -t && systemctl reload nginx
echo -e "${GREEN}✓${NC} Nginx configured"

# ========================================
# SSL CERTIFICATES
# ========================================

echo -e "${YELLOW}[8/10]${NC} Setting up SSL certificates..."

# Check if certificates exist, if not create them
if [ ! -d "/etc/letsencrypt/live/$API_DOMAIN" ]; then
    certbot certonly --nginx -d $API_DOMAIN --non-interactive --agree-tos --email $ADMIN_EMAIL
fi

if [ ! -d "/etc/letsencrypt/live/$APP_DOMAIN" ]; then
    certbot certonly --nginx -d $APP_DOMAIN --non-interactive --agree-tos --email $ADMIN_EMAIL
fi

if [ ! -d "/etc/letsencrypt/live/$TOOL_DOMAIN" ]; then
    certbot certonly --nginx -d "*.$TOOL_DOMAIN" --non-interactive --agree-tos --email $ADMIN_EMAIL
fi

echo -e "${GREEN}✓${NC} SSL certificates configured"

# ========================================
# PM2 PROCESS MANAGEMENT
# ========================================

echo -e "${YELLOW}[9/10]${NC} Setting up PM2 process management..."

cd $APP_DIR/api

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'prompt-machine-api',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/pm2/prompt-machine-error.log',
    out_file: '/var/log/pm2/prompt-machine-out.log',
    log_file: '/var/log/pm2/prompt-machine-combined.log',
    time: true,
    max_memory_restart: '1G',
    autorestart: true,
    watch: false
  }]
};
EOF

# Stop any existing PM2 processes
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Start application with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

echo -e "${GREEN}✓${NC} PM2 configured and application started"

# ========================================
# CREATE ADMIN USER
# ========================================

echo -e "${YELLOW}[10/10]${NC} Creating admin user..."

# Hash the admin password
HASHED_PASSWORD=$(node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('$ADMIN_PASSWORD', 12).then(hash => console.log(hash));
" 2>/dev/null)

# Update admin password in database
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME << EOF
UPDATE users_extended 
SET password_hash = '$HASHED_PASSWORD'
WHERE email = '$ADMIN_EMAIL';
EOF

echo -e "${GREEN}✓${NC} Admin user configured"

# ========================================
# FINAL SETUP
# ========================================

# Create necessary directories
mkdir -p /var/www/tools
mkdir -p /var/log/prompt-machine
mkdir -p /var/log/pm2

# Set permissions
chown -R www-data:www-data $APP_DIR
chmod -R 755 $APP_DIR

# ========================================
# DEPLOYMENT COMPLETE
# ========================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DEPLOYMENT SUCCESSFUL! 🎉             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Access your platform at:${NC}"
echo -e "  Admin Panel: ${GREEN}https://$APP_DOMAIN/admin${NC}"
echo -e "  API: ${GREEN}https://$API_DOMAIN${NC}"
echo -e "  Login: ${GREEN}$ADMIN_EMAIL${NC}"
echo -e "  Password: ${GREEN}$ADMIN_PASSWORD${NC}"
echo ""
echo -e "${YELLOW}Important next steps:${NC}"
echo "1. Update Stripe/PayPal API keys in .env file"
echo "2. Configure SMTP settings for email"
echo "3. Update Claude API key for AI features"
echo "4. Review and adjust rate limits as needed"
echo "5. Set up regular backups"
echo ""
echo -e "${BLUE}Monitoring:${NC}"
echo "  View logs: pm2 logs"
echo "  Monitor: pm2 monit"
echo "  Status: pm2 status"
echo ""
echo -e "${GREEN}Deployment completed at $(date)${NC}"
