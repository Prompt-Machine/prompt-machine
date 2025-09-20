// ========================================
// PROMPT MACHINE COMPLETE SAAS API SERVER
// Version 2.0.0 Full Release
// ========================================

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Enable trust proxy for nginx reverse proxy
app.set('trust proxy', true);

// ========================================
// DATABASE CONNECTION
// ========================================

const pool = new Pool({
    host: process.env.DB_HOST || 'sql.prompt-machine.com',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'promptmachine_dbbeta',
    user: process.env.DB_USER || 'promptmachine_userbeta',
    password: process.env.DB_PASSWORD || '94oE1q7K',
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection error:', err);
        process.exit(1);
    } else {
        console.log('✅ Database connected:', res.rows[0].now);
    }
});

// Make pool available globally
global.dbPool = pool;

// ========================================
// MIDDLEWARE CONFIGURATION
// ========================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://app.prompt-machine.ca',
            'https://api.prompt-machine.ca',
            /\.tool\.prompt-machine\.ca$/
        ];

        if (!origin || allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) {
                return allowed.test(origin);
            }
            return allowed === origin;
        })) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../../frontend')));
app.use('/deployed-tools', express.static(path.join(__dirname, '../../deployed-tools')));

// ========================================
// RATE LIMITING
// ========================================

// General rate limit
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth rate limit
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true,
});

// API rate limit
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'API rate limit exceeded.',
});

// Tool generation rate limit
const toolGenerationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Tool generation rate limit exceeded.',
});

// Apply general rate limiter to all routes
app.use('/api/', generalLimiter);

// ========================================
// HEALTH & STATUS ENDPOINTS
// ========================================

app.get('/health', async (req, res) => {
    try {
        const dbCheck = await pool.query('SELECT 1');
        const memoryUsage = process.memoryUsage();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            memory: {
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
            },
            uptime: `${Math.round(process.uptime())}s`,
            version: '2.0.0'
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        api: 'operational',
        version: '2.0.0',
        features: {
            tools: true,
            analytics: true,
            billing: true,
            marketplace: true,
            deployments: true,
            collaboration: true
        }
    });
});

// ========================================
// IMPORT ROUTES
// ========================================

// Core routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const usersRoutes = require('./routes/users');
const clientsRoutes = require('./routes/clients');
const subscriptionsRoutes = require('./routes/subscriptions');
const billingRoutes = require('./routes/billing');

// Tool routes
const projectsRoutes = require('./routes/projects');
const promptEngineerV2Routes = require('./routes/promptEngineerV2');
const promptEngineerV6Routes = require('./routes/promptEngineerV6');
const deploymentsRoutes = require('./routes/deployments');
const toolsRoutes = require('./routes/tools');
const marketplaceRoutes = require('./routes/marketplace');

// Analytics & reporting routes
const analyticsRoutes = require('./routes/analytics');
const reportsRoutes = require('./routes/reports');

// Support & admin routes
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const settingsRoutes = require('./routes/settings');

// Additional routes
const notificationsRoutes = require('./routes/notifications');
const advertisingRoutes = require('./routes/advertising');
const auditRoutes = require('./routes/audit');

// ========================================
// MOUNT ROUTES
// ========================================

// Authentication & authorization
app.use('/api/auth', authLimiter, authRoutes);

// Dashboard & overview
app.use('/api/dashboard', apiLimiter, dashboardRoutes);

// User management
app.use('/api/users', apiLimiter, usersRoutes);

// Client management (B2B)
app.use('/api/clients', apiLimiter, clientsRoutes);

// Billing & subscriptions
app.use('/api/subscriptions', apiLimiter, subscriptionsRoutes);
app.use('/api/billing', apiLimiter, billingRoutes);

// Tool management
app.use('/api/projects', apiLimiter, projectsRoutes);
app.use('/api/v2/prompt-engineer', toolGenerationLimiter, promptEngineerV2Routes);
app.use('/api/v6', toolGenerationLimiter, promptEngineerV6Routes);
app.use('/api/deployments', apiLimiter, deploymentsRoutes);
app.use('/api/tools', apiLimiter, toolsRoutes);
app.use('/api/marketplace', apiLimiter, marketplaceRoutes);

// Analytics & reporting
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/reports', apiLimiter, reportsRoutes);

// Support & administration
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/support', apiLimiter, supportRoutes);
app.use('/api/settings', apiLimiter, settingsRoutes);

// Additional features
app.use('/api/notifications', apiLimiter, notificationsRoutes);
app.use('/api/advertising', apiLimiter, advertisingRoutes);
app.use('/api/audit', apiLimiter, auditRoutes);

// ========================================
// WEBHOOK ENDPOINTS
// ========================================

// Stripe webhook
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const subscriptionService = require('./services/subscriptionService');
    
    try {
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        await subscriptionService.processWebhook('stripe', event);
        res.json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// PayPal webhook
app.post('/api/webhooks/paypal', async (req, res) => {
    // PayPal webhook processing
    res.json({ received: true });
});

// ========================================
// API DOCUMENTATION
// ========================================

app.get('/api', (req, res) => {
    res.json({
        name: 'Prompt Machine SAAS API',
        version: '2.0.0',
        description: 'Complete AI Tool Creation Platform',
        documentation: 'https://docs.prompt-machine.ca',
        endpoints: {
            // Core
            health: 'GET /health',
            status: 'GET /api/status',
            
            // Authentication
            auth: {
                login: 'POST /api/auth/login',
                register: 'POST /api/auth/register',
                logout: 'POST /api/auth/logout',
                refresh: 'POST /api/auth/refresh',
                me: 'GET /api/auth/me',
                forgotPassword: 'POST /api/auth/forgot-password',
                resetPassword: 'POST /api/auth/reset-password',
                verifyEmail: 'POST /api/auth/verify-email'
            },
            
            // Dashboard
            dashboard: {
                stats: 'GET /api/dashboard/stats',
                overview: 'GET /api/dashboard/overview',
                charts: 'GET /api/dashboard/charts/:type',
                activity: 'GET /api/dashboard/activity',
                notifications: 'GET /api/dashboard/notifications'
            },
            
            // Users
            users: {
                list: 'GET /api/users',
                get: 'GET /api/users/:id',
                create: 'POST /api/users',
                update: 'PUT /api/users/:id',
                delete: 'DELETE /api/users/:id',
                stats: 'GET /api/users/:id/stats',
                permissions: 'GET /api/users/:id/permissions'
            },
            
            // Clients (B2B)
            clients: {
                list: 'GET /api/clients',
                get: 'GET /api/clients/:id',
                create: 'POST /api/clients',
                update: 'PUT /api/clients/:id',
                delete: 'DELETE /api/clients/:id',
                team: 'GET /api/clients/:id/team',
                addMember: 'POST /api/clients/:id/team',
                removeMember: 'DELETE /api/clients/:id/team/:userId'
            },
            
            // Subscriptions & Billing
            subscriptions: {
                plans: 'GET /api/subscriptions/plans',
                current: 'GET /api/subscriptions/current',
                create: 'POST /api/subscriptions',
                update: 'PUT /api/subscriptions/:id',
                cancel: 'POST /api/subscriptions/:id/cancel',
                resume: 'POST /api/subscriptions/:id/resume'
            },
            
            billing: {
                invoices: 'GET /api/billing/invoices',
                invoice: 'GET /api/billing/invoices/:id',
                paymentMethods: 'GET /api/billing/payment-methods',
                addPaymentMethod: 'POST /api/billing/payment-methods',
                removePaymentMethod: 'DELETE /api/billing/payment-methods/:id',
                setDefault: 'POST /api/billing/payment-methods/:id/default'
            },
            
            // Tools
            tools: {
                create: 'POST /api/v2/prompt-engineer/create',
                list: 'GET /api/tools',
                get: 'GET /api/tools/:id',
                update: 'PUT /api/tools/:id',
                delete: 'DELETE /api/tools/:id',
                deploy: 'POST /api/deployments/deploy',
                versions: 'GET /api/tools/:id/versions',
                analytics: 'GET /api/tools/:id/analytics'
            },
            
            // Marketplace
            marketplace: {
                browse: 'GET /api/marketplace',
                categories: 'GET /api/marketplace/categories',
                tool: 'GET /api/marketplace/tools/:id',
                submit: 'POST /api/marketplace/submit',
                purchase: 'POST /api/marketplace/purchase/:id',
                reviews: 'GET /api/marketplace/tools/:id/reviews'
            },
            
            // Analytics
            analytics: {
                overview: 'GET /api/analytics/overview',
                tools: 'GET /api/analytics/tools',
                users: 'GET /api/analytics/users',
                revenue: 'GET /api/analytics/revenue',
                events: 'POST /api/analytics/events',
                export: 'GET /api/analytics/export'
            },
            
            // Support
            support: {
                tickets: 'GET /api/support/tickets',
                createTicket: 'POST /api/support/tickets',
                ticket: 'GET /api/support/tickets/:id',
                updateTicket: 'PUT /api/support/tickets/:id',
                addMessage: 'POST /api/support/tickets/:id/messages'
            }
        },
        authentication: 'Bearer token required in Authorization header',
        rateLimit: {
            general: '100 requests per 15 minutes',
            auth: '5 attempts per 15 minutes',
            api: '60 requests per minute',
            toolGeneration: '10 requests per hour'
        }
    });
});

// ========================================
// FRONTEND ROUTES (SPA Fallback)
// ========================================

// Serve admin dashboard for admin routes
app.get('/admin*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin-dashboard.html'));
});

// Serve user dashboard for authenticated routes
app.get('/dashboard*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/user-dashboard.html'));
});

// Serve marketplace for public browsing
app.get('/marketplace*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/marketplace.html'));
});

// Serve login page for auth routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/login.html'));
});

// Serve registration page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/register.html'));
});

// Catch-all - serve main app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// ========================================
// ERROR HANDLING
// ========================================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    
    // Check for specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: err.details
        });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized access'
        });
    }
    
    // Default error response
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ========================================
// GRACEFUL SHUTDOWN
// ========================================

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
    console.log(`\n${signal} received: closing HTTP server`);
    
    server.close(() => {
        console.log('HTTP server closed');
        
        // Close database connection
        pool.end(() => {
            console.log('Database connections closed');
            process.exit(0);
        });
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

// ========================================
// START SERVER
// ========================================

const server = app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  PROMPT MACHINE SAAS API v2.0.0       ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  ✅ Server running on port ${PORT}        ║`);
    console.log(`║  🔗 http://localhost:${PORT}              ║`);
    console.log(`║  🌐 Environment: ${process.env.NODE_ENV || 'development'}      ║`);
    console.log('║  📊 Database: Connected                ║');
    console.log('║  🚀 All systems operational            ║');
    console.log('╚════════════════════════════════════════╝');
});

module.exports = app;
