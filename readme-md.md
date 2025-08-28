# Prompt Machine 🚀

An AI-powered platform that enables administrators to create specialized AI tools through conversation with Claude, then deploy them as web applications.

## Overview

Prompt Machine democratizes AI by allowing non-technical users to create custom AI tools. Administrators chat with Claude to define their tool's behavior, and the system automatically generates and deploys a web interface.

## Features (MVP)

- 🔐 Admin authentication
- 📁 Project management
- 💬 Interactive prompt building with Claude
- 🚀 One-click deployment to subdomains
- 📊 Basic usage analytics
- 💰 Monetization through ads

## Tech Stack

- **Backend**: Node.js, Express, PostgreSQL
- **Frontend**: React (planned), currently HTML
- **AI**: Claude API (Anthropic)
- **Infrastructure**: Ubuntu 22.04, Nginx, PM2, Let's Encrypt

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Prompt-Machine/prompt-machine.git
cd prompt-machine

# Run setup script
./mvp-setup-manual-auth.sh

# Add your Claude API key to .env
nano .env

# Start the API
cd api && npm start
```

## Project Structure

```
prompt-machine/
├── api/              # Backend REST API
├── frontend/         # Web interface (React planned)
├── deployed-tools/   # Generated AI tools
├── scripts/          # Setup and utility scripts
├── CLAUDE.md        # Context for Claude Code
└── README.md        # This file
```

## Documentation

- `CLAUDE.md` - Comprehensive context for Claude Code
- `PROJECT_STRUCTURE.md` - Detailed file structure
- `TROUBLESHOOTING.md` - Common issues and solutions
- `TODO.md` - Current status and next steps
- `API_EXAMPLES.md` - API endpoint examples

## URLs

- API: https://api.prompt-machine.com
- Admin Dashboard: https://app.prompt-machine.com
- Deployed Tools: https://[tool-name].tool.prompt-machine.com

## Development

```bash
# Start in development mode
NODE_ENV=development npm run dev

# View logs
pm2 logs

# Connect to database
./scripts/db-connect.sh
```

## Current Status

🚧 **Under Development** - MVP in progress

See `TODO.md` for detailed status and next steps.

## License

Private repository - All rights reserved

## Contact

- GitHub: [Prompt-Machine](https://github.com/Prompt-Machine)
- Issues: Use GitHub Issues for bug reports