# Troubleshooting Guide - Prompt Machine

## Common Issues & Solutions

### PostgreSQL Connection Issues

#### Issue: "FATAL: password authentication failed"
```bash
# Problem: PGPASSWORD environment variable doesn't work
# Solution: Use interactive password entry
psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta
# Enter password when prompted: 94oE1q7K
```

#### Issue: Cannot find module 'bcrypt'
```bash
# Problem: Running scripts from wrong directory
# Solution: Always run from api/ directory where bcrypt is installed
cd ~/prompt-machine/api
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('Uhr4ryPWey',10).then(h=>console.log(h))"
```

### Nginx/SSL Issues

#### Issue: "no ssl_certificate is defined for the listen ... ssl"
```bash
# Problem: Trying to use SSL before certificates exist
# Solution: Create HTTP config first, let Certbot add SSL

# 1. Remove SSL listen directives from Nginx config
# 2. Run certbot to generate certificates
sudo certbot --nginx -d api.prompt-machine.com
# 3. Certbot will automatically update Nginx config
```

#### Issue: "Connection refused" on HTTPS
```bash
# Check if ports are open
sudo ufw status

# Open HTTPS port if needed
sudo ufw allow 443/tcp

# Check if API is running
pm2 status

# Check Nginx error log
sudo tail -f /var/log/nginx/error.log
```

### API Issues

#### Issue: API not accessible
```bash
# 1. Check if process is running
pm2 status
# or
ps aux | grep node

# 2. Check if port 3001 is listening
sudo netstat -tlnp | grep 3001

# 3. Check API logs
pm2 logs prompt-machine-api
# or
tail -f ~/prompt-machine/logs/api-error.log

# 4. Test locally first
curl http://localhost:3001/health
```

#### Issue: CORS errors in browser
```javascript
// Make sure API allows your frontend domain
// In api/src/index.js, check corsOptions:
const allowedOrigins = [
    'https://app.prompt-machine.com',
    'http://localhost:3000'  // for development
];
```

### Database Issues

#### Issue: "relation does not exist"
```bash
# Tables not created, run schema:
psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta < scripts/create-schema.sql
```

#### Issue: Admin login fails
```bash
# Password hash not updated, generate new hash:
cd ~/prompt-machine/api
HASH=$(node -e "const bcrypt=require('bcrypt'); bcrypt.hash('Uhr4ryPWey',10).then(h=>console.log(h))")

# Update in database:
psql -h sql.prompt-machine.com -U promptmachine_userbeta -d promptmachine_dbbeta
UPDATE users SET password_hash = '$HASH' WHERE email = 'admin@prompt-machine.com';
```

### PM2 Issues

#### Issue: API stops when SSH session ends
```bash
# Use PM2 instead of npm start
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Setup startup script
pm2 startup
# Run the command it outputs
```

#### Issue: "Error: bind EADDRINUSE :::3001"
```bash
# Port already in use
# Find process using port
sudo lsof -i :3001

# Kill process
kill -9 [PID]

# Or restart PM2
pm2 restart all
```

### DNS/Domain Issues

#### Issue: "DNS_PROBE_FINISHED_NXDOMAIN"
```bash
# Check DNS propagation
dig api.prompt-machine.com

# Should return your server IP
# If not, check DNS settings with your domain provider
```

### Quick Diagnostic Commands

```bash
# Check everything at once
echo "=== System Status ==="
echo "API Process:" && pm2 status
echo -e "\nNginx Status:" && sudo systemctl status nginx
echo -e "\nPort 3001:" && sudo netstat -tlnp | grep 3001
echo -e "\nDisk Space:" && df -h
echo -e "\nMemory:" && free -h
echo -e "\nLast API Errors:" && tail -5 ~/prompt-machine/logs/api-error.log
```

### Reset Everything

If all else fails, here's how to reset:

```bash
# 1. Stop everything
pm2 stop all
sudo systemctl stop nginx

# 2. Clear logs
rm ~/prompt-machine/logs/*

# 3. Reset database
psql -h sql.prompt-machine.com -U postgres
DROP DATABASE promptmachine_dbbeta;
CREATE DATABASE promptmachine_dbbeta OWNER promptmachine_userbeta;
\q

# 4. Rerun setup
cd ~/prompt-machine
./mvp-setup-manual-auth.sh

# 5. Start services
pm2 start ecosystem.config.js
sudo systemctl start nginx
```

### Getting Help

When asking Claude Code for help, provide:
1. The exact error message
2. What command you ran
3. Output of diagnostic commands above
4. Recent changes made