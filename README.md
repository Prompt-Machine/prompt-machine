# 🚀 Prompt Machine v2.0.0rc

[![Version](https://img.shields.io/badge/version-2.0.0rc-blue.svg)](https://github.com/yourusername/prompt-machine)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-%3E%3D14.0-blue.svg)](https://www.postgresql.org/)

> Professional AI tool builder and deployment platform. Create, customize, and deploy AI-powered tools with multi-step workflows using enhanced Prompt Engineer v2.0.0rc with full authentication and dashboard systems.

## 🌟 Features

### Core Platform
- **🎯 Multi-Step Tool Builder**: Create complex AI workflows with guided user interfaces
- **⚡ Instant Deployment**: Deploy tools to custom subdomains with one click  
- **🤖 AI-Powered Generation**: Intelligent field recommendations and form building
- **💰 Monetization Ready**: Built-in advertising system with Google AdSense integration
- **📊 Enhanced Dashboard**: Real-time statistics with user-specific counters and analytics
- **🔐 Bulletproof Authentication**: Fixed login system with JWT-based user management
- **👥 Advanced User Management**: Role-based permissions and access control
- **📦 Package Management**: Subscription tiers and feature control
- **🛠️ V2 API System**: Enhanced Prompt Engineer V2 with full CRUD operations

### Advanced Capabilities
- **📝 Dynamic Form Generation**: AI-generated forms with smart field types
- **🎨 Professional UI/UX**: Modern, responsive interfaces with Tailwind CSS
- **🔧 Field Customization**: Drag-and-drop field management with type validation
- **📱 Mobile Responsive**: Optimized for all devices and screen sizes
- **🌐 Custom Domains**: Deploy tools to branded subdomains
- **💳 Payment Integration**: Ready for premium features and subscriptions
- **🎮 Early Access System**: Beta feature management and controlled rollouts
- **📈 Enhanced Analytics**: Deep insights with data export capabilities

## 🏗️ Architecture

### Technology Stack
- **Backend**: Node.js, Express.js, PostgreSQL
- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **AI Integration**: Claude API for intelligent content generation
- **Deployment**: PM2 process manager, Nginx reverse proxy
- **Database**: PostgreSQL with UUID-based architecture
- **Security**: JWT authentication, input validation, SQL injection protection

### System Components
```
prompt-machine/
├── api/                    # Express.js API server
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   ├── services/      # Business logic
│   │   └── middleware/    # Authentication & validation
│   └── package.json
├── frontend/              # Client-side application
│   ├── js/               # JavaScript modules
│   ├── css/              # Stylesheets
│   └── *.html            # Application pages
├── docs/                 # Documentation
├── scripts/              # Deployment & maintenance
└── deployed-tools/       # Generated AI tools
```

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18.0.0
- PostgreSQL ≥ 14.0
- PM2 (for production)
- Nginx (for reverse proxy)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/prompt-machine.git
   cd prompt-machine
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd api && npm install
   ```

3. **Set up environment variables**
   ```bash
   cp config/domains.env.example config/domains.env
   # Edit config/domains.env with your settings
   ```

4. **Initialize database**
   ```bash
   psql -U username -d database -f scripts/setup-database.sql
   ```

5. **Start the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   pm2 start ecosystem.config.js
   ```

### Configuration

Create `config/domains.env` with your settings:
```env
DB_HOST=your-database-host
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password
CLAUDE_API_KEY=your-claude-api-key
JWT_SECRET=your-jwt-secret
```

## 📖 Usage

### Creating AI Tools

1. **Access the Dashboard**: Navigate to `/` and log in
2. **Create New Project**: Click "Create Project" button
3. **Configure Tool**: Set up AI role, persona, and system prompts
4. **Build Multi-Step Form**: Use Prompt Engineer v6.1.0rc to create workflow steps
5. **Deploy**: Click deploy to generate live tool at `toolname.tool.yourdomain.com`

### Example Tool Creation
```javascript
// API endpoint for creating projects
POST /api/v6/projects
{
  "name": "Story Writer",
  "description": "AI-powered creative writing assistant",
  "ai_role": "Creative Writing Expert",
  "ai_persona_description": "Professional storyteller and writing coach",
  "system_prompt": "You are an expert creative writing assistant..."
}
```

### Managing Tools

- **Edit**: Modify existing tools with real-time preview
- **Deploy**: Push changes to live tools instantly  
- **Analytics**: View usage statistics and performance metrics
- **Monetization**: Enable/disable advertising per tool
- **Access Control**: Manage user permissions and tool visibility

## 🔧 API Reference

### Authentication
```bash
POST /api/auth/login
POST /api/auth/me
```

### Projects (V6)
```bash
GET    /api/v6/projects          # List all projects
POST   /api/v6/projects          # Create new project
GET    /api/v6/projects/:id      # Get project details
PUT    /api/v6/projects/:id      # Update project
DELETE /api/v6/projects/:id      # Delete project
POST   /api/v6/projects/:id/deploy # Deploy project
```

### Dashboard (V2)
```bash
GET    /api/v2/dashboard/stats   # Get user dashboard statistics
```

### Prompt Engineer (V2)
```bash
GET    /api/v2/prompt-engineer/projects         # List user projects
POST   /api/v2/prompt-engineer/create-project   # Create new project
POST   /api/v2/prompt-engineer/analyze-request  # AI analysis
GET    /api/v2/prompt-engineer/templates        # Get tool templates
```

### Public Tools
```bash
GET    /api/public/tools/:subdomain    # Get tool configuration
POST   /api/public/tools/:subdomain    # Submit tool form
```

## 🎨 Customization

### Adding Custom Field Types
```javascript
// In services/fieldRecommendations.js
const customFieldType = {
  type: 'custom-slider',
  label: 'Value Slider',
  validation: { min: 0, max: 100 },
  render: (field) => `<input type="range" ...>`
};
```

### Theming
Customize appearance by modifying Tailwind CSS classes in frontend templates or adding custom CSS:

```css
/* Custom theme colors */
:root {
  --primary-color: #your-brand-color;
  --secondary-color: #your-accent-color;
}
```

## 🔐 Security

### Authentication Flow
- JWT-based authentication with secure session management
- Password hashing using bcrypt with salt rounds
- Input validation and sanitization on all endpoints
- SQL injection prevention with parameterized queries

### Best Practices Implemented
- ✅ HTTPS enforcement
- ✅ CORS configuration
- ✅ Rate limiting
- ✅ Input validation
- ✅ SQL injection protection
- ✅ XSS prevention
- ✅ Secure headers

## 📊 Monitoring & Analytics

### Built-in Metrics
- Tool usage statistics
- User engagement tracking
- Performance monitoring
- Error logging and alerting

### Integration Options
- Google Analytics support
- Custom event tracking
- Database query performance metrics
- API response time monitoring

## 🚢 Deployment

### Production Setup

1. **Server Configuration**
   ```bash
   # Install dependencies
   sudo apt update && sudo apt install -y nodejs npm postgresql nginx pm2
   
   # Configure Nginx
   sudo cp scripts/nginx.conf /etc/nginx/sites-available/prompt-machine
   sudo ln -s /etc/nginx/sites-available/prompt-machine /etc/nginx/sites-enabled/
   ```

2. **SSL Setup**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com -d *.tool.yourdomain.com
   ```

3. **Start Services**
   ```bash
   pm2 start ecosystem.config.js
   pm2 startup
   pm2 save
   ```

### Environment Variables (Production)
```env
NODE_ENV=production
PORT=3000
DB_HOST=production-db-host
CLAUDE_API_KEY=production-api-key
JWT_SECRET=secure-production-secret
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:api
npm run test:frontend

# Run with coverage
npm run test:coverage
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow ESLint configuration
- Add tests for new features
- Update documentation as needed
- Use conventional commit messages

## 📋 Changelog

### v2.0.0rc - Major Authentication & Dashboard Release
- 🔥 **FIXED: Complete Authentication System**: Resolved 502 Bad Gateway errors and login flow
- 🔧 **Express Trust Proxy**: Fixed nginx reverse proxy configuration for proper rate limiting
- 📊 **Dashboard Stats API**: New `/api/v2/dashboard/stats` endpoint with user-specific statistics
- 🛠️ **Enhanced V2 API**: Fully functional Prompt Engineer V2 routes with all features enabled
- 🔐 **Security Hardening**: Rate limiting, CORS, input validation, and SQL injection protection
- 📦 **Dependency Management**: Fixed missing @anthropic-ai/sdk and UUID compatibility issues
- 🚀 **Frontend Token Handling**: Corrected JavaScript token access for seamless login experience
- ⚡ **Universal Services**: Added Calculation Engine, Permission Manager, and Universal Generator
- 🎯 **Assessment Engine**: Advanced field recommendations and AI-powered form generation
- 🔄 **Zero Downtime**: All functionality restored without disabling features

### v1.5.0rc - Release Candidate  
- ✅ **Prompt Engineer v6.1.0rc**: Enhanced multi-step tool builder with improved functionality
- ✅ **Advanced User Management**: Role-based access control and permission systems
- ✅ **Package Management**: Subscription tiers and feature control
- ✅ **Enhanced Analytics**: Real-time analytics with data export capabilities  
- ✅ **Early Access System**: Beta feature management and controlled rollouts
- ✅ **Security Improvements**: Enhanced authentication and input validation
- ✅ **Bug Fixes**: Resolved demo warnings and CRUD operation issues
- ✅ **Code Cleanup**: Removed deprecated files and optimized codebase

### v1.0.0-alpha - Alpha Release
- ✅ Complete multi-step tool builder (Prompt Engineer V6)
- ✅ Instant tool deployment system
- ✅ Advertising monetization platform
- ✅ Professional UI/UX with versioning
- ✅ Database optimization (v2-v5 legacy cleanup)
- ✅ Comprehensive documentation
- ✅ Production-ready security features

## 🐛 Known Issues

### Resolved in v2.0.0rc ✅
- ~~502 Bad Gateway authentication errors~~ → **FIXED**
- ~~Dashboard statistics not loading~~ → **FIXED** 
- ~~V2 API routes disabled~~ → **FIXED**
- ~~Frontend token handling errors~~ → **FIXED**

### Current Status
- No critical issues reported in v2.0.0rc
- All authentication and dashboard functionality working properly
- Complete API ecosystem operational

## 📞 Support

### Documentation
- [Setup Guide](docs/setup/server-setup-script.sh)
- [API Documentation](docs/reference/)
- [Troubleshooting](docs/reference/16-troubleshooting-guide.md)

### Community
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Join our community discussions
- **Wiki**: Comprehensive guides and examples

### Enterprise Support
For enterprise support, custom development, or consulting services, contact:
- **LLnet Inc**: [https://llnet.ca](https://llnet.ca)
- **Development**: Powered by [Anthropic Claude Code](https://claude.ai/code)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Built with**: [Anthropic Claude Code](https://claude.ai/code)
- **Powered by**: Claude AI for intelligent content generation
- **UI Framework**: Tailwind CSS for modern responsive design
- **Database**: PostgreSQL for robust data management
- **Process Management**: PM2 for production deployment

## 🔗 Links

- **Live Demo**: [https://app.prompt-machine.com](https://app.prompt-machine.com)
- **Documentation**: [https://docs.prompt-machine.com](https://docs.prompt-machine.com)
- **API Status**: [https://status.prompt-machine.com](https://status.prompt-machine.com)

---

<div align="center">

**Built with ❤️ by LLnet Inc & Anthropic Claude Code**

[Website](https://llnet.ca) • [Documentation](docs/) • [Support](https://github.com/yourusername/prompt-machine/issues)

</div>