#!/bin/bash
# SSL and Domain Setup for Prompt Machine
# Sets up HTTPS for api.prompt-machine.com, app.prompt-machine.com

echo "🔒 Setting up SSL and domains for Prompt Machine"
echo "=============================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as sudo
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run with sudo${NC}"
    exit 1
fi

# Step 1: Update Nginx configurations for domains (HTTP first, SSL will be added by Certbot)
echo "📝 Step 1: Creating domain-specific Nginx configurations..."

# API configuration (api.prompt-machine.com) - HTTP only for now
cat > /etc/nginx/sites-available/api.prompt-machine.com << 'EOF'
server {
    listen 80;
    server_name api.prompt-machine.com;
    
    # API proxy
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers for API
        add_header Access-Control-Allow-Origin "https://app.prompt-machine.com" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        add_header Access-Control-Allow-Credentials "true" always;
        
        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
EOF

# App configuration (app.prompt-machine.com) - HTTP only for now
cat > /etc/nginx/sites-available/app.prompt-machine.com << 'EOF'
server {
    listen 80;
    server_name app.prompt-machine.com;
    
    # Frontend files
    root /home/ubuntu/prompt-machine/frontend;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Tools wildcard configuration
cat > /etc/nginx/sites-available/tools.prompt-machine.com << 'EOF'
server {
    listen 80;
    server_name *.tool.prompt-machine.com;
    
    # For now, serve tools over HTTP
    # We'll add SSL for each tool as they're deployed
    
    root /home/ubuntu/prompt-machine/deployed-tools/$subdomain;
    index index.html;
    
    set $subdomain "";
    if ($host ~* ^([a-z0-9-]+)\.tool\.prompt-machine\.com$) {
        set $subdomain $1;
    }
    
    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

echo -e "${GREEN}✓ Nginx configurations created${NC}"

# Step 2: Enable sites
echo ""
echo "🔗 Step 2: Enabling sites..."

# Disable default site and old configuration
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/prompt-machine

# Enable new sites
ln -sf /etc/nginx/sites-available/api.prompt-machine.com /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/app.prompt-machine.com /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/tools.prompt-machine.com /etc/nginx/sites-enabled/

# Test configuration
nginx -t
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Nginx configuration test failed${NC}"
    exit 1
fi

# Reload Nginx
systemctl reload nginx

echo -e "${GREEN}✓ Sites enabled${NC}"

# Step 3: Check DNS
echo ""
echo "🌐 Step 3: Checking DNS configuration..."
echo ""
SERVER_IP=$(curl -s ifconfig.me)
echo "Your server IP: ${YELLOW}$SERVER_IP${NC}"
echo ""
echo "Checking DNS records..."

# Check API domain
API_IP=$(dig +short api.prompt-machine.com | tail -n1)
if [ "$API_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}✓ api.prompt-machine.com correctly points to this server${NC}"
else
    echo -e "${RED}✗ api.prompt-machine.com points to: $API_IP (not this server!)${NC}"
    echo "Please update your DNS records and wait for propagation."
    exit 1
fi

# Check App domain
APP_IP=$(dig +short app.prompt-machine.com | tail -n1)
if [ "$APP_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}✓ app.prompt-machine.com correctly points to this server${NC}"
else
    echo -e "${RED}✗ app.prompt-machine.com points to: $APP_IP (not this server!)${NC}"
    echo "Please update your DNS records and wait for propagation."
    exit 1
fi

# Step 4: Generate SSL certificates
echo ""
echo "🔒 Step 4: Generating SSL certificates with Let's Encrypt..."
echo ""

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    snap install --classic certbot
    ln -s /snap/bin/certbot /usr/bin/certbot
fi

# Generate certificates
echo "Generating certificate for api.prompt-machine.com..."
certbot --nginx -d api.prompt-machine.com --non-interactive --agree-tos -m admin@prompt-machine.com --redirect

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to generate certificate for api.prompt-machine.com${NC}"
    echo "Check that your DNS is properly configured and port 80 is accessible."
    exit 1
fi

echo ""
echo "Generating certificate for app.prompt-machine.com..."
certbot --nginx -d app.prompt-machine.com --non-interactive --agree-tos -m admin@prompt-machine.com --redirect

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to generate certificate for app.prompt-machine.com${NC}"
    echo "Check that your DNS is properly configured and port 80 is accessible."
    exit 1
fi

# Reload Nginx with new certificates
systemctl reload nginx

echo -e "${GREEN}✓ SSL certificates generated${NC}"

# Step 5: Update environment file
echo ""
echo "🔧 Step 5: Updating environment configuration..."

# Update the .env file with correct URLs
if [ -f /home/ubuntu/prompt-machine/.env ]; then
    sed -i 's|APP_URL=.*|APP_URL=https://app.prompt-machine.com|' /home/ubuntu/prompt-machine/.env
    
    # Add new environment variables if they don't exist
    if ! grep -q "API_URL" /home/ubuntu/prompt-machine/.env; then
        echo "API_URL=https://api.prompt-machine.com" >> /home/ubuntu/prompt-machine/.env
    fi
    
    echo -e "${GREEN}✓ Environment updated${NC}"
else
    echo -e "${YELLOW}⚠️  .env file not found at /home/ubuntu/prompt-machine/.env${NC}"
fi

# Step 6: Update frontend to use HTTPS API
echo ""
echo "📝 Step 6: Updating frontend configuration..."

# Create an updated frontend if the directory exists
if [ -d /home/ubuntu/prompt-machine/frontend ]; then
    cat > /home/ubuntu/prompt-machine/frontend/index.html << 'EOF'
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
            <h2 class="text-2xl mb-4">SSL Setup Complete! 🔒</h2>
            <p class="mb-4">Your application is now secured with HTTPS. Test the API connection:</p>
            <button onclick="testAPI()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                Test Secure API
            </button>
            <div id="result" class="mt-4"></div>
        </div>
        
        <div class="bg-green-50 border-l-4 border-green-400 p-4 mt-6">
            <p class="font-bold">✅ Your secure endpoints:</p>
            <ul class="list-disc ml-6 mt-2">
                <li>API: <a href="https://api.prompt-machine.com/health" target="_blank" class="text-blue-500 underline">https://api.prompt-machine.com/health</a></li>
                <li>App: <a href="https://app.prompt-machine.com" class="text-blue-500 underline">https://app.prompt-machine.com</a></li>
            </ul>
        </div>
    </div>
    <script>
        async function testAPI() {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '<p class="text-gray-500">Testing secure connection...</p>';
            
            try {
                const res = await fetch('https://api.prompt-machine.com/health');
                const data = await res.json();
                resultDiv.innerHTML = 
                    '<div class="bg-green-100 p-4 rounded">' +
                    '<p class="text-green-700 font-bold mb-2">✅ API is working!</p>' +
                    '<pre class="bg-white p-2 rounded text-sm overflow-auto">' + 
                    JSON.stringify(data, null, 2) + 
                    '</pre></div>';
            } catch (err) {
                resultDiv.innerHTML = 
                    '<div class="bg-red-100 p-4 rounded">' +
                    '<p class="text-red-700">❌ Error: ' + err.message + '</p>' +
                    '<p class="text-sm mt-2">Make sure the API server is running on port 3001</p>' +
                    '</div>';
            }
        }
    </script>
</body>
</html>
EOF
    
    chown ubuntu:ubuntu /home/ubuntu/prompt-machine/frontend/index.html
    echo -e "${GREEN}✓ Frontend updated${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend directory not found${NC}"
fi

# Step 7: Set up auto-renewal
echo ""
echo "⏰ Step 7: Setting up certificate auto-renewal..."

# Test renewal
certbot renew --dry-run

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Auto-renewal is configured${NC}"
else
    echo -e "${YELLOW}⚠️  Auto-renewal test failed - check certbot timer${NC}"
fi

# Final summary
echo ""
echo "✅ ============================================"
echo "✅ SSL and Domain Setup Complete!"
echo "✅ ============================================"
echo ""
echo "Your secure URLs:"
echo "🔒 API: ${GREEN}https://api.prompt-machine.com${NC}"
echo "🔒 App: ${GREEN}https://app.prompt-machine.com${NC}"
echo ""
echo "Next steps:"
echo "1. Make sure your API server is running:"
echo "   ${YELLOW}cd /home/ubuntu/prompt-machine/api && npm start${NC}"
echo "   Or better, use PM2:"
echo "   ${YELLOW}pm2 start ecosystem.config.js${NC}"
echo ""
echo "2. Test the API endpoint:"
echo "   ${YELLOW}curl https://api.prompt-machine.com/health${NC}"
echo ""
echo "3. Visit your app:"
echo "   ${YELLOW}https://app.prompt-machine.com${NC}"
echo ""
echo "📝 Notes:"
echo "- SSL certificates will auto-renew every 90 days"
echo "- HTTP traffic is automatically redirected to HTTPS"
echo "- Ensure port 443 is open in your security group"
