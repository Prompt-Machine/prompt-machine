const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');

const router = express.Router();

// Database connection
const pool = new Pool({
    user: 'promptmachine_userbeta',
    host: 'sql.prompt-machine.com',
    database: 'promptmachine_dbbeta',
    password: '94oE1q7K',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

// Middleware to check admin permissions
async function requireAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization required' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        
        // Check if user has admin permissions
        const result = await pool.query(`
            SELECT u.id, u.email, pg.name as permission_group
            FROM users u
            LEFT JOIN permission_groups pg ON u.permission_group_id = pg.id
            WHERE u.id = $1
        `, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        if (user.permission_group !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// POST /api/users/register - User self-registration
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Check if registration already pending
        const existingReg = await pool.query(
            'SELECT id FROM user_registrations WHERE email = $1 AND status = $2',
            [email.toLowerCase(), 'pending']
        );

        if (existingReg.rows.length > 0) {
            return res.status(400).json({ error: 'Registration already pending approval' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Generate registration token
        const registrationToken = crypto.randomBytes(32).toString('hex');

        // Get test_permissions group ID
        const testGroupResult = await pool.query(
            'SELECT id FROM permission_groups WHERE name = $1',
            ['test_permissions']
        );

        // Create registration request
        const result = await pool.query(`
            INSERT INTO user_registrations 
            (email, password_hash, first_name, last_name, registration_token, requested_permission_group_id, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, email, created_at
        `, [
            email.toLowerCase(),
            passwordHash,
            firstName || null,
            lastName || null,
            registrationToken,
            testGroupResult.rows[0]?.id || null,
            'pending'
        ]);

        res.json({
            message: 'Registration request submitted successfully. Please wait for admin approval.',
            registrationId: result.rows[0].id,
            status: 'pending'
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// GET /api/users/registrations - Get pending registrations (Admin only)
router.get('/registrations', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                ur.id,
                ur.email,
                ur.first_name,
                ur.last_name,
                ur.status,
                ur.created_at,
                pg.name as requested_permission_group
            FROM user_registrations ur
            LEFT JOIN permission_groups pg ON ur.requested_permission_group_id = pg.id
            WHERE ur.status = 'pending'
            ORDER BY ur.created_at DESC
        `);

        res.json({ registrations: result.rows });

    } catch (error) {
        console.error('Get registrations error:', error);
        res.status(500).json({ error: 'Failed to fetch registrations' });
    }
});

// POST /api/users/registrations/:id/approve - Approve registration (Admin only)
router.post('/registrations/:id/approve', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Get registration details
        const regResult = await pool.query(
            'SELECT * FROM user_registrations WHERE id = $1 AND status = $2',
            [id, 'pending']
        );

        if (regResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found or already processed' });
        }

        const registration = regResult.rows[0];

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id, email FROM users WHERE email = $1',
            [registration.email]
        );

        if (existingUser.rows.length > 0) {
            // User already exists, just update registration status
            await pool.query(`
                UPDATE user_registrations 
                SET status = $1, approved_at = CURRENT_TIMESTAMP, approved_by = $2
                WHERE id = $3
            `, ['approved', req.user.id, id]);

            return res.status(400).json({ 
                error: 'User with this email already exists in the system' 
            });
        }

        // Create user
        const userResult = await pool.query(`
            INSERT INTO users 
            (email, password_hash, permission_group_id, is_verified)
            VALUES ($1, $2, $3, $4)
            RETURNING id, email
        `, [
            registration.email,
            registration.password_hash,
            registration.requested_permission_group_id,
            true
        ]);

        // Update registration status
        await pool.query(`
            UPDATE user_registrations 
            SET status = $1, approved_at = CURRENT_TIMESTAMP, approved_by = $2
            WHERE id = $3
        `, ['approved', req.user.id, id]);

        // Log audit event
        await pool.query(`
            SELECT log_audit_event($1, $2, $3, $4, $5, $6)
        `, [
            req.user.id,
            'user_registration_approved',
            'user',
            userResult.rows[0].id,
            JSON.stringify({ email: registration.email }),
            req.ip
        ]);

        res.json({
            message: 'User registration approved successfully',
            user: userResult.rows[0]
        });

    } catch (error) {
        console.error('Approve registration error:', error);
        res.status(500).json({ error: 'Failed to approve registration' });
    }
});

// POST /api/users/registrations/:id/reject - Reject registration (Admin only)
router.post('/registrations/:id/reject', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const result = await pool.query(`
            UPDATE user_registrations 
            SET status = $1, approved_at = CURRENT_TIMESTAMP, approved_by = $2
            WHERE id = $3 AND status = $4
            RETURNING email
        `, ['rejected', req.user.id, id, 'pending']);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found or already processed' });
        }

        // Log audit event
        await pool.query(`
            SELECT log_audit_event($1, $2, $3, $4, $5, $6)
        `, [
            req.user.id,
            'user_registration_rejected',
            'registration',
            id,
            JSON.stringify({ email: result.rows[0].email, reason }),
            req.ip
        ]);

        res.json({ message: 'Registration rejected successfully' });

    } catch (error) {
        console.error('Reject registration error:', error);
        res.status(500).json({ error: 'Failed to reject registration' });
    }
});

// GET /api/users - Get all users (Admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id,
                u.email,
                u.created_at,
                u.last_login,
                u.is_verified,
                pg.name as permission_group,
                pg.description as permission_description,
                pg.features
            FROM users u
            LEFT JOIN permission_groups pg ON u.permission_group_id = pg.id
            ORDER BY u.created_at DESC
        `);

        res.json({ users: result.rows });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// PUT /api/users/:id/permissions - Update user permissions (Admin only)
router.put('/:id/permissions', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { permissionGroupName } = req.body;

        // Get permission group ID
        const groupResult = await pool.query(
            'SELECT id, name FROM permission_groups WHERE name = $1 AND is_active = true',
            [permissionGroupName]
        );

        if (groupResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid permission group' });
        }

        // Update user permissions
        const result = await pool.query(`
            UPDATE users 
            SET permission_group_id = $1
            WHERE id = $2
            RETURNING id, email
        `, [groupResult.rows[0].id, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Log audit event
        await pool.query(`
            SELECT log_audit_event($1, $2, $3, $4, $5, $6)
        `, [
            req.user.id,
            'user_permissions_updated',
            'user',
            id,
            JSON.stringify({ 
                newPermissionGroup: permissionGroupName,
                targetUser: result.rows[0].email 
            }),
            req.ip
        ]);

        res.json({
            message: 'User permissions updated successfully',
            user: result.rows[0],
            newPermissionGroup: groupResult.rows[0].name
        });

    } catch (error) {
        console.error('Update permissions error:', error);
        res.status(500).json({ error: 'Failed to update permissions' });
    }
});

// GET /api/users/permission-groups - Get all permission groups (Admin only)
router.get('/permission-groups', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, description, features, is_active, created_at
            FROM permission_groups
            WHERE is_active = true
            ORDER BY name
        `);

        res.json({ permissionGroups: result.rows });

    } catch (error) {
        console.error('Get permission groups error:', error);
        res.status(500).json({ error: 'Failed to fetch permission groups' });
    }
});

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Don't allow admin to delete themselves
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        // Get user details before deletion
        const userResult = await pool.query(
            'SELECT email FROM users WHERE id = $1',
            [id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete user (cascade will handle sessions)
        await pool.query('DELETE FROM users WHERE id = $1', [id]);

        // Clean up any related registration records for this email
        await pool.query(`
            UPDATE user_registrations 
            SET status = 'user_deleted', approved_at = CURRENT_TIMESTAMP, approved_by = $1
            WHERE email = $2 AND status IN ('approved', 'pending')
        `, [req.user.id, userResult.rows[0].email]);

        // Log audit event
        await pool.query(`
            SELECT log_audit_event($1, $2, $3, $4, $5, $6)
        `, [
            req.user.id,
            'user_deleted',
            'user',
            id,
            JSON.stringify({ deletedUserEmail: userResult.rows[0].email }),
            req.ip
        ]);

        res.json({ message: 'User deleted successfully' });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// GET /api/users/audit-log - Get audit log (Admin only)
router.get('/audit-log', requireAdmin, async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;

        const result = await pool.query(`
            SELECT 
                al.*,
                u.email as user_email
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT $1 OFFSET $2
        `, [parseInt(limit), parseInt(offset)]);

        const countResult = await pool.query('SELECT COUNT(*) FROM audit_log');
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
            auditLog: result.rows,
            pagination: {
                total: totalCount,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + parseInt(limit) < totalCount
            }
        });

    } catch (error) {
        console.error('Get audit log error:', error);
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});

// POST /api/users/cleanup-registrations - Clean up orphaned registrations (Admin only)
router.post('/cleanup-registrations', requireAdmin, async (req, res) => {
    try {
        // Find registrations where user already exists
        const orphanedApproved = await pool.query(`
            SELECT ur.id, ur.email, ur.status
            FROM user_registrations ur
            INNER JOIN users u ON ur.email = u.email
            WHERE ur.status = 'approved'
        `);

        // Find registrations where user was deleted but registration remains pending/approved
        const orphanedPending = await pool.query(`
            SELECT ur.id, ur.email, ur.status
            FROM user_registrations ur
            LEFT JOIN users u ON ur.email = u.email
            WHERE ur.status IN ('approved', 'pending') AND u.id IS NULL
            AND ur.created_at < NOW() - INTERVAL '1 hour'
        `);

        let cleanedCount = 0;

        // Mark orphaned approved registrations as processed
        if (orphanedApproved.rows.length > 0) {
            const approvedIds = orphanedApproved.rows.map(r => r.id);
            await pool.query(`
                UPDATE user_registrations 
                SET status = 'already_processed', approved_at = CURRENT_TIMESTAMP, approved_by = $1
                WHERE id = ANY($2)
            `, [req.user.id, approvedIds]);
            cleanedCount += approvedIds.length;
        }

        // Mark orphaned pending registrations as expired
        if (orphanedPending.rows.length > 0) {
            const pendingIds = orphanedPending.rows.map(r => r.id);
            await pool.query(`
                UPDATE user_registrations 
                SET status = 'expired', approved_at = CURRENT_TIMESTAMP, approved_by = $1
                WHERE id = ANY($2)
            `, [req.user.id, pendingIds]);
            cleanedCount += pendingIds.length;
        }

        // Log audit event
        await pool.query(`
            SELECT log_audit_event($1, $2, $3, $4, $5, $6)
        `, [
            req.user.id,
            'registrations_cleanup',
            'system',
            null,
            JSON.stringify({ 
                cleanedCount, 
                orphanedApproved: orphanedApproved.rows.length,
                orphanedPending: orphanedPending.rows.length 
            }),
            req.ip
        ]);

        res.json({
            message: 'Registration cleanup completed',
            cleanedCount,
            details: {
                orphanedApproved: orphanedApproved.rows.length,
                orphanedPending: orphanedPending.rows.length
            }
        });

    } catch (error) {
        console.error('Cleanup registrations error:', error);
        res.status(500).json({ error: 'Failed to cleanup registrations' });
    }
});

// =====================================================
// PACKAGE MANAGEMENT ENDPOINTS
// =====================================================

// GET /api/users/packages - Get all packages (Admin only)
router.get('/packages', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, name, display_name, description, price, billing_period,
                features, limits, is_active, created_at
            FROM packages
            ORDER BY 
                CASE WHEN name = 'public' THEN 1 
                     WHEN name = 'registered' THEN 2 
                     ELSE 3 END,
                display_name
        `);

        res.json({ packages: result.rows });

    } catch (error) {
        console.error('Get packages error:', error);
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

module.exports = router;