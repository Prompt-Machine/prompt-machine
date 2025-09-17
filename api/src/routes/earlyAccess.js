const express = require('express');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

const router = express.Router();

// Validation rules for early access registration
const registrationValidation = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('company')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name must be less than 100 characters'),
    body('useCase')
        .isIn(['business', 'education', 'content', 'customer-service', 'personal', 'development', 'marketing', 'other'])
        .withMessage('Please select a valid use case'),
    body('experience')
        .optional()
        .isIn(['beginner', 'intermediate', 'advanced'])
        .withMessage('Please select a valid experience level'),
    body('feedback')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Feedback must be less than 1000 characters'),
    body('newsletter')
        .optional()
        .isBoolean()
        .withMessage('Newsletter preference must be boolean')
];

// Handle validation errors
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

/**
 * POST /api/early-access/register
 * Register for early access to premium features
 */
router.post('/register', registrationValidation, handleValidationErrors, async (req, res) => {
    try {
        const {
            email,
            name,
            company,
            useCase,
            experience,
            feedback,
            newsletter
        } = req.body;

        // Get client information
        const userIp = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        // Check if email already exists
        const existingUser = await pool.query(
            'SELECT id FROM early_access_signups WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Email already registered for early access',
                message: 'This email is already on our early access list. We\'ll notify you when premium features are available!'
            });
        }

        // Create early access signup record
        const insertQuery = `
            INSERT INTO early_access_signups 
            (email, name, company, use_case, experience_level, feedback, newsletter_opt_in, user_ip, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, created_at
        `;

        const result = await pool.query(insertQuery, [
            email,
            name,
            company || null,
            useCase,
            experience || null,
            feedback || null,
            newsletter !== false, // Default to true if not specified
            userIp,
            userAgent
        ]);

        const signup = result.rows[0];

        // Log successful registration
        console.log(`✅ New early access signup: ${email} (ID: ${signup.id})`);

        // Send welcome email (if email service is configured)
        try {
            await sendWelcomeEmail(email, name);
        } catch (emailError) {
            console.warn('Failed to send welcome email:', emailError.message);
            // Don't fail the registration if email fails
        }

        res.json({
            success: true,
            message: 'Successfully registered for early access!',
            data: {
                id: signup.id,
                email: email,
                registeredAt: signup.created_at
            }
        });

    } catch (error) {
        console.error('Early access registration error:', error);
        
        res.status(500).json({
            success: false,
            error: 'Registration failed',
            message: 'An error occurred while processing your registration. Please try again or contact support.'
        });
    }
});

/**
 * GET /api/early-access/stats
 * Get early access registration statistics (for admin use)
 */
router.get('/stats', async (req, res) => {
    try {
        // Get basic stats from users table
        const statsQuery = `
            SELECT 
                COUNT(*) as total_signups,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as signups_last_24h,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as signups_last_week,
                COUNT(*) FILTER (WHERE early_access_status = 'activated') as activated_users
            FROM users
            WHERE early_access_status IS NOT NULL
        `;

        const useCaseQuery = `
            SELECT 
                early_access_use_case as use_case,
                COUNT(*) as count,
                ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM users WHERE early_access_status IS NOT NULL)), 2) as percentage
            FROM users
            WHERE early_access_use_case IS NOT NULL
            GROUP BY early_access_use_case
            ORDER BY count DESC
        `;

        const experienceQuery = `
            SELECT 
                early_access_experience_level as experience_level,
                COUNT(*) as count
            FROM users
            WHERE early_access_experience_level IS NOT NULL
            GROUP BY early_access_experience_level
            ORDER BY count DESC
        `;

        const [statsResult, useCaseResult, experienceResult] = await Promise.all([
            pool.query(statsQuery),
            pool.query(useCaseQuery),
            pool.query(experienceQuery)
        ]);

        res.json({
            success: true,
            stats: statsResult.rows[0],
            useCases: useCaseResult.rows,
            experienceLevels: experienceResult.rows
        });

    } catch (error) {
        console.error('Early access stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load statistics'
        });
    }
});

/**
 * GET /api/early-access/list
 * Get list of early access signups (for admin use)
 */
router.get('/list', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                id,
                email,
                early_access_status as status,
                early_access_use_case as use_case,
                early_access_experience_level as experience_level,
                early_access_feedback as feedback,
                early_access_invited_at as invited_at,
                early_access_activated_at as activated_at,
                created_at
            FROM users
            WHERE early_access_status IS NOT NULL
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = 'SELECT COUNT(*) FROM users WHERE early_access_status IS NOT NULL';

        const [listResult, countResult] = await Promise.all([
            pool.query(query, [limit, offset]),
            pool.query(countQuery)
        ]);

        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            signups: listResult.rows,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Early access list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load signups list'
        });
    }
});

// Mock function for sending welcome email
async function sendWelcomeEmail(email, name) {
    // In a real implementation, this would integrate with an email service
    // like SendGrid, Mailgun, or AWS SES
    console.log(`📧 Would send welcome email to ${email} (${name})`);
    
    // Simulate email sending
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log(`✅ Welcome email sent to ${email}`);
            resolve();
        }, 100);
    });
}

module.exports = router;