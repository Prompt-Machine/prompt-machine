# TODO - Prompt Machine MVP

## Current Status (as of setup)

### ✅ Completed
- [x] Server setup (Ubuntu 22.04)
- [x] Node.js and dependencies installed
- [x] PostgreSQL database created
- [x] Database schema implemented
- [x] Basic Express server created
- [x] Nginx configuration files created
- [x] PM2 configuration ready
- [x] Environment variables configured (.env)
- [x] Basic frontend HTML page

### 🔄 In Progress
- [ ] SSL/HTTPS configuration (script needs fixes)
- [ ] Admin password update in database

### ❌ Not Started
- [ ] Authentication system implementation
- [ ] API routes implementation
- [ ] Claude integration
- [ ] Tool deployment system
- [ ] React frontend

## Immediate Next Steps (Priority Order)

### 1. Fix SSL Setup
```bash
# The current issue: Nginx expects SSL before certs exist
# Solution: Let Certbot handle SSL configuration
# See: ssl-domain-setup.sh (needs update)
```

### 2. Update Admin Password
```bash
cd ~/prompt-machine/api
# Generate hash
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('Uhr4ryPWey',10).then(h=>console.log(h))"
# Update in database using the hash
```

### 3. Create Auth Routes
Create `/api/src/routes/auth.js`:
- [ ] POST /api/auth/login
- [ ] POST /api/auth/logout  
- [ ] GET /api/auth/me

### 4. Create Auth Middleware
Create `/api/src/middleware/auth.js`:
- [ ] JWT verification
- [ ] Attach user to request
- [ ] Handle token expiration

### 5. Create Project Routes
Create `/api/src/routes/projects.js`:
- [ ] GET /api/projects (list all)
- [ ] POST /api/projects (create)
- [ ] GET /api/projects/:id (get one)
- [ ] PUT /api/projects/:id (update)
- [ ] DELETE /api/projects/:id (delete)

### 6. Claude Integration
Create `/api/src/services/claude.js`:
- [ ] Initialize Claude client
- [ ] Chat function for prompt building
- [ ] Handle rate limiting
- [ ] Error handling

### 7. Prompt Builder
Create `/api/src/routes/prompts.js`:
- [ ] POST /api/prompts/chat (interactive chat)
- [ ] POST /api/prompts/save (save final prompt)
- [ ] GET /api/prompts/:projectId (get prompts)

### 8. Basic Tool Deployment
Create `/api/src/services/deploy.js`:
- [ ] Generate HTML from prompt
- [ ] Save to deployed-tools directory
- [ ] Create subdomain routing

### 9. Frontend Development
- [ ] Set up React project
- [ ] Create login page
- [ ] Create projects dashboard
- [ ] Create prompt builder interface
- [ ] Add deployment controls

## Version 1.0.0 Checklist

Essential features for MVP launch:

- [ ] Admin can login
- [ ] Admin can create/edit/delete projects
- [ ] Admin can chat with Claude to build prompts
- [ ] Admin can deploy tool to subdomain
- [ ] Deployed tools accept user input
- [ ] Deployed tools call Claude API
- [ ] Basic usage tracking works
- [ ] Google AdSense integrated

## Known Issues to Fix

1. **PostgreSQL auth**: Must use interactive passwords (no PGPASSWORD)
2. **SSL setup**: Script tries to configure SSL before certs exist
3. **CORS**: Need to properly configure for HTTPS
4. **Error handling**: Need global error handler

## Testing Checklist

Before launching v1.0.0:

- [ ] Test login/logout flow
- [ ] Test project CRUD operations
- [ ] Test Claude chat integration
- [ ] Test tool deployment
- [ ] Test deployed tool functionality
- [ ] Test HTTPS on all domains
- [ ] Test error scenarios
- [ ] Test on mobile devices

## Future Enhancements (v1.1+)

- Email notifications (SendGrid)
- Prompt templates library
- Better UI with React/Tailwind
- File export functionality
- Payment integration (Stripe)
- Multi-LLM support
- Advanced analytics
- Team collaboration

## Development Commands

```bash
# Start API in dev mode
cd ~/prompt-machine/api
npm run dev

# Watch logs
pm2 logs

# Test endpoints
curl https://api.prompt-machine.com/health
curl -X POST https://api.prompt-machine.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@prompt-machine.com","password":"Uhr4ryPWey"}'

# Connect to database
./scripts/db-connect.sh
```

## Questions for Decision

1. Should we use Redis for sessions? (adds complexity)
2. Should tools have their own backends? (vs static HTML)
3. How to handle tool versioning?
4. Monetization beyond AdSense?