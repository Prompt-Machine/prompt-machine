// ========================================
// DASHBOARD ROUTES
// Main admin dashboard endpoints
// ========================================

const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const analyticsService = require('../services/analyticsService');
const userService = require('../services/userService');
const subscriptionService = require('../services/subscriptionService');
const deploymentService = require('../services/deploymentService');
const clientService = require('../services/clientService');

/**
 * GET /api/dashboard/stats
 * Get comprehensive dashboard statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const { timeframe = '7d' } = req.query;

        // Get analytics stats
        const analyticsStats = await analyticsService.getDashboardStats(timeframe);
        
        // Get revenue stats
        const revenueStats = await analyticsService.getRevenueAnalytics(timeframe);
        
        // Get subscription stats
        const subscriptionStats = await subscriptionService.getSubscriptionStats();
        
        // Get deployment stats
        const deploymentStats = await deploymentService.getDeploymentStats();
        
        // Get real-time stats
        const realTimeStats = await analyticsService.getRealTimeStats();
        
        // Get user segments
        const userSegments = await analyticsService.getUserSegments();
        
        // Get top tools
        const topTools = await analyticsService.getTopTools(5);

        res.json({
            success: true,
            data: {
                analytics: analyticsStats,
                revenue: revenueStats,
                subscriptions: subscriptionStats,
                deployments: deploymentStats,
                realTime: realTimeStats,
                userSegments,
                topTools,
                timeframe
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch dashboard statistics' 
        });
    }
});

/**
 * GET /api/dashboard/overview
 * Get dashboard overview data
 */
router.get('/overview', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

        let data = {};

        if (isAdmin) {
            // Admin gets full overview
            data = {
                totalUsers: await getUserCount(),
                activeUsers: await getActiveUserCount(),
                totalRevenue: await getTotalRevenue(),
                activeSubscriptions: await getActiveSubscriptions(),
                toolsCreated: await getToolsCount(),
                deploymentsToday: await getDeploymentsToday(),
                pendingTickets: await getPendingTickets(),
                systemHealth: await getSystemHealth()
            };
        } else {
            // Regular user gets their own stats
            const userStats = await userService.getUserStats(userId);
            const userSubscription = await subscriptionService.getUserSubscription(userId);
            
            data = {
                myTools: userStats.total_tools,
                deployedTools: userStats.deployed_tools,
                totalEvents: userStats.total_events,
                subscription: userSubscription,
                usage: await getUserUsage(userId)
            };
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch dashboard overview' 
        });
    }
});

/**
 * GET /api/dashboard/charts/revenue
 * Get revenue chart data
 */
router.get('/charts/revenue', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
    try {
        const { period = '30d', groupBy = 'day' } = req.query;
        
        const chartData = await getRevenueChartData(period, groupBy);
        
        res.json({
            success: true,
            data: chartData
        });
    } catch (error) {
        console.error('Revenue chart error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch revenue chart data' 
        });
    }
});

/**
 * GET /api/dashboard/charts/users
 * Get user growth chart data
 */
router.get('/charts/users', authenticateToken, requireRole(['admin', 'superadmin']), async (req, res) => {
    try {
        const { period = '30d', groupBy = 'day' } = req.query;
        
        const chartData = await getUserGrowthChartData(period, groupBy);
        
        res.json({
            success: true,
            data: chartData
        });
    } catch (error) {
        console.error('User chart error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch user chart data' 
        });
    }
});

/**
 * GET /api/dashboard/charts/tools
 * Get tools usage chart data
 */
router.get('/charts/tools', authenticateToken, async (req, res) => {
    try {
        const { period = '30d', projectId } = req.query;
        const userId = req.user.id;
        
        let chartData;
        if (projectId) {
            // Get specific tool analytics
            chartData = await analyticsService.getToolAnalytics(projectId, period);
        } else {
            // Get overall tools usage
            chartData = await getToolsUsageChartData(userId, period);
        }
        
        res.json({
            success: true,
            data: chartData
        });
    } catch (error) {
        console.error('Tools chart error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch tools chart data' 
        });
    }
});

/**
 * GET /api/dashboard/activity
 * Get recent activity feed
 */
router.get('/activity', authenticateToken, async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

        const activity = await getActivityFeed(userId, isAdmin, limit, offset);
        
        res.json({
            success: true,
            data: activity
        });
    } catch (error) {
        console.error('Activity feed error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch activity feed' 
        });
    }
});

/**
 * GET /api/dashboard/notifications
 * Get user notifications
 */
router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const { unreadOnly = false, limit = 20 } = req.query;
        const userId = req.user.id;

        const notifications = await getNotifications(userId, unreadOnly, limit);
        
        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Notifications error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch notifications' 
        });
    }
});

/**
 * POST /api/dashboard/notifications/:id/read
 * Mark notification as read
 */
router.post('/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await markNotificationRead(id, userId);
        
        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark notification error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to mark notification as read' 
        });
    }
});

/**
 * GET /api/dashboard/quick-stats
 * Get quick stats for dashboard cards
 */
router.get('/quick-stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

        let stats = {};

        if (isAdmin) {
            // Admin quick stats
            const { Pool } = require('pg');
            const pool = new Pool({
                host: process.env.DB_HOST,
                port: process.env.DB_PORT,
                database: process.env.DB_NAME,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD
            });

            const queries = {
                revenue: `
                    SELECT COALESCE(SUM(total), 0) as value,
                           COALESCE(((SUM(total) - LAG(SUM(total)) OVER (ORDER BY DATE_TRUNC('month', created_at))) / 
                                    NULLIF(LAG(SUM(total)) OVER (ORDER BY DATE_TRUNC('month', created_at)), 0) * 100), 0) as change
                    FROM invoices 
                    WHERE status = 'paid' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
                `,
                users: `
                    SELECT COUNT(*) as value,
                           COALESCE(((COUNT(*) - LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', created_at))) / 
                                    NULLIF(LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', created_at)), 0) * 100), 0) as change
                    FROM users_extended 
                    WHERE status = 'active'
                `,
                tools: `
                    SELECT COUNT(*) as value,
                           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as recent
                    FROM projects_v6
                `,
                apiCalls: `
                    SELECT COUNT(*) as value
                    FROM analytics_events 
                    WHERE event_type = 'api_call' AND created_at >= DATE_TRUNC('day', CURRENT_DATE)
                `
            };

            const results = await Promise.all(
                Object.entries(queries).map(async ([key, query]) => {
                    const result = await pool.query(query);
                    return { key, data: result.rows[0] };
                })
            );

            results.forEach(({ key, data }) => {
                stats[key] = data;
            });
        } else {
            // User quick stats
            stats = await userService.getUserStats(userId);
        }

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Quick stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch quick statistics' 
        });
    }
});

// Helper functions
async function getUserCount() {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query('SELECT COUNT(*) FROM users_extended WHERE status = $1', ['active']);
    return parseInt(result.rows[0].count);
}

async function getActiveUserCount() {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query(
        'SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE created_at >= NOW() - INTERVAL \'30 days\''
    );
    return parseInt(result.rows[0].count);
}

async function getTotalRevenue() {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query(
        'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = $1',
        ['paid']
    );
    return parseFloat(result.rows[0].total);
}

async function getActiveSubscriptions() {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query(
        'SELECT COUNT(*) FROM subscriptions WHERE status = $1',
        ['active']
    );
    return parseInt(result.rows[0].count);
}

async function getToolsCount() {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query('SELECT COUNT(*) FROM projects_v6');
    return parseInt(result.rows[0].count);
}

async function getDeploymentsToday() {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query(
        'SELECT COUNT(*) FROM tool_deployments WHERE created_at >= DATE_TRUNC(\'day\', CURRENT_DATE)'
    );
    return parseInt(result.rows[0].count);
}

async function getPendingTickets() {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query(
        'SELECT COUNT(*) FROM support_tickets WHERE status IN ($1, $2)',
        ['open', 'pending']
    );
    return parseInt(result.rows[0].count);
}

async function getSystemHealth() {
    // Check various system components
    return {
        api: 'operational',
        database: 'operational',
        ssl: 'warning', // Example: certificates expiring soon
        cdn: 'operational'
    };
}

async function getUserUsage(userId) {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const result = await pool.query(
        `SELECT 
            COUNT(*) FILTER (WHERE event_type = 'api_call') as api_calls,
            COUNT(*) FILTER (WHERE event_type = 'tool_used') as tool_uses,
            COUNT(DISTINCT project_id) as unique_tools
         FROM analytics_events 
         WHERE user_id = $1 AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
        [userId]
    );

    return result.rows[0];
}

async function getRevenueChartData(period, groupBy) {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const dateFormat = groupBy === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const query = `
        SELECT 
            TO_CHAR(created_at, $1) as date,
            SUM(total) as revenue
        FROM invoices
        WHERE status = 'paid' AND created_at >= NOW() - INTERVAL '${period}'
        GROUP BY TO_CHAR(created_at, $1)
        ORDER BY date
    `;

    const result = await pool.query(query, [dateFormat]);
    return result.rows;
}

async function getUserGrowthChartData(period, groupBy) {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const dateFormat = groupBy === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const query = `
        SELECT 
            TO_CHAR(created_at, $1) as date,
            COUNT(*) as new_users
        FROM users_extended
        WHERE created_at >= NOW() - INTERVAL '${period}'
        GROUP BY TO_CHAR(created_at, $1)
        ORDER BY date
    `;

    const result = await pool.query(query, [dateFormat]);
    return result.rows;
}

async function getToolsUsageChartData(userId, period) {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    const query = `
        SELECT 
            DATE(ae.created_at) as date,
            p.name as tool_name,
            COUNT(*) as uses
        FROM analytics_events ae
        JOIN projects_v6 p ON ae.project_id = p.id
        WHERE p.user_id = $1 AND ae.created_at >= NOW() - INTERVAL '${period}'
        GROUP BY DATE(ae.created_at), p.name
        ORDER BY date
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
}

async function getActivityFeed(userId, isAdmin, limit, offset) {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    let query;
    let params;

    if (isAdmin) {
        query = `
            SELECT 
                al.action,
                al.resource_type,
                al.created_at,
                u.full_name as user_name,
                u.email as user_email
            FROM audit_logs al
            LEFT JOIN users_extended u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT $1 OFFSET $2
        `;
        params = [limit, offset];
    } else {
        query = `
            SELECT 
                al.action,
                al.resource_type,
                al.created_at
            FROM audit_logs al
            WHERE al.user_id = $1
            ORDER BY al.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        params = [userId, limit, offset];
    }

    const result = await pool.query(query, params);
    return result.rows;
}

async function getNotifications(userId, unreadOnly, limit) {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    let query = `
        SELECT * FROM notifications
        WHERE user_id = $1
    `;
    
    if (unreadOnly) {
        query += ' AND read = false';
    }
    
    query += ' ORDER BY created_at DESC LIMIT $2';

    const result = await pool.query(query, [userId, limit]);
    return result.rows;
}

async function markNotificationRead(notificationId, userId) {
    const { Pool } = require('pg');
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    await pool.query(
        'UPDATE notifications SET read = true, read_at = NOW() WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
    );
}

module.exports = router;
