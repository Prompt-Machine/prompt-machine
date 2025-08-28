#!/bin/bash
# PM2 Setup for keeping the API running in production

echo "🚀 Setting up PM2 for Prompt Machine API"
echo "========================================"

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Create PM2 ecosystem file
cd ~/prompt-machine

cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
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
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true,
    max_memory_restart: '500M',
    // Auto restart if crashes
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 5000,
    // Watch for file changes (disable in production)
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git'],
  }]
};
EOF

# Start the API with PM2
echo "Starting API with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Note: The above command will output another command to run with sudo
echo ""
echo "⚠️  IMPORTANT: Run the command that PM2 just showed above with sudo!"
echo ""

# Show status
pm2 status

echo ""
echo "✅ PM2 Setup Complete!"
echo ""
echo "Useful PM2 commands:"
echo "  pm2 status          - Show process status"
echo "  pm2 logs            - Show logs"
echo "  pm2 restart all     - Restart all processes"
echo "  pm2 stop all        - Stop all processes"
echo "  pm2 monit           - Monitor CPU/Memory"
echo ""
echo "Your API is now running at https://api.prompt-machine.com"