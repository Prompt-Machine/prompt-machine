// ========================================
// PERMISSION MANAGER SERVICE v2.0.0rc
// Field-Level Access Control & Monetization Engine
// ========================================

const { Pool } = require('pg');

class PermissionManager {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || 
                `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        // Define package hierarchy
        this.packageHierarchy = {
            free: 0,
            registered: 1,
            basic: 2,
            premium: 3,
            enterprise: 4
        };

        // Cache for performance
        this.permissionCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Check if user has access to a specific field
     */
    async checkFieldAccess(userId, fieldId, userPackageId) {
        try {
            // Check cache first
            const cacheKey = `${userId}-${fieldId}`;
            const cached = this.permissionCache.get(cacheKey);
            
            if (cached && cached.timestamp > Date.now() - this.cacheTimeout) {
                return cached.hasAccess;
            }

            // Get field permission requirements
            const fieldPermission = await this.pool.query(
                `SELECT fp.*, p.name as package_name, p.features
                 FROM field_permissions fp
                 JOIN packages p ON fp.package_id = p.id
                 WHERE fp.field_id = $1`,
                [fieldId]
            );

            // If no specific permission set, field is free
            if (fieldPermission.rows.length === 0) {
                this.cachePermission(cacheKey, true);
                return true;
            }

            const requiredPackage = fieldPermission.rows[0];

            // Get user's package
            const userPackage = await this.getUserPackage(userId, userPackageId);
            
            // Check if user's package meets requirements
            const hasAccess = this.comparePackageLevels(
                userPackage?.name || 'free',
                requiredPackage.package_name
            );

            // Cache the result
            this.cachePermission(cacheKey, hasAccess);

            return hasAccess;

        } catch (error) {
            console.error('Field access check error:', error);
            // Default to no access on error
            return false;
        }
    }

    /**
     * Filter responses based on user permissions
     */
    async filterResponsesByPermission({ responses, userPackageId, projectId }) {
        try {
            // Get all fields for the project with their permissions
            const fields = await this.pool.query(
                `SELECT pf.*, fp.package_id, fp.access_level, p.name as required_package
                 FROM project_fields_v6 pf
                 JOIN project_steps_v6 ps ON pf.step_id = ps.id
                 LEFT JOIN field_permissions fp ON pf.id = fp.field_id
                 LEFT JOIN packages p ON fp.package_id = p.id
                 WHERE ps.project_id = $1`,
                [projectId]
            );

            // Get user's package level
            const userPackage = await this.getUserPackageByPackageId(userPackageId);
            const userLevel = this.packageHierarchy[userPackage?.name || 'free'];

            // Filter responses
            const filteredResponses = {};
            const blockedFields = [];

            for (const [fieldId, value] of Object.entries(responses)) {
                const field = fields.rows.find(f => f.id === fieldId);
                
                if (!field) continue;

                // Check if field requires a package
                if (field.required_package) {
                    const requiredLevel = this.packageHierarchy[field.required_package];
                    
                    if (userLevel >= requiredLevel) {
                        filteredResponses[fieldId] = value;
                    } else {
                        blockedFields.push({
                            fieldId,
                            fieldName: field.label,
                            requiredPackage: field.required_package
                        });
                    }
                } else {
                    // No permission required, include the response
                    filteredResponses[fieldId] = value;
                }
            }

            return {
                accessible: filteredResponses,
                blocked: blockedFields,
                totalFields: Object.keys(responses).length,
                accessibleCount: Object.keys(filteredResponses).length,
                blockedCount: blockedFields.length
            };

        } catch (error) {
            console.error('Response filtering error:', error);
            // Return original responses on error
            return {
                accessible: responses,
                blocked: [],
                totalFields: Object.keys(responses).length,
                accessibleCount: Object.keys(responses).length,
                blockedCount: 0
            };
        }
    }

    /**
     * Get fields accessible to a user for a project
     */
    async getAccessibleFields(userId, projectId) {
        try {
            // Get user's package
            const userPackage = await this.getUserPackage(userId);
            const userLevel = this.packageHierarchy[userPackage?.name || 'free'];

            // Get all fields for the project
            const fields = await this.pool.query(
                `SELECT 
                    pf.*,
                    ps.name as step_name,
                    ps.step_order,
                    fp.package_id,
                    fp.access_level,
                    fp.upgrade_prompt,
                    p.name as required_package_name,
                    p.display_name as required_package_display
                 FROM project_fields_v6 pf
                 JOIN project_steps_v6 ps ON pf.step_id = ps.id
                 LEFT JOIN field_permissions fp ON pf.id = fp.field_id
                 LEFT JOIN packages p ON fp.package_id = p.id
                 WHERE ps.project_id = $1
                 ORDER BY ps.step_order, pf.field_order`,
                [projectId]
            );

            // Categorize fields by accessibility
            const accessible = [];
            const locked = [];
            const upgradeable = [];

            for (const field of fields.rows) {
                const fieldData = {
                    ...field,
                    isAccessible: true,
                    isLocked: false,
                    upgradeRequired: null
                };

                if (field.required_package_name) {
                    const requiredLevel = this.packageHierarchy[field.required_package_name];
                    
                    if (userLevel >= requiredLevel) {
                        accessible.push(fieldData);
                    } else {
                        fieldData.isAccessible = false;
                        fieldData.isLocked = true;
                        fieldData.upgradeRequired = field.required_package_display;
                        
                        if (userLevel === requiredLevel - 1) {
                            upgradeable.push(fieldData);
                        } else {
                            locked.push(fieldData);
                        }
                    }
                } else {
                    accessible.push(fieldData);
                }
            }

            return {
                accessible,
                locked,
                upgradeable,
                summary: {
                    totalFields: fields.rows.length,
                    accessibleCount: accessible.length,
                    lockedCount: locked.length,
                    upgradeableCount: upgradeable.length,
                    accessPercentage: Math.round((accessible.length / fields.rows.length) * 100)
                }
            };

        } catch (error) {
            console.error('Get accessible fields error:', error);
            throw new Error('Failed to determine field accessibility');
        }
    }

    /**
     * Generate upgrade prompts based on locked content
     */
    async generateUpgradePrompts(projectId, userPackageId) {
        try {
            // Get locked fields for user
            const lockedFields = await this.pool.query(
                `SELECT 
                    pf.label,
                    pf.description,
                    p.display_name as required_package,
                    p.price,
                    up.title as prompt_title,
                    up.message as prompt_message,
                    up.cta_text,
                    up.cta_url
                 FROM project_fields_v6 pf
                 JOIN project_steps_v6 ps ON pf.step_id = ps.id
                 JOIN field_permissions fp ON pf.id = fp.field_id
                 JOIN packages p ON fp.package_id = p.id
                 LEFT JOIN upgrade_prompts up ON p.id = up.package_id
                 WHERE ps.project_id = $1
                 AND p.name != $2
                 ORDER BY p.price DESC
                 LIMIT 5`,
                [projectId, userPackageId || 'free']
            );

            if (lockedFields.rows.length === 0) {
                return null;
            }

            // Generate contextual upgrade prompt
            const topPackage = lockedFields.rows[0];
            const fieldCount = lockedFields.rows.length;

            return {
                title: topPackage.prompt_title || `Unlock ${fieldCount} Premium Features`,
                message: topPackage.prompt_message || 
                    `Upgrade to ${topPackage.required_package} to access advanced analysis features including: ${lockedFields.rows.map(f => f.label).join(', ')}`,
                cta: {
                    text: topPackage.cta_text || 'Upgrade Now',
                    url: topPackage.cta_url || '/pricing'
                },
                features: lockedFields.rows.map(f => ({
                    name: f.label,
                    description: f.description
                })),
                packageInfo: {
                    name: topPackage.required_package,
                    price: topPackage.price
                }
            };

        } catch (error) {
            console.error('Generate upgrade prompts error:', error);
            return null;
        }
    }

    /**
     * Check project-level access
     */
    async checkProjectAccess(userId, projectId) {
        try {
            const project = await this.pool.query(
                `SELECT p.*, pk.name as required_package
                 FROM projects_v6 p
                 LEFT JOIN packages pk ON p.required_package_id = pk.id
                 WHERE p.id = $1`,
                [projectId]
            );

            if (project.rows.length === 0) {
                return { hasAccess: false, reason: 'Project not found' };
            }

            const projectData = project.rows[0];

            // Check if project is public
            if (projectData.access_level === 'public') {
                return { hasAccess: true, level: 'public' };
            }

            // Check if user owns the project
            if (projectData.user_id === userId) {
                return { hasAccess: true, level: 'owner' };
            }

            // Check if user has required package
            if (projectData.required_package) {
                const userPackage = await this.getUserPackage(userId);
                const hasAccess = this.comparePackageLevels(
                    userPackage?.name || 'free',
                    projectData.required_package
                );

                return {
                    hasAccess,
                    level: hasAccess ? 'subscriber' : 'restricted',
                    requiredPackage: projectData.required_package
                };
            }

            // Default to registered user access
            return { hasAccess: !!userId, level: 'registered' };

        } catch (error) {
            console.error('Project access check error:', error);
            return { hasAccess: false, reason: 'Error checking access' };
        }
    }

    /**
     * Get analytics on field accessibility
     */
    async getFieldAccessAnalytics(projectId) {
        try {
            const analytics = await this.pool.query(
                `WITH field_stats AS (
                    SELECT 
                        pf.id,
                        pf.label,
                        pf.is_premium,
                        fp.package_id,
                        p.name as package_name,
                        COUNT(DISTINCT ta.session_id) as access_attempts
                    FROM project_fields_v6 pf
                    JOIN project_steps_v6 ps ON pf.step_id = ps.id
                    LEFT JOIN field_permissions fp ON pf.id = fp.field_id
                    LEFT JOIN packages p ON fp.package_id = p.id
                    LEFT JOIN tool_analytics_v2 ta ON ps.project_id = ta.project_id
                    WHERE ps.project_id = $1
                    GROUP BY pf.id, pf.label, pf.is_premium, fp.package_id, p.name
                )
                SELECT 
                    COUNT(*) as total_fields,
                    COUNT(CASE WHEN is_premium = true THEN 1 END) as premium_fields,
                    COUNT(CASE WHEN is_premium = false OR is_premium IS NULL THEN 1 END) as free_fields,
                    AVG(access_attempts) as avg_access_attempts,
                    json_agg(json_build_object(
                        'field', label,
                        'package', package_name,
                        'attempts', access_attempts
                    ) ORDER BY access_attempts DESC) as field_details
                FROM field_stats`,
                [projectId]
            );

            return analytics.rows[0];

        } catch (error) {
            console.error('Field analytics error:', error);
            return null;
        }
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Get user's package information
     */
    async getUserPackage(userId, packageId = null) {
        try {
            let query;
            let params;

            if (packageId) {
                query = 'SELECT * FROM packages WHERE id = $1';
                params = [packageId];
            } else {
                query = `
                    SELECT p.* 
                    FROM packages p
                    JOIN user_packages up ON p.id = up.package_id
                    WHERE up.user_id = $1 AND up.is_active = true
                    ORDER BY p.price DESC
                    LIMIT 1`;
                params = [userId];
            }

            const result = await this.pool.query(query, params);
            return result.rows[0] || null;

        } catch (error) {
            console.error('Get user package error:', error);
            return null;
        }
    }

    /**
     * Get package by ID
     */
    async getUserPackageByPackageId(packageId) {
        if (!packageId || packageId === 'free') {
            return { name: 'free', features: {}, limits: {} };
        }

        try {
            const result = await this.pool.query(
                'SELECT * FROM packages WHERE id = $1',
                [packageId]
            );
            return result.rows[0] || { name: 'free', features: {}, limits: {} };
        } catch (error) {
            console.error('Get package error:', error);
            return { name: 'free', features: {}, limits: {} };
        }
    }

    /**
     * Compare package levels
     */
    comparePackageLevels(userPackage, requiredPackage) {
        const userLevel = this.packageHierarchy[userPackage] || 0;
        const requiredLevel = this.packageHierarchy[requiredPackage] || 0;
        return userLevel >= requiredLevel;
    }

    /**
     * Cache permission result
     */
    cachePermission(key, hasAccess) {
        this.permissionCache.set(key, {
            hasAccess,
            timestamp: Date.now()
        });

        // Clean old cache entries
        if (this.permissionCache.size > 1000) {
            const now = Date.now();
            for (const [k, v] of this.permissionCache.entries()) {
                if (v.timestamp < now - this.cacheTimeout) {
                    this.permissionCache.delete(k);
                }
            }
        }
    }

    /**
     * Clear permission cache
     */
    clearCache(userId = null, fieldId = null) {
        if (userId && fieldId) {
            this.permissionCache.delete(`${userId}-${fieldId}`);
        } else if (userId) {
            // Clear all entries for a user
            for (const key of this.permissionCache.keys()) {
                if (key.startsWith(`${userId}-`)) {
                    this.permissionCache.delete(key);
                }
            }
        } else {
            // Clear entire cache
            this.permissionCache.clear();
        }
    }

    /**
     * Batch check field permissions
     */
    async batchCheckFieldAccess(userId, fieldIds, userPackageId) {
        const results = {};
        
        for (const fieldId of fieldIds) {
            results[fieldId] = await this.checkFieldAccess(userId, fieldId, userPackageId);
        }
        
        return results;
    }

    /**
     * Get upgrade path for user
     */
    async getUpgradePath(userId, targetPackageId) {
        try {
            // Get user's current package
            const currentPackage = await this.getUserPackage(userId);
            const currentLevel = this.packageHierarchy[currentPackage?.name || 'free'];

            // Get target package
            const targetPackage = await this.pool.query(
                'SELECT * FROM packages WHERE id = $1',
                [targetPackageId]
            );

            if (targetPackage.rows.length === 0) {
                return null;
            }

            const target = targetPackage.rows[0];
            const targetLevel = this.packageHierarchy[target.name];

            // Get intermediate packages
            const intermediatePkgs = await this.pool.query(
                `SELECT * FROM packages 
                 WHERE name IN (${Object.keys(this.packageHierarchy)
                    .filter(name => {
                        const level = this.packageHierarchy[name];
                        return level > currentLevel && level <= targetLevel;
                    })
                    .map(name => `'${name}'`)
                    .join(',')})
                 ORDER BY price ASC`
            );

            return {
                current: currentPackage,
                target: target,
                steps: intermediatePkgs.rows,
                totalUpgradeCost: target.price - (currentPackage?.price || 0)
            };

        } catch (error) {
            console.error('Get upgrade path error:', error);
            return null;
        }
    }
}

module.exports = PermissionManager;
