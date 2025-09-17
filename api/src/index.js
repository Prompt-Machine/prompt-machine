require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

// Import security middleware
const {
    generalRateLimit,
    helmetConfig,
    sanitizeInput,
    corsMiddleware
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('✅ Database connected:', res.rows[0].now);
    }
});

// Security middleware (temporarily simplified for debugging)
app.use(helmetConfig); // Security headers
// app.use(generalRateLimit); // General rate limiting - DISABLED for debugging
app.use(corsMiddleware); // Enhanced CORS with dynamic validation
app.use(express.json({ limit: '10mb' })); // JSON parser with size limit
// app.use(sanitizeInput); // Input sanitization - DISABLED for debugging

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../../frontend')));

// Health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT 1');
        res.json({ 
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Import additional security middleware
const {
    authRateLimit,
    toolGenerationRateLimit,
    analyticsRateLimit,
    projectCreationRateLimit
} = require('./middleware/security');

// Import routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const promptBuilderRoutes = require('./routes/prompt-builder');
const deployRoutes = require('./routes/deploy');
const publicToolsRoutes = require('./routes/publicTools');
const aiConfigRoutes = require('./routes/ai-config');
// V1 and V2 tool creators removed - see V3 and V4 for current implementations
const toolsV3Routes = require('./routes/toolsV3');
const promptEngineerV4Routes = require('./routes/promptEngineerV4');
const promptEngineerV5Routes = require('./routes/promptEngineerV5');
const promptEngineerV6Routes = require('./routes/promptEngineerV6');
const advertisingRoutes = require('./routes/advertising');
const analyticsRoutes = require('./routes/analytics_enhanced');
const userManagerRoutes = require('./routes/userManager');
const packagesRoutes = require('./routes/packages');
const earlyAccessRoutes = require('./routes/earlyAccess');
const adminRoutes = require('./routes/admin');
const clientManagerRoutes = require('./routes/clientManager');
const advancedUserManagementRoutes = require('./routes/advancedUserManagement');

// API Routes with specific rate limiting
app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/projects', projectCreationRateLimit, projectRoutes);
app.use('/api/prompt-builder', promptBuilderRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/tools', toolGenerationRateLimit, publicToolsRoutes); // PUBLIC tools endpoints for deployed tools
app.use('/api/ai-config', aiConfigRoutes);
app.use('/api/advertising', advertisingRoutes); // Advertising management
app.use('/api/v3', toolsV3Routes); // Production v3 wizard system (reference)
app.use('/api/v4', promptEngineerV4Routes); // Prompt Engineer v4 - AI-guided tool creation
app.use('/api/v5/prompt-engineer', promptEngineerV5Routes); // Prompt Engineer v5 - Field recommendation engine
app.use('/api/v5', promptEngineerV5Routes); // V5 tools management endpoints
app.use('/api/v6', toolGenerationRateLimit, promptEngineerV6Routes); // V6 multi-step project builder system
app.use('/api/analytics', analyticsRateLimit, analyticsRoutes); // Analytics and usage tracking
app.use('/api/users', userManagerRoutes); // User management and permissions
app.use('/api/packages', packagesRoutes); // Package management for subscriptions
app.use('/api/early-access', earlyAccessRoutes); // Early access registration
app.use('/api/admin', adminRoutes); // Admin dashboard and management
app.use('/api/admin', clientManagerRoutes); // Client management system
app.use('/api/admin', advancedUserManagementRoutes); // Advanced user management

// Basic routes
app.get('/', (req, res) => {
    res.json({
        name: 'Prompt Machine MVP API',
        version: '1.5.0-rc',
        endpoints: {
            health: '/health',
            auth: '/api/auth/login',
            me: '/api/auth/me',
            projects: '/api/projects',
            createProject: 'POST /api/projects',
            getProject: 'GET /api/projects/:id',
            promptBuilder: '/api/prompt-builder/start',
            sendMessage: 'POST /api/prompt-builder/message',
            getConversation: 'GET /api/prompt-builder/conversation/:projectId',
            deploy: 'POST /api/deploy/:projectId',
            deployStatus: 'GET /api/deploy/:projectId/status',
            toolGenerate: 'POST /api/tools/generate'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ MVP API running on port ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
});
