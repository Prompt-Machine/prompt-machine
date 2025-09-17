const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const router = express.Router();

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Middleware to check admin authorization
const requireAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false,
            error: 'Authorization required' 
        });
    }
    next();
};

// Helper function to log account changes
async function logAccountChange(userId, changedBy, changeType, fieldChanged, oldValue, newValue, reason, req) {
    try {
        await pool.query(`
            INSERT INTO client_account_history 
            (user_id, changed_by, change_type, field_changed, old_value, new_value, change_reason, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            userId, 
            changedBy, 
            changeType, 
            fieldChanged, 
            oldValue, 
            newValue, 
            reason, 
            req.ip || req.connection.remoteAddress,
            req.get('User-Agent')
        ]);
    } catch (error) {
        console.error('Error logging account change:', error);
    }
}

// Get all clients with full details
router.get('/clients', requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';

        let whereClause = 'WHERE 1=1';
        const queryParams = [];
        let paramCount = 0;

        if (search) {
            paramCount++;
            whereClause += ` AND (first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
        }

        if (status) {
            paramCount++;
            whereClause += ` AND account_status = $${paramCount}`;
            queryParams.push(status);
        }

        const query = `
            SELECT 
                u.id, u.email, u.first_name, u.last_name, u.phone,
                u.address_line1, u.address_line2, u.city, u.state_province, 
                u.postal_code, u.country, u.date_of_birth, u.account_status,
                u.is_verified, u.last_login, u.created_at, u.updated_at, u.notes,
                p.display_name as package_name, p.price as package_price,
                COUNT(*) OVER() as total_count
            FROM users u
            LEFT JOIN user_packages up ON u.id = up.user_id AND up.is_active = true
            LEFT JOIN packages p ON up.package_id = p.id
            ${whereClause}
            ORDER BY u.last_name ASC, u.first_name ASC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;

        queryParams.push(limit, offset);
        const result = await pool.query(query, queryParams);

        const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            clients: result.rows,
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
        console.error('Error getting clients:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load clients'
        });
    }
});

// Get single client by ID
router.get('/clients/:clientId', requireAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        const result = await pool.query(`
            SELECT 
                u.*, 
                p.display_name as package_name, p.price as package_price, p.name as package_internal_name
            FROM users u
            LEFT JOIN user_packages up ON u.id = up.user_id AND up.is_active = true
            LEFT JOIN packages p ON up.package_id = p.id
            WHERE u.id = $1
        `, [clientId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        res.json({
            success: true,
            client: result.rows[0]
        });

    } catch (error) {
        console.error('Error getting client:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load client'
        });
    }
});

// Create new client
router.post('/clients', requireAdmin, async (req, res) => {
    try {
        const {
            email, password, first_name, last_name, phone,
            address_line1, address_line2, city, state_province,
            postal_code, country, date_of_birth, package_name, notes
        } = req.body;

        // Validate required fields
        if (!email || !password || !first_name || !last_name) {
            return res.status(400).json({
                success: false,
                error: 'Email, password, first name, and last name are required'
            });
        }

        // Check if email already exists
        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Email already exists'
            });
        }

        // Hash password
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Create user
        const userResult = await pool.query(`
            INSERT INTO users 
            (email, password_hash, first_name, last_name, phone, address_line1, address_line2,
             city, state_province, postal_code, country, date_of_birth, notes, account_status, is_verified)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', true)
            RETURNING *
        `, [
            email, password_hash, first_name, last_name, phone, address_line1, address_line2,
            city, state_province, postal_code, country || 'United States', date_of_birth, notes
        ]);

        const newUser = userResult.rows[0];

        // Assign package if specified
        if (package_name) {
            const packageResult = await pool.query('SELECT id FROM packages WHERE name = $1', [package_name]);
            if (packageResult.rows.length > 0) {
                await pool.query(`
                    INSERT INTO user_packages (user_id, package_id, is_active)
                    VALUES ($1, $2, true)
                `, [newUser.id, packageResult.rows[0].id]);
            }
        }

        // Log account creation
        await logAccountChange(
            newUser.id, 
            'admin-system', 
            'account_created', 
            'full_account', 
            null, 
            `Created by admin: ${first_name} ${last_name}`, 
            'New client account created',
            req
        );

        res.status(201).json({
            success: true,
            message: 'Client created successfully',
            client: {
                id: newUser.id,
                email: newUser.email,
                first_name: newUser.first_name,
                last_name: newUser.last_name,
                account_status: newUser.account_status
            }
        });

    } catch (error) {
        console.error('Error creating client:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create client'
        });
    }
});

// Update client
router.put('/clients/:clientId', requireAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;
        const updateFields = req.body;

        // Get current client data for change logging
        const currentClient = await pool.query('SELECT * FROM users WHERE id = $1', [clientId]);
        if (currentClient.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        const current = currentClient.rows[0];

        // Build dynamic update query
        const allowedFields = [
            'first_name', 'last_name', 'email', 'phone', 'address_line1', 'address_line2',
            'city', 'state_province', 'postal_code', 'country', 'date_of_birth', 
            'account_status', 'notes'
        ];

        const updates = [];
        const values = [];
        let paramCount = 0;

        for (const [field, value] of Object.entries(updateFields)) {
            if (allowedFields.includes(field) && value !== undefined) {
                paramCount++;
                updates.push(`${field} = $${paramCount}`);
                values.push(value);

                // Log the change
                await logAccountChange(
                    clientId,
                    'admin-system',
                    'field_updated',
                    field,
                    current[field],
                    value,
                    updateFields.change_reason || 'Admin update',
                    req
                );
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        // Handle password update separately if provided
        if (updateFields.password) {
            const saltRounds = 12;
            const password_hash = await bcrypt.hash(updateFields.password, saltRounds);
            paramCount++;
            updates.push(`password_hash = $${paramCount}`);
            values.push(password_hash);

            await logAccountChange(
                clientId,
                'admin-system',
                'password_changed',
                'password_hash',
                '***hidden***',
                '***changed***',
                updateFields.change_reason || 'Admin password reset',
                req
            );
        }

        values.push(clientId);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount + 1} RETURNING *`;

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Client updated successfully',
            client: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update client'
        });
    }
});

// Get client account history
router.get('/clients/:clientId/history', requireAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const result = await pool.query(`
            SELECT 
                h.*,
                u.first_name || ' ' || u.last_name as changed_by_name
            FROM client_account_history h
            LEFT JOIN users u ON h.changed_by::text = u.id::text
            WHERE h.user_id = $1
            ORDER BY h.created_at DESC
            LIMIT $2
        `, [clientId, limit]);

        res.json({
            success: true,
            history: result.rows
        });

    } catch (error) {
        console.error('Error getting client history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load client history'
        });
    }
});

// Delete client (soft delete by setting status to closed)
router.delete('/clients/:clientId', requireAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        const result = await pool.query(`
            UPDATE users 
            SET account_status = 'closed', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 
            RETURNING first_name, last_name, email
        `, [clientId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Log account closure
        await logAccountChange(
            clientId,
            'admin-system',
            'account_closed',
            'account_status',
            'active',
            'closed',
            'Account closed by admin',
            req
        );

        res.json({
            success: true,
            message: 'Client account closed successfully'
        });

    } catch (error) {
        console.error('Error closing client account:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to close client account'
        });
    }
});

module.exports = router;