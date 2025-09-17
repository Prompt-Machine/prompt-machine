// Advanced User Management API Routes
// Enterprise-level user management, roles, permissions, and administrative controls

const express = require('express');
const { Pool } = require('pg');
const { verifyAuth } = require('../middleware/auth');

const router = express.Router();

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

/**
 * Middleware to check if user has specific permission
 */
const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ 
                    success: false,
                    error: 'Authentication required' 
                });
            }

            // Check if user has the required permission
            const result = await pool.query(
                'SELECT user_has_permission($1, $2) as has_permission',
                [req.user.id, permission]
            );

            const hasPermission = result.rows[0].has_permission;

            if (!hasPermission) {
                return res.status(403).json({ 
                    success: false,
                    error: `Permission '${permission}' required`,
                    required_permission: permission
                });
            }

            next();

        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Permission check failed' 
            });
        }
    };
};

/**
 * GET /api/admin/users
 * Get all users with pagination and filtering
 */
router.get('/users', verifyAuth, requirePermission('user_management'), async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            search = '', 
            role = '', 
            status = '',
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build dynamic WHERE clause
        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        if (search) {
            whereConditions.push(`(u.email ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        if (role) {
            whereConditions.push(`pg.name = $${paramIndex}`);
            queryParams.push(role);
            paramIndex++;
        }

        if (status) {
            whereConditions.push(`u.account_status = $${paramIndex}`);
            queryParams.push(status);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get users with detailed information
        const usersQuery = `
            SELECT 
                u.id,
                u.email,
                u.first_name,
                u.last_name,
                u.account_status,
                u.is_verified,
                u.created_at,
                u.updated_at,
                u.last_login,
                pg.name as role,
                pg.description as role_description,
                p.display_name as package_name,
                up.expires_at as package_expires,
                COUNT(pr.id) as total_projects,
                COUNT(CASE WHEN pr.deployed = true THEN 1 END) as deployed_projects
            FROM users u
            LEFT JOIN permission_groups pg ON u.permission_group_id = pg.id
            LEFT JOIN user_packages up ON u.id = up.user_id AND up.is_active = true
            LEFT JOIN packages p ON up.package_id = p.id
            LEFT JOIN projects_v6 pr ON u.id = pr.user_id
            ${whereClause}
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.account_status, 
                     u.is_verified, u.created_at, u.updated_at, u.last_login,
                     pg.name, pg.description, p.display_name, up.expires_at
            ORDER BY u.${sortBy} ${sortOrder}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        queryParams.push(parseInt(limit), offset);

        const usersResult = await pool.query(usersQuery, queryParams);

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(DISTINCT u.id) as total
            FROM users u
            LEFT JOIN permission_groups pg ON u.permission_group_id = pg.id
            ${whereClause}
        `;

        const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
        const totalUsers = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            users: usersResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalUsers,
                pages: Math.ceil(totalUsers / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to retrieve users' 
        });
    }
});

/**
 * GET /api/admin/users/:userId
 * Get detailed user information
 */
router.get('/users/:userId', verifyAuth, requirePermission('user_management'), async (req, res) => {
    try {
        const { userId } = req.params;

        // Get comprehensive user details
        const userQuery = `
            SELECT 
                u.*,
                pg.name as role,
                pg.description as role_description,
                pg.features as role_features,
                p.display_name as package_name,
                p.features as package_features,
                p.limits as package_limits,
                up.expires_at as package_expires,
                up.created_at as package_assigned_at
            FROM users u
            LEFT JOIN permission_groups pg ON u.permission_group_id = pg.id
            LEFT JOIN user_packages up ON u.id = up.user_id AND up.is_active = true
            LEFT JOIN packages p ON up.package_id = p.id
            WHERE u.id = $1
        `;

        const userResult = await pool.query(userQuery, [userId]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const user = userResult.rows[0];

        // Get user's recent activity
        const activityQuery = `
            SELECT activity_type, resource_type, activity_details, created_at
            FROM user_activity_log
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 10
        `;

        const activityResult = await pool.query(activityQuery, [userId]);

        // Get user's projects
        const projectsQuery = `
            SELECT id, name, deployed, enabled, created_at
            FROM projects_v6
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 5
        `;

        const projectsResult = await pool.query(projectsQuery, [userId]);

        // Get user notes
        const notesQuery = `
            SELECT 
                un.id, un.note_type, un.title, un.content, un.is_flagged, un.created_at,
                creator.email as created_by_email,
                creator.first_name as created_by_first_name,
                creator.last_name as created_by_last_name
            FROM user_notes un
            LEFT JOIN users creator ON un.created_by = creator.id
            WHERE un.user_id = $1
            ORDER BY un.created_at DESC
        `;

        const notesResult = await pool.query(notesQuery, [userId]);

        res.json({
            success: true,
            user: user,
            recent_activity: activityResult.rows,
            recent_projects: projectsResult.rows,
            notes: notesResult.rows
        });

    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to retrieve user details' 
        });
    }
});

/**
 * PUT /api/admin/users/:userId/role
 * Update user's role/permission group
 */
router.put('/users/:userId/role', verifyAuth, requirePermission('user_management'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { roleId, reason } = req.body;

        if (!roleId) {
            return res.status(400).json({ 
                success: false,
                error: 'Role ID is required' 
            });
        }

        // Verify role exists
        const roleCheck = await pool.query(
            'SELECT id, name FROM permission_groups WHERE id = $1 AND is_active = true',
            [roleId]
        );

        if (roleCheck.rows.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid role ID' 
            });
        }

        const roleName = roleCheck.rows[0].name;

        // Update user's role
        await pool.query(
            'UPDATE users SET permission_group_id = $1, updated_at = NOW() WHERE id = $2',
            [roleId, userId]
        );

        // Log the action
        await pool.query(`
            INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            req.user.id,
            'user_role_changed',
            'user',
            userId,
            { new_role: roleName, reason: reason }
        ]);

        // Log user activity
        await pool.query(`
            INSERT INTO user_activity_log (user_id, activity_type, resource_type, resource_id, activity_details)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            userId,
            'role_changed',
            'user',
            userId,
            { new_role: roleName, changed_by: req.user.email }
        ]);

        res.json({
            success: true,
            message: 'User role updated successfully',
            new_role: roleName
        });

    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update user role' 
        });
    }
});

/**
 * PUT /api/admin/users/:userId/status
 * Update user account status (activate, suspend, etc.)
 */
router.put('/users/:userId/status', verifyAuth, requirePermission('user_management'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, reason } = req.body;

        const validStatuses = ['active', 'suspended', 'closed', 'pending'];
        
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false,
                error: 'Valid status is required (active, suspended, closed, pending)' 
            });
        }

        // Get current user info
        const currentUser = await pool.query(
            'SELECT account_status, email FROM users WHERE id = $1',
            [userId]
        );

        if (currentUser.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const oldStatus = currentUser.rows[0].account_status;

        // Update user status
        await pool.query(
            'UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2',
            [status, userId]
        );

        // Log the action
        await pool.query(`
            INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            req.user.id,
            'user_status_changed',
            'user',
            userId,
            { 
                old_status: oldStatus, 
                new_status: status, 
                reason: reason,
                user_email: currentUser.rows[0].email
            }
        ]);

        // Log security event if suspension
        if (status === 'suspended') {
            await pool.query(`
                INSERT INTO user_security_events (user_id, event_type, severity, details)
                VALUES ($1, $2, $3, $4)
            `, [
                userId,
                'account_suspended',
                'high',
                { reason: reason, suspended_by: req.user.email }
            ]);
        }

        res.json({
            success: true,
            message: `User account ${status} successfully`,
            old_status: oldStatus,
            new_status: status
        });

    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update user status' 
        });
    }
});

/**
 * POST /api/admin/users/:userId/notes
 * Add admin note to user account
 */
router.post('/users/:userId/notes', verifyAuth, requirePermission('user_management'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { title, content, noteType = 'general', isInternal = true, isFlagged = false } = req.body;

        if (!content) {
            return res.status(400).json({ 
                success: false,
                error: 'Note content is required' 
            });
        }

        // Insert note
        const result = await pool.query(`
            INSERT INTO user_notes (user_id, created_by, note_type, title, content, is_internal, is_flagged)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        `, [userId, req.user.id, noteType, title, content, isInternal, isFlagged]);

        // Log the action
        await pool.query(`
            INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            req.user.id,
            'user_note_added',
            'user',
            userId,
            { note_type: noteType, title: title, is_flagged: isFlagged }
        ]);

        res.json({
            success: true,
            message: 'Note added successfully',
            note_id: result.rows[0].id,
            created_at: result.rows[0].created_at
        });

    } catch (error) {
        console.error('Add user note error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to add note' 
        });
    }
});

/**
 * GET /api/admin/roles
 * Get all permission groups/roles
 */
router.get('/roles', verifyAuth, requirePermission('user_management'), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                pg.id,
                pg.name,
                pg.description,
                pg.features,
                pg.is_active,
                COUNT(u.id) as user_count
            FROM permission_groups pg
            LEFT JOIN users u ON pg.id = u.permission_group_id
            GROUP BY pg.id, pg.name, pg.description, pg.features, pg.is_active
            ORDER BY pg.name
        `);

        res.json({
            success: true,
            roles: result.rows
        });

    } catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to retrieve roles' 
        });
    }
});

/**
 * GET /api/admin/analytics/users
 * Get user analytics and insights
 */
router.get('/analytics/users', verifyAuth, requirePermission('analytics_access'), async (req, res) => {
    try {
        const { days = 30 } = req.query;

        // Get user growth metrics
        const growthQuery = `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as new_users
            FROM users 
            WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE(created_at)
            ORDER BY date
        `;

        const growthResult = await pool.query(growthQuery);

        // Get user status breakdown
        const statusQuery = `
            SELECT 
                account_status,
                COUNT(*) as count
            FROM users 
            GROUP BY account_status
        `;

        const statusResult = await pool.query(statusQuery);

        // Get role distribution
        const roleQuery = `
            SELECT 
                COALESCE(pg.name, 'No Role') as role,
                COUNT(u.id) as count
            FROM users u
            LEFT JOIN permission_groups pg ON u.permission_group_id = pg.id
            GROUP BY pg.name
            ORDER BY count DESC
        `;

        const roleResult = await pool.query(roleQuery);

        // Get activity summary
        const activityQuery = `
            SELECT 
                activity_type,
                COUNT(*) as count
            FROM user_activity_log 
            WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY activity_type
            ORDER BY count DESC
            LIMIT 10
        `;

        const activityResult = await pool.query(activityQuery);

        res.json({
            success: true,
            analytics: {
                user_growth: growthResult.rows,
                status_breakdown: statusResult.rows,
                role_distribution: roleResult.rows,
                activity_summary: activityResult.rows
            }
        });

    } catch (error) {
        console.error('Get user analytics error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to retrieve user analytics' 
        });
    }
});

module.exports = router;