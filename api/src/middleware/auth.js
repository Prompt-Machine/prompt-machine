const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

/**
 * Enhanced authentication middleware with user context
 */
const verifyAuth = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization token required' 
            });
        }

        const token = authHeader.substring(7);
        
        // Verify JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    success: false,
                    error: 'Token expired' 
                });
            }
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token' 
            });
        }
        
        // Get user from database with package info
        const result = await pool.query(`
            SELECT 
                u.id, u.email, u.created_at,
                p.name as package_name,
                p.features,
                p.limits
            FROM users u
            LEFT JOIN user_packages up ON u.id = up.user_id AND up.is_active = true
            LEFT JOIN packages p ON up.package_id = p.id
            WHERE u.id = $1
        `, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const user = result.rows[0];
        
        // Add user info to request object
        req.user = {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            package: user.package_name || 'public',
            features: user.features || [],
            limits: user.limits || {
                projects_total: 3,
                projects_deployed: 1,
                tools_per_hour: 5,
                analytics_retention_days: 7
            }
        };

        next();

    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Authentication error' 
        });
    }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(); // Continue without user context
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const result = await pool.query(`
            SELECT 
                u.id, u.email,
                p.name as package_name,
                p.features,
                p.limits
            FROM users u
            LEFT JOIN user_packages up ON u.id = up.user_id AND up.is_active = true
            LEFT JOIN packages p ON up.package_id = p.id
            WHERE u.id = $1
        `, [decoded.userId]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            req.user = {
                id: user.id,
                email: user.email,
                package: user.package_name || 'public',
                features: user.features || [],
                limits: user.limits || {}
            };
        }

        next();

    } catch (error) {
        // Continue without authentication on error
        next();
    }
};

/**
 * Feature-based authorization middleware
 */
const requireFeature = (featureName) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ 
                    success: false,
                    error: 'Authentication required' 
                });
            }

            // Check if user has the required feature
            const hasFeature = req.user.features.includes(featureName);
            
            if (!hasFeature) {
                return res.status(403).json({ 
                    success: false,
                    error: `Feature '${featureName}' not available in your current package`,
                    upgrade_required: true
                });
            }

            next();

        } catch (error) {
            console.error('Feature check error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Authorization error' 
            });
        }
    };
};

/**
 * Project ownership verification middleware
 */
const requireProjectOwnership = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                error: 'Authentication required' 
            });
        }

        const projectId = req.params.projectId || req.params.id;
        if (!projectId) {
            return res.status(400).json({ 
                success: false,
                error: 'Project ID required' 
            });
        }

        // Check if user owns the project
        const result = await pool.query(
            'SELECT user_id FROM projects_v6 WHERE id = $1',
            [projectId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Project not found' 
            });
        }

        if (result.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ 
                success: false,
                error: 'Access denied' 
            });
        }

        next();

    } catch (error) {
        console.error('Project ownership check error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Authorization error' 
        });
    }
};

module.exports = {
    verifyAuth,
    optionalAuth,
    requireFeature,
    requireProjectOwnership
};