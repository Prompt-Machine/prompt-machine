const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { validationResult } = require('express-validator');

// Rate limiting configurations
const createRateLimit = (windowMs, max, message, skipSuccessfulRequests = false) => {
    return rateLimit({
        windowMs,
        max,
        message: { error: message },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        keyGenerator: (req) => {
            // Use IP + user ID if authenticated, otherwise just IP
            const userKey = req.user?.id || '';
            const ip = req.ip || req.connection.remoteAddress || 'unknown';
            // Handle IPv6 addresses properly
            const cleanIp = ip.replace(/^::ffff:/, '');
            return `${cleanIp}:${userKey}`;
        },
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                error: message,
                retryAfter: Math.round(windowMs / 1000)
            });
        }
    });
};

// General API rate limit - 100 requests per 15 minutes per IP
const generalRateLimit = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    100,
    'Too many requests from this IP, please try again later.'
);

// Authentication rate limit - 5 login attempts per 15 minutes
const authRateLimit = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    5,
    'Too many login attempts, please try again later.'
);

// Tool generation rate limit - 10 per hour per user
const toolGenerationRateLimit = createRateLimit(
    60 * 60 * 1000, // 1 hour
    10,
    'Tool generation limit exceeded. Please upgrade your package for higher limits.',
    true // Skip successful requests to not penalize legitimate usage
);

// Analytics tracking rate limit - 1000 per hour per IP (high limit for deployed tools)
const analyticsRateLimit = createRateLimit(
    60 * 60 * 1000, // 1 hour
    1000,
    'Analytics tracking rate limit exceeded.'
);

// Project creation rate limit - 20 per day per user
const projectCreationRateLimit = createRateLimit(
    24 * 60 * 60 * 1000, // 24 hours
    20,
    'Project creation limit exceeded. Please upgrade your package for higher limits.'
);

// Helmet security configuration
const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Required for Tailwind and embedded scripts
                "https://cdn.tailwindcss.com",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // Required for Tailwind
                "https://cdn.tailwindcss.com",
                "https://cdnjs.cloudflare.com",
                "https://fonts.googleapis.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
                "'self'",
                "https://app.prompt-machine.com",
                "https://*.prompt-machine.com"
            ]
        }
    },
    crossOriginEmbedderPolicy: false // Allow embedding for deployed tools
});

// Input validation middleware
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

// SQL injection protection middleware
const sanitizeInput = (req, res, next) => {
    const sanitize = (obj) => {
        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                // Remove potentially dangerous SQL keywords and characters
                obj[key] = obj[key]
                    .replace(/['";\\]/g, '') // Remove quotes and backslashes
                    .replace(/\b(DROP|DELETE|INSERT|UPDATE|EXEC|UNION|SELECT)\b/gi, '') // Remove SQL keywords
                    .trim();
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitize(obj[key]);
            }
        }
    };

    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    
    next();
};

// Enhanced CORS middleware with dynamic origin validation
const corsMiddleware = (req, res, next) => {
    const origin = req.get('Origin');
    const allowedOrigins = [
        'https://app.prompt-machine.com',
        'http://localhost:3000',
        /^https:\/\/.*\.prompt-machine\.com$/
    ];

    let isAllowed = false;
    
    for (const allowed of allowedOrigins) {
        if (typeof allowed === 'string') {
            if (origin === allowed) {
                isAllowed = true;
                break;
            }
        } else if (allowed instanceof RegExp) {
            if (allowed.test(origin)) {
                isAllowed = true;
                break;
            }
        }
    }

    if (isAllowed || !origin) { // Allow same-origin requests
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
    }

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
};

// Package-based rate limit enforcement
const enforcePackageLimits = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(); // Skip for unauthenticated requests
        }

        const { Pool } = require('pg');
        const pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: { rejectUnauthorized: false }
        });

        // Get user's current limits
        const limitsResult = await pool.query('SELECT get_user_limits($1) as limits', [req.user.id]);
        const limits = limitsResult.rows[0]?.limits;

        if (!limits) {
            return next();
        }

        // Check specific endpoint limits
        const endpoint = req.route?.path;
        const method = req.method;

        // Tool generation limits
        if (endpoint === '/generate' && method === 'POST') {
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const usageResult = await pool.query(
                'SELECT COUNT(*) FROM projects_v6 WHERE user_id = $1 AND created_at > $2',
                [req.user.id, hourAgo]
            );
            const usage = parseInt(usageResult.rows[0].count);

            if (usage >= limits.tools_per_hour) {
                return res.status(429).json({
                    success: false,
                    error: 'Hourly tool generation limit exceeded',
                    limit: limits.tools_per_hour,
                    usage
                });
            }
        }

        next();
    } catch (error) {
        console.error('Error enforcing package limits:', error);
        next(); // Continue on error to avoid blocking the request
    }
};

module.exports = {
    generalRateLimit,
    authRateLimit,
    toolGenerationRateLimit,
    analyticsRateLimit,
    projectCreationRateLimit,
    helmetConfig,
    handleValidationErrors,
    sanitizeInput,
    corsMiddleware,
    enforcePackageLimits
};