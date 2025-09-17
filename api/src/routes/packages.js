const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    user: 'promptmachine_userbeta',
    host: 'sql.prompt-machine.com',
    database: 'promptmachine_dbbeta',
    password: '94oE1q7K',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

// Middleware to verify admin authentication
const verifyAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Check if user is admin
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [decoded.userId]);
        if (!userResult.rows.length || !userResult.rows[0].email.includes('admin')) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

/**
 * GET /api/packages
 * Get all packages
 */
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, display_name, description, price, billing_period, 
                   features, limits, is_active, created_at, updated_at
            FROM packages 
            ORDER BY created_at ASC
        `);
        
        res.json({
            success: true,
            packages: result.rows
        });
    } catch (error) {
        console.error('Error fetching packages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch packages'
        });
    }
});

/**
 * POST /api/packages
 * Create new package (Admin only)
 */
router.post('/', verifyAdmin, async (req, res) => {
    try {
        const { 
            name, display_name, description, price, billing_period,
            features, limits, is_active 
        } = req.body;

        // Validate required fields
        if (!name || !display_name) {
            return res.status(400).json({
                success: false,
                error: 'Name and display name are required'
            });
        }

        // Check if package name already exists
        const existingPackage = await pool.query('SELECT id FROM packages WHERE name = $1', [name]);
        if (existingPackage.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Package name already exists'
            });
        }

        const result = await pool.query(`
            INSERT INTO packages (name, display_name, description, price, billing_period, features, limits, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            name,
            display_name,
            description || '',
            parseFloat(price) || 0.00,
            billing_period || 'monthly',
            JSON.stringify(features || {}),
            JSON.stringify(limits || {}),
            is_active !== false
        ]);

        console.log(`✅ Package created: ${display_name} (${name})`);
        
        res.json({
            success: true,
            package: result.rows[0],
            message: 'Package created successfully'
        });
    } catch (error) {
        console.error('Error creating package:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create package'
        });
    }
});

/**
 * PUT /api/packages/:id
 * Update package (Admin only)
 */
router.put('/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, display_name, description, price, billing_period,
            features, limits, is_active 
        } = req.body;

        // Check if package exists
        const existingPackage = await pool.query('SELECT * FROM packages WHERE id = $1', [id]);
        if (existingPackage.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Package not found'
            });
        }

        // If name is being changed, check for conflicts
        if (name && name !== existingPackage.rows[0].name) {
            const nameConflict = await pool.query('SELECT id FROM packages WHERE name = $1 AND id != $2', [name, id]);
            if (nameConflict.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Package name already exists'
                });
            }
        }

        const result = await pool.query(`
            UPDATE packages 
            SET name = COALESCE($1, name),
                display_name = COALESCE($2, display_name),
                description = COALESCE($3, description),
                price = COALESCE($4, price),
                billing_period = COALESCE($5, billing_period),
                features = COALESCE($6, features),
                limits = COALESCE($7, limits),
                is_active = COALESCE($8, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [
            name,
            display_name,
            description,
            price ? parseFloat(price) : null,
            billing_period,
            features ? JSON.stringify(features) : null,
            limits ? JSON.stringify(limits) : null,
            is_active,
            id
        ]);

        console.log(`✅ Package updated: ${result.rows[0].display_name}`);
        
        res.json({
            success: true,
            package: result.rows[0],
            message: 'Package updated successfully'
        });
    } catch (error) {
        console.error('Error updating package:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update package'
        });
    }
});

/**
 * DELETE /api/packages/:id
 * Delete package (Admin only)
 */
router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if package exists
        const existingPackage = await pool.query('SELECT name, display_name FROM packages WHERE id = $1', [id]);
        if (existingPackage.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Package not found'
            });
        }

        // Check if package is in use by users
        const usersUsingPackage = await pool.query('SELECT COUNT(*) as count FROM user_packages WHERE package_id = $1', [id]);
        if (parseInt(usersUsingPackage.rows[0].count) > 0) {
            return res.status(409).json({
                success: false,
                error: 'Cannot delete package that is assigned to users',
                users_count: usersUsingPackage.rows[0].count
            });
        }

        // Check if package is in use by projects
        const projectsUsingPackage = await pool.query('SELECT COUNT(*) as count FROM projects_v6 WHERE required_package_id = $1', [id]);
        if (parseInt(projectsUsingPackage.rows[0].count) > 0) {
            return res.status(409).json({
                success: false,
                error: 'Cannot delete package that is required by projects',
                projects_count: projectsUsingPackage.rows[0].count
            });
        }

        await pool.query('DELETE FROM packages WHERE id = $1', [id]);

        console.log(`✅ Package deleted: ${existingPackage.rows[0].display_name}`);
        
        res.json({
            success: true,
            message: 'Package deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting package:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete package'
        });
    }
});

/**
 * GET /api/packages/:id/users
 * Get users assigned to a package
 */
router.get('/:id/users', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT u.id, u.email, u.first_name, u.last_name, up.is_active, up.created_at as assigned_at
            FROM user_packages up
            JOIN users u ON up.user_id = u.id
            WHERE up.package_id = $1
            ORDER BY up.created_at DESC
        `, [id]);
        
        res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error('Error fetching package users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch package users'
        });
    }
});

/**
 * POST /api/packages/:id/assign
 * Assign package to user (Admin only)
 */
router.post('/:id/assign', verifyAdmin, async (req, res) => {
    try {
        const { id: packageId } = req.params;
        const { user_email, is_active = true } = req.body;

        if (!user_email) {
            return res.status(400).json({
                success: false,
                error: 'User email is required'
            });
        }

        // Get user by email
        const userResult = await pool.query('SELECT id, email FROM users WHERE email = $1', [user_email]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const userId = userResult.rows[0].id;

        // Check if assignment already exists
        const existingAssignment = await pool.query(
            'SELECT id FROM user_packages WHERE user_id = $1 AND package_id = $2', 
            [userId, packageId]
        );

        if (existingAssignment.rows.length > 0) {
            // Update existing assignment
            await pool.query(
                'UPDATE user_packages SET is_active = $1 WHERE user_id = $2 AND package_id = $3',
                [is_active, userId, packageId]
            );
        } else {
            // Create new assignment
            await pool.query(
                'INSERT INTO user_packages (user_id, package_id, is_active) VALUES ($1, $2, $3)',
                [userId, packageId, is_active]
            );
        }

        console.log(`✅ Package assigned: ${user_email} → package ${packageId}`);
        
        res.json({
            success: true,
            message: 'Package assigned successfully'
        });
    } catch (error) {
        console.error('Error assigning package:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to assign package'
        });
    }
});

/**
 * DELETE /api/packages/:packageId/users/:userId
 * Remove package assignment from user (Admin only)
 */
router.delete('/:packageId/users/:userId', verifyAdmin, async (req, res) => {
    try {
        const { packageId, userId } = req.params;

        const result = await pool.query(
            'DELETE FROM user_packages WHERE user_id = $1 AND package_id = $2',
            [userId, packageId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Package assignment not found'
            });
        }

        console.log(`✅ Package assignment removed: user ${userId} from package ${packageId}`);
        
        res.json({
            success: true,
            message: 'Package assignment removed successfully'
        });
    } catch (error) {
        console.error('Error removing package assignment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove package assignment'
        });
    }
});

module.exports = router;