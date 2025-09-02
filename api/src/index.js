require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

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

// CORS configuration
const corsOptions = {
    origin: [
        'https://app.prompt-machine.com',
        'http://localhost:3000',  // for development
        /^https:\/\/.*\.prompt-machine\.com$/  // Allow all subdomains for deployed tools
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options('*', cors(corsOptions));

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/prompt-builder', promptBuilderRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/tools', publicToolsRoutes); // PUBLIC tools endpoints for deployed tools
app.use('/api/ai-config', aiConfigRoutes);
app.use('/api/advertising', advertisingRoutes); // Advertising management
app.use('/api/v3', toolsV3Routes); // Production v3 wizard system (reference)
app.use('/api/v4', promptEngineerV4Routes); // Prompt Engineer v4 - AI-guided tool creation
app.use('/api/v5/prompt-engineer', promptEngineerV5Routes); // Prompt Engineer v5 - Field recommendation engine
app.use('/api/v5', promptEngineerV5Routes); // V5 tools management endpoints
app.use('/api/v6', promptEngineerV6Routes); // V6 multi-step project builder system

// Basic routes
app.get('/', (req, res) => {
    res.json({
        name: 'Prompt Machine MVP API',
        version: '1.0.0',
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
