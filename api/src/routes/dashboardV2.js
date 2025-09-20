const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { verifyAuth } = require('../middleware/auth');

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
 * GET /api/v2/dashboard/stats
 * Get dashboard statistics for the user
 */
router.get('/stats', verifyAuth, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get tool count (projects)
        const toolCountResult = await pool.query(
            'SELECT COUNT(*) as count FROM projects_v6 WHERE user_id = $1',
            [userId]
        );

        // Get deployed tool count
        const deployedCountResult = await pool.query(
            'SELECT COUNT(*) as count FROM projects_v6 WHERE user_id = $1 AND deployed = true',
            [userId]
        );

        // Get total field count across all projects
        const fieldCountResult = await pool.query(
            `SELECT COUNT(pf.*) as count 
             FROM project_fields_v6 pf
             JOIN project_steps_v6 ps ON pf.step_id = ps.id
             JOIN projects_v6 p ON ps.project_id = p.id
             WHERE p.user_id = $1`,
            [userId]
        );

        // Get premium field count (fields with permissions/restrictions)
        const premiumFieldCountResult = await pool.query(
            `SELECT COUNT(DISTINCT pf.id) as count 
             FROM project_fields_v6 pf
             JOIN project_steps_v6 ps ON pf.step_id = ps.id
             JOIN projects_v6 p ON ps.project_id = p.id
             LEFT JOIN field_permissions fp ON pf.id = fp.field_id
             WHERE p.user_id = $1 AND fp.id IS NOT NULL`,
            [userId]
        );

        const stats = {
            toolCount: parseInt(toolCountResult.rows[0].count),
            deployedCount: parseInt(deployedCountResult.rows[0].count),
            fieldCount: parseInt(fieldCountResult.rows[0].count),
            premiumFieldCount: parseInt(premiumFieldCountResult.rows[0].count)
        };

        res.json(stats);

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            error: 'Failed to load dashboard statistics'
        });
    }
});

module.exports = router;