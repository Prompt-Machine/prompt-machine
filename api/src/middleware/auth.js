const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// Database connection (using same config as main app)
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
const authenticateToken = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authorization token required' 
            });
        }

        // Extract token (remove "Bearer " prefix)
        const token = authHeader.substring(7);
        
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database to ensure they still exist
        const result = await pool.query(
            'SELECT id, email, created_at FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'User not found' 
            });
        }

        // Attach user info to request object
        req.user = result.rows[0];
        
        // Continue to next middleware/route handler
        next();

    } catch (error) {
        // Handle JWT-specific errors
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Invalid token' 
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expired' 
            });
        }
        
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require authentication
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without user
            req.user = null;
            return next();
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const result = await pool.query(
            'SELECT id, email, created_at FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length > 0) {
            req.user = result.rows[0];
        } else {
            req.user = null;
        }
        
        next();

    } catch (error) {
        // If token is invalid, continue without user
        req.user = null;
        next();
    }
};

module.exports = {
    authenticateToken,
    optionalAuth
};