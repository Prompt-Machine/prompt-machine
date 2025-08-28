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

# Step 1: Update Nginx configurations for domains
echo "📝 Step 1: Creating domain-specific Nginx configurations..."

# API configuration (api.prompt-machine.com)
cat > /etc/nginx/sites-available/api.prompt-machine.com << 'EOF'
server {
    listen 80;
    server_name api.prompt-machine.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name api.prompt-machine.com;
    
    # SSL certificates will be added by Certbot
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
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

# App configuration (app.prompt-machine.com)
cat > /etc/nginx/sites-available/app.prompt-machine.com << 'EOF'
server {
    listen 80;
    server_name app.prompt-machine.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name app.prompt-machine.com;
    
    # SSL certificates will be added by Certbot
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
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

echo -e "${GREEN}✓ Sites enabled${NC}"

# Step 3: Generate SSL certificates
echo ""
echo "🔒 Step 3: Generating SSL certificates with Let's Encrypt..."
echo ""
echo -e "${YELLOW}Make sure your DNS is pointing to this server:${NC}"
echo "- api.prompt-machine.com -> $(curl -s ifconfig.me)"
echo "- app.prompt-machine.com -> $(curl -s ifconfig.me)"
echo ""
echo "Press Enter to continue or Ctrl+C to cancel..."
read

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    snap install --classic certbot
    ln -s /snap/bin/certbot /usr/bin/certbot
fi

# Generate certificates
echo "Generating certificate for api.prompt-machine.com..."
certbot --nginx -d api.prompt-machine.com --non-interactive --agree-tos -m admin@prompt-machine.com

echo ""
echo "Generating certificate for app.prompt-machine.com..."
certbot --nginx -d app.prompt-machine.com --non-interactive --agree-tos -m admin@prompt-machine.com

# Reload Nginx
systemctl reload nginx

echo -e "${GREEN}✓ SSL certificates generated${NC}"

# Step 4: Update environment file
echo ""
echo "🔧 Step 4: Updating environment configuration..."

# Update the .env file with correct URLs
sed -i 's|APP_URL=.*|APP_URL=https://app.prompt-machine.com|' /home/ubuntu/prompt-machine/.env

# Add new environment variables if they don't exist
if ! grep -q "API_URL" /home/ubuntu/prompt-machine/.env; then
    echo "API_URL=https://api.prompt-machine.com" >> /home/ubuntu/prompt-machine/.env
fi

echo -e "${GREEN}✓ Environment updated${NC}"

# Step 5: Update frontend to use HTTPS API
echo ""
echo "📝 Step 5: Updating frontend configuration..."

# Update the frontend test to use the correct API URL
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
            <h2 class="text-2xl mb-4">Setup Complete! ✅</h2>
            <p class="mb-4">Your MVP is ready. Click below to test the API:</p>
            <button onclick="testAPI()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                Test API Connection
            </button>
            <div id="result" class="mt-4"></div>
        </div>
        
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
            <p class="font-bold">✅ SSL is now configured!</p>
            <ul class="list-disc ml-6 mt-2">
                <li>API: <a href="https://api.prompt-machine.com/health" target="_blank" class="text-blue-500 underline">https://api.prompt-machine.com/health</a></li>
                <li>App: <a href="https://app.prompt-machine.com" target="_blank" class="text-blue-500 underline">https://app.prompt-machine.com</a></li>
            </ul>
        </div>
    </div>
    <script>
        async function testAPI() {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '<p class="text-gray-500">Testing...</p>';
            
            try {
                const res = await fetch('https://api.prompt-machine.com/health');
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

chown ubuntu:ubuntu /home/ubuntu/prompt-machine/frontend/index.html

echo -e "${GREEN}✓ Frontend updated${NC}"

# Final summary
echo ""
echo "✅ ============================================"
echo "✅ SSL and Domain Setup Complete!"
echo "✅ ============================================"
echo ""
echo "Your secure URLs are now:"
echo "🔒 API: ${GREEN}https://api.prompt-machine.com${NC}"
echo "🔒 App: ${GREEN}https://app.prompt-machine.com${NC}"
echo ""
echo "Next steps:"
echo "1. Make sure your API server is running:"
echo "   cd /home/ubuntu/prompt-machine/api && npm start"
echo ""
echo "2. Test the API endpoint:"
echo "   curl https://api.prompt-machine.com/health"
echo ""
echo "3. Visit your app:"
echo "   https://app.prompt-machine.com"
echo ""
echo "SSL certificates will auto-renew via Let's Encrypt!"
