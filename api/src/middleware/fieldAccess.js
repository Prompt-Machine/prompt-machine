// ========================================
// FIELD ACCESS MIDDLEWARE v2.0.0rc
// Enhanced Permission Checking for Field-Level Control
// ========================================

const { Pool } = require('pg');
const PermissionManager = require('../services/permissionManager');

// Initialize database pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 
        `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize permission manager
const permissionManager = new PermissionManager();

/**
 * Middleware to check field-level access
 */
const checkFieldAccess = (requiredLevel = 'free') => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            const fieldId = req.params.fieldId || req.body.fieldId;
            
            if (!fieldId) {
                return next(); // No specific field to check
            }

            // Get user's package
            let userPackage = 'free';
            if (userId) {
                const packageResult = await pool.query(
                    `SELECT p.name FROM packages p
                     JOIN user_packages up ON p.id = up.package_id
                     WHERE up.user_id = $1 AND up.is_active = true
                     ORDER BY p.price DESC
                     LIMIT 1`,
                    [userId]
                );
                
                if (packageResult.rows.length > 0) {
                    userPackage = packageResult.rows[0].name;
                }
            }

            // Check field permission
            const hasAccess = await permissionManager.checkFieldAccess(userId, fieldId, userPackage);

            if (!hasAccess) {
                // Get upgrade prompt
                const upgradePrompt = await pool.query(
                    `SELECT up.* FROM upgrade_prompts up
                     JOIN field_permissions fp ON up.package_id = fp.package_id
                     WHERE fp.field_id = $1 AND up.is_active = true
                     LIMIT 1`,
                    [fieldId]
                );

                return res.status(403).json({
                    success: false,
                    error: 'Premium field access required',
                    upgradeRequired: true,
                    upgradePrompt: upgradePrompt.rows[0] || {
                        title: 'Upgrade to Premium',
                        message: 'This field requires a premium subscription',
                        cta_text: 'Upgrade Now',
                        cta_url: '/pricing'
                    }
                });
            }

            // Add field access info to request
            req.fieldAccess = {
                hasAccess: true,
                userPackage,
                fieldId
            };

            next();

        } catch (error) {
            console.error('Field access middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to check field permissions'
            });
        }
    };
};

/**
 * Middleware to filter response based on field permissions
 */
const filterFieldsByPermission = () => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            const projectId = req.params.projectId;
            
            if (!projectId) {
                return next();
            }

            // Get user's package
            let userPackageId = null;
            if (userId) {
                const packageResult = await pool.query(
                    `SELECT package_id FROM user_packages
                     WHERE user_id = $1 AND is_active = true
                     ORDER BY granted_at DESC
                     LIMIT 1`,
                    [userId]
                );
                
                if (packageResult.rows.length > 0) {
                    userPackageId = packageResult.rows[0].package_id;
                }
            }

            // Get accessible fields
            const accessibleFields = await permissionManager.getAccessibleFields(
                userId || 'anonymous',
                projectId
            );

            // Add to request
            req.accessibleFields = accessibleFields;
            req.userPackageId = userPackageId;

            next();

        } catch (error) {
            console.error('Field filter middleware error:', error);
            next(); // Continue even if filtering fails
        }
    };
};

/**
 * Middleware to check project-level access
 */
const checkProjectAccess = (requiredLevel = 'public') => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            const projectId = req.params.projectId;
            
            if (!projectId) {
                return next();
            }

            const access = await permissionManager.checkProjectAccess(userId, projectId);

            if (!access.hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: access.reason || 'Access denied',
                    requiredPackage: access.requiredPackage
                });
            }

            // Add access info to request
            req.projectAccess = access;

            next();

        } catch (error) {
            console.error('Project access middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to check project access'
            });
        }
    };
};

/**
 * Middleware to track field access analytics
 */
const trackFieldAccess = () => {
    return async (req, res, next) => {
        try {
            const fieldId = req.params.fieldId || req.body.fieldId;
            const userId = req.user?.userId;
            const sessionId = req.session?.id || req.headers['x-session-id'];
            
            if (fieldId) {
                // Track access attempt
                pool.query(
                    `INSERT INTO field_access_logs (
                        field_id, user_id, session_id,
                        access_granted, timestamp
                    ) VALUES ($1, $2, $3, $4, NOW())`,
                    [fieldId, userId, sessionId, req.fieldAccess?.hasAccess || false]
                ).catch(console.error); // Fire and forget
            }

            next();

        } catch (error) {
            console.error('Field tracking error:', error);
            next(); // Don't block on analytics
        }
    };
};

/**
 * Middleware to enforce calculation limits based on package
 */
const checkCalculationAccess = () => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            
            // Get user's package features
            const features = req.user?.features || {};
            
            // Check if calculations are allowed
            if (!features.calculations && req.body.enableCalculations) {
                return res.status(403).json({
                    success: false,
                    error: 'Calculations require a premium subscription',
                    upgradeRequired: true,
                    feature: 'calculations'
                });
            }

            // Check calculation complexity limit
            if (features.calculationComplexity) {
                const complexity = req.body.calculationComplexity || 1;
                if (complexity > features.calculationComplexity) {
                    return res.status(403).json({
                        success: false,
                        error: `Your plan supports calculation complexity up to level ${features.calculationComplexity}`,
                        upgradeRequired: true,
                        feature: 'advanced_calculations'
                    });
                }
            }

            next();

        } catch (error) {
            console.error('Calculation access error:', error);
            next(); // Allow if check fails
        }
    };
};

/**
 * Middleware to validate field count limits
 */
const checkFieldLimits = () => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.userId;
            const limits = req.user?.limits || {};
            const projectId = req.params.projectId;
            
            if (!limits.maxFields) {
                return next(); // No limit
            }

            // Count current fields
            const fieldCount = await pool.query(
                `SELECT COUNT(*) as count
                 FROM project_fields_v6 pf
                 JOIN project_steps_v6 ps ON pf.step_id = ps.id
                 JOIN projects_v6 p ON ps.project_id = p.id
                 WHERE p.id = $1 AND p.user_id = $2`,
                [projectId, userId]
            );

            const currentCount = parseInt(fieldCount.rows[0]?.count || 0);
            
            // Check if adding new field would exceed limit
            if (req.method === 'POST' && currentCount >= limits.maxFields) {
                return res.status(403).json({
                    success: false,
                    error: `Field limit reached. Your plan allows ${limits.maxFields} fields per project`,
                    upgradeRequired: true,
                    limit: 'maxFields',
                    current: currentCount,
                    maximum: limits.maxFields
                });
            }

            next();

        } catch (error) {
            console.error('Field limit check error:', error);
            next(); // Allow if check fails
        }
    };
};

/**
 * Middleware to add upgrade suggestions to response
 */
const addUpgradeSuggestions = () => {
    return async (req, res, next) => {
        // Store original res.json
        const originalJson = res.json.bind(res);
        
        res.json = async function(data) {
            try {
                // Only add suggestions if user is on free/basic plan
                if (req.user && (!req.user.packageName || req.user.packageName === 'free')) {
                    const projectId = req.params.projectId;
                    
                    if (projectId && data.success) {
                        // Get upgrade prompts
                        const upgradePrompts = await permissionManager.generateUpgradePrompts(
                            projectId,
                            req.user.packageName || 'free'
                        );
                        
                        if (upgradePrompts) {
                            data.upgradePrompts = upgradePrompts;
                        }
                    }
                }
            } catch (error) {
                console.error('Upgrade suggestion error:', error);
            }
            
            return originalJson(data);
        };
        
        next();
    };
};

/**
 * Middleware to validate permission configuration
 */
const validatePermissionConfig = () => {
    return (req, res, next) => {
        try {
            const { packageId, accessLevel } = req.body;
            
            if (packageId && accessLevel) {
                // Validate package exists
                pool.query(
                    'SELECT id FROM packages WHERE id = $1',
                    [packageId]
                ).then(result => {
                    if (result.rows.length === 0) {
                        return res.status(400).json({
                            success: false,
                            error: 'Invalid package ID'
                        });
                    }
                }).catch(console.error);
            }
            
            // Validate access level
            const validLevels = ['free', 'registered', 'premium', 'enterprise'];
            if (accessLevel && !validLevels.includes(accessLevel)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid access level'
                });
            }
            
            next();
            
        } catch (error) {
            console.error('Permission validation error:', error);
            return res.status(400).json({
                success: false,
                error: 'Invalid permission configuration'
            });
        }
    };
};

module.exports = {
    checkFieldAccess,
    filterFieldsByPermission,
    checkProjectAccess,
    trackFieldAccess,
    checkCalculationAccess,
    checkFieldLimits,
    addUpgradeSuggestions,
    validatePermissionConfig
};
