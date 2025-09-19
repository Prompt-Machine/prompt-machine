# 🚀 OPUS 4.1 PROMPT: Create Prompt Engineer v1.5.0rc

## MISSION: Advanced AI-Powered Assessment Tool Creator with Field-Level Permissions

You are tasked with creating **Prompt Engineer v1.5.0rc** - a revolutionary tool that combines AI-powered flexibility with professional assessment capabilities (like your pregnancy tool) but for ANY domain, with sophisticated field-level permission control.

---

## 🏗️ CURRENT SYSTEM ARCHITECTURE OVERVIEW

### **Tech Stack:**
- **Backend**: Node.js + Express.js + PostgreSQL
- **Frontend**: Vanilla JavaScript + Tailwind CSS (NO React/frameworks)
- **Auth**: JWT tokens with bcrypt password hashing
- **Database**: PostgreSQL with UUID primary keys
- **Deployment**: PM2 + Nginx reverse proxy
- **AI**: Claude API for content generation

### **File Structure:**
```
/home/ubuntu/prompt-machine/
├── api/src/
│   ├── index.js                 # Main Express server
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication
│   │   ├── security.js         # Rate limiting, CORS
│   │   └── validation.js       # Input validation
│   ├── routes/
│   │   ├── auth.js             # Login/register
│   │   ├── promptEngineerV6.js # Current V6 routes
│   │   ├── packages.js         # Package management
│   │   └── [others...]
│   └── services/
│       ├── claude.js           # AI integration
│       └── toolGeneratorV6.js  # Tool deployment
├── frontend/
│   ├── prompt-engineer-v6.html # Current V6 interface
│   ├── js/
│   │   ├── config.js           # Environment config
│   │   ├── prompt-engineer-v6.js # Current V6 JS
│   │   └── navigation.js       # Common UI functions
│   └── css/
│       └── tailwind.css        # Tailwind styles
└── deployed-tools/             # Generated tools go here
    └── [subdomain-name]/       # Each tool gets folder
        ├── index.html
        ├── app.js
        └── style.css
```

---

## 🗄️ DATABASE SCHEMA (Key Tables)

### **users** table:
- `id` (UUID, PK)
- `email` (varchar, unique)
- `password_hash` (varchar)
- `permission_group_id` (UUID, FK to permission_groups)
- `first_name`, `last_name` (varchar)
- `account_status` (varchar: 'active', 'suspended', etc.)

### **packages** table:
- `id` (UUID, PK)
- `name` (varchar, unique - 'free', 'premium', 'enterprise')
- `display_name` (varchar)
- `features` (JSONB - feature flags)
- `limits` (JSONB - usage limits)
- `price` (numeric)
- `is_active` (boolean)

### **user_packages** table:
- `user_id` (UUID, FK to users)
- `package_id` (UUID, FK to packages)
- `is_active` (boolean)
- `granted_at` (timestamp)

### **projects_v6** table:
- `id` (UUID, PK)
- `user_id` (UUID, FK to users)
- `name` (varchar)
- `description` (text)
- `ai_role` (text)
- `ai_persona_description` (text)
- `system_prompt` (text)
- `subdomain` (varchar, unique)
- `deployed` (boolean)
- `enabled` (boolean)
- `access_level` (varchar: 'public', 'registered', 'premium')
- `required_package_id` (UUID, FK to packages)
- `monetization_enabled` (boolean)
- `google_ads_code` (text)

### **project_steps_v6** table:
- `id` (UUID, PK)
- `project_id` (UUID, FK to projects_v6)
- `name` (varchar)
- `description` (text)
- `step_order` (integer)
- `page_title` (varchar)
- `page_subtitle` (text)

### **project_fields_v6** table:
- `id` (UUID, PK)
- `step_id` (UUID, FK to project_steps_v6)
- `name` (varchar)
- `label` (varchar)
- `field_type` (varchar: 'select', 'multiselect', 'text', 'textarea', 'number', 'date')
- `placeholder` (text)
- `description` (text)
- `is_required` (boolean)
- `field_order` (integer)
- `validation_rules` (JSONB)
- **NEW FIELD NEEDED**: `required_package_id` (UUID, FK to packages) - Controls which package level can see this field
- **NEW FIELD NEEDED**: `weight_in_calculation` (numeric) - For probability calculations

### **project_choices_v6** table:
- `id` (UUID, PK)
- `field_id` (UUID, FK to project_fields_v6)
- `choice_text` (varchar)
- `choice_value` (varchar)
- `choice_order` (integer)
- **NEW FIELD NEEDED**: `probability_weight` (numeric) - Weight for calculations

---

## 🔐 AUTHENTICATION & PERMISSION SYSTEM

### **Authentication Pattern:**
```javascript
// All API routes use this middleware
const verifyAuth = async (req, res, next) => {
    // Gets JWT from Authorization: Bearer [token]
    // Validates token and populates req.user with:
    req.user = {
        userId: 'uuid',
        email: 'user@example.com',
        packageName: 'premium',
        features: {...}, // From packages.features
        limits: {...}    // From packages.limits
    };
};
```

### **Permission Checking Pattern:**
```javascript
// Example of how to check if user has access to a feature
const hasFeature = (req, featureName) => {
    return req.user.features && req.user.features[featureName] === true;
};
```

---

## 📡 API PATTERNS & CONVENTIONS

### **Endpoint Naming:**
- Use `/api/v1.5/prompt-engineer/` for new routes
- RESTful: GET/POST/PUT/DELETE
- Always return JSON with `{success: boolean, data?: any, error?: string}`

### **Standard Response Format:**
```javascript
res.json({
    success: true,
    data: {...},
    message: "Operation completed"
});

// Or for errors:
res.status(400).json({
    success: false,
    error: "Error message"
});
```

### **Database Query Pattern:**
```javascript
const pool = new Pool({...}); // Already configured
const result = await pool.query('SELECT * FROM table WHERE id = $1', [id]);
```

---

## 🎨 FRONTEND PATTERNS & CONVENTIONS

### **JavaScript Class Pattern:**
```javascript
class PromptEngineerV150rc {
    constructor() {
        this.currentProject = null;
        this.userPermissions = null;
        this.init();
    }
    
    async init() {
        await this.loadUserPermissions();
        this.bindEvents();
    }
    
    async apiCall(endpoint, options = {}) {
        return PMConfig.fetch(endpoint, options); // Uses config.js
    }
}

// Global initialization
window.promptEngineer = new PromptEngineerV150rc();
```

### **DOM Manipulation:**
- Use vanilla JavaScript (document.getElementById, querySelector)
- Tailwind CSS for styling
- Event delegation for dynamic content

### **Error Handling:**
```javascript
try {
    const response = await this.apiCall('/api/v1.5/endpoint');
    if (response.success) {
        // Handle success
    } else {
        this.showError(response.error);
    }
} catch (error) {
    this.showError('Network error occurred');
}
```

---

## 🎯 REVOLUTIONARY FEATURES TO IMPLEMENT

### **1. AI-Generated Professional Assessment Tools**
Like your pregnancy tool but for ANY domain:
- Medical: Symptom assessments, risk calculators
- Business: Market analysis, investment risk, compliance
- Legal: Contract analysis, risk assessment
- Educational: Skill assessments, career guidance
- Creative: Project planning, style analysis

### **2. Field-Level Permission Control (REVOLUTIONARY)**
```javascript
// Example field definition with permission control
{
    id: 'advanced-symptom-analysis',
    label: 'Advanced Medical History Analysis', 
    field_type: 'multiselect',
    required_package_id: 'premium-package-uuid',
    weight_in_calculation: 25, // Higher weight for premium fields
    options: [
        {text: 'Previous surgeries', weight: 10},
        {text: 'Family medical history', weight: 15},
        {text: 'Current medications', weight: 20}
    ]
}
```

### **3. Tiered Access with Upgrade Prompts**
On public tool pages, show:
- **Free users**: Basic fields only
- **Premium users**: All fields unlocked
- **Locked fields**: Grayed out with "Upgrade to unlock this feature" overlay

### **4. Sophisticated Probability Calculations**
Like your pregnancy tool's weighted system but AI-generated for any domain.

### **5. Professional Report Generation**
Domain-specific analysis with:
- Color-coded results
- Contributing factors breakdown
- Personalized recommendations
- Professional disclaimers

---

## 🚀 SPECIFIC REQUIREMENTS

### **Core Workflow:**
1. **Admin creates tool**: Uses new interface to define assessment type
2. **AI generates structure**: Creates professional question categories and fields
3. **Permission assignment**: Admin sets which fields require which packages
4. **Weight configuration**: AI suggests probability weights, admin can adjust
5. **Deployment**: Creates public tool with tiered access

### **Field Types Needed:**
- `select` (single choice with weights)
- `multiselect` (multiple choices with weights)
- `scale` (1-10 rating with weights)
- `text` (open text)
- `textarea` (longer text)
- `number` (numeric input)
- `date` (date picker)

### **Calculation Engine:**
```javascript
// Pseudo-code for calculation
const calculateResult = (responses, userPackage) => {
    let score = baseScore;
    let factors = {increase: [], decrease: [], neutral: []};
    
    responses.forEach(response => {
        const field = getField(response.fieldId);
        
        // Only count if user has access to this field
        if (hasFieldAccess(userPackage, field.required_package_id)) {
            score += response.weight * field.weight_in_calculation;
            factors.increase.push(response.explanation);
        }
    });
    
    return {score, factors, upgradePrompts: getUpgradePrompts(userPackage)};
};
```

---

## 📋 DELIVERABLES NEEDED

### **1. Backend Files:**
- `api/src/routes/promptEngineerV150rc.js` - All API endpoints
- Updated `api/src/middleware/auth.js` - Enhanced permission checking
- Migration SQL for new database fields

### **2. Frontend Files:**
- `frontend/prompt-engineer-v150rc.html` - Main interface
- `frontend/js/prompt-engineer-v150rc.js` - JavaScript logic
- `frontend/js/assessment-engine.js` - Calculation and rendering
- Updated CSS for tiered access UI

### **3. Tool Generator:**
- Enhanced `api/src/services/toolGeneratorV150rc.js` - Creates professional assessment tools
- Template files for generated tools

### **4. Database Updates:**
- SQL migration script for new fields
- Package configuration examples

---

## 🎨 UI/UX REQUIREMENTS

### **Admin Interface:**
- Clean, professional design matching current V6 style
- Drag-and-drop field ordering
- Visual permission indicators
- Real-time preview of public tool
- Weight adjustment sliders

### **Public Tool Interface:**
- Progress bar like your pregnancy tool
- Professional styling with domain-appropriate colors
- Locked field overlays with upgrade prompts
- Comprehensive report generation
- Mobile-responsive design

---

## 🔧 INTEGRATION REQUIREMENTS

### **Must integrate seamlessly with:**
- Current authentication system
- Package management system
- Tool deployment system
- Analytics system
- Monetization system

### **File Naming Convention:**
- Use `v150rc` suffix for all new files
- Keep existing V6 files intact
- New API routes under `/api/v1.5/`

---

## 📝 SUCCESS CRITERIA

1. **Admin can create ANY type of assessment tool** (medical, business, legal, etc.)
2. **Field-level permission control works perfectly**
3. **Public tools show tiered access with upgrade prompts**
4. **Professional reports generated for any domain**
5. **Seamless integration with existing system**
6. **Mobile-responsive and accessible**

---

## 🚀 FINAL REQUEST

Create a complete, production-ready **Prompt Engineer v1.5.0rc** that revolutionizes how AI assessment tools are created and monetized. Include all files, API endpoints, database migrations, and detailed deployment instructions.

**Remember**: This must work with our exact server stack and integrate perfectly with the existing system. The field-level permission system is the game-changing feature that will drive revenue through natural upgrade paths.

After providing all the code and files, please provide:
1. **File placement instructions** for the server
2. **Database migration commands**
3. **A detailed prompt for Claude** to implement everything on the server

This will be the most advanced AI tool creation platform ever built! 🎯