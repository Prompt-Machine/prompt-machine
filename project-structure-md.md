# Project Structure - Prompt Machine

## Root Directory: `~/prompt-machine/`

### Configuration Files
- `.env` - Environment variables (database, API keys, secrets)
- `ecosystem.config.js` - PM2 process manager configuration
- `.gitignore` - Git ignore file (should ignore .env, node_modules, logs)

### Directories

#### `/api/` - Backend API
```
api/
├── package.json          # Dependencies and scripts
├── package-lock.json     # Locked dependency versions
├── node_modules/         # Installed packages
└── src/
    ├── index.js          # ✅ Main Express server
    ├── routes/           # 🔄 API route handlers
    │   ├── auth.js       # ❌ Authentication endpoints
    │   ├── projects.js   # ❌ Project CRUD
    │   ├── prompts.js    # ❌ Prompt management
    │   ├── claude.js     # ❌ Claude chat integration
    │   └── deploy.js     # ❌ Tool deployment
    ├── services/         # 🔄 Business logic
    │   ├── claude.js     # ❌ Claude API wrapper
    │   ├── auth.js       # ❌ Authentication logic
    │   ├── deploy.js     # ❌ Deployment automation
    │   └── tools.js      # ❌ Tool generation
    ├── middleware/       # 🔄 Express middleware
    │   ├── auth.js       # ❌ JWT verification
    │   ├── error.js      # ❌ Error handling
    │   └── validate.js   # ❌ Request validation
    └── utils/            # 🔄 Utility functions
        ├── db.js         # ❌ Database helpers
        └── logger.js     # ❌ Logging utility
```

#### `/frontend/` - Frontend Application
```
frontend/
├── index.html            # ✅ Basic test page (temporary)
├── package.json          # ❌ React dependencies (future)
├── src/                  # ❌ React source (future)
└── build/                # ❌ Production build (future)
```

#### `/deployed-tools/` - Generated Tool Websites
```
deployed-tools/
├── [project-slug]/       # Each deployed tool gets a directory
│   ├── index.html        # Generated tool interface
│   ├── style.css         # Tool-specific styles
│   └── app.js           # Tool functionality
```

#### `/scripts/` - Utility Scripts
```
scripts/
├── setup-database.sql         # ✅ Creates database and user
├── create-schema.sql          # ✅ Creates tables
├── update-admin-password.sql  # ✅ Updates admin password
├── db-connect.sh             # ✅ Quick database connection
├── hash-admin-password.js    # ❌ Generate password hash
└── ssl-domain-setup.sh       # 🔄 SSL configuration
```

#### `/logs/` - Application Logs
```
logs/
├── api-error.log         # API error logs
├── api-out.log          # API output logs
└── nginx-error.log      # Nginx errors (symlink)
```

## File Status Legend
- ✅ Complete and working
- 🔄 In progress / needs fixes
- ❌ Not yet created

## Critical Missing Files

### 1. `/api/src/routes/auth.js`
```javascript
// Needs: login, logout, get current user
// Uses: bcrypt for passwords, JWT for tokens
```

### 2. `/api/src/middleware/auth.js`
```javascript
// Needs: JWT verification middleware
// Protects routes that require authentication
```

### 3. `/api/src/services/claude.js`
```javascript
// Needs: Claude API integration
// Handles chat for prompt building
```

### 4. `/api/src/routes/projects.js`
```javascript
// Needs: CRUD operations for projects
// List, create, update, delete projects
```

## Database Tables
- `users` - Admin users
- `projects` - AI tool projects  
- `prompts` - Prompt configurations
- `conversations` - Claude chat history
- `usage_logs` - Tool usage tracking

## Nginx Sites
- `/etc/nginx/sites-available/api.prompt-machine.com` - API proxy
- `/etc/nginx/sites-available/app.prompt-machine.com` - Frontend
- `/etc/nginx/sites-available/tools.prompt-machine.com` - Wildcard tools

## PM2 Processes
- `prompt-machine-api` - API server (2 instances, cluster mode)

## Next Implementation Priority
1. Auth routes and middleware
2. Project CRUD operations
3. Claude integration
4. Basic deployment functionality