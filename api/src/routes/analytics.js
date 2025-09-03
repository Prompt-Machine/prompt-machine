const express = require('express');
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

const router = express.Router();

/**
 * GET /api/analytics/dashboard
 * Get analytics dashboard data for all projects
 */
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.body.userId || 'e88dad2e-5b81-4a6b-8d42-4b65611428ac';
        
        const query = `
            SELECT * FROM analytics_dashboard_v6 ad
            JOIN projects_v6 p ON ad.project_id = p.id
            WHERE p.user_id = $1
            ORDER BY ad.total_views DESC, ad.last_activity DESC
        `;
        
        const result = await pool.query(query, [userId]);
        
        // Get overall statistics
        const overallQuery = `
            SELECT 
                COUNT(DISTINCT p.id) as total_projects,
                COUNT(DISTINCT p.id) FILTER (WHERE p.deployed = true) as deployed_projects,
                COUNT(DISTINCT p.id) FILTER (WHERE p.enabled = true) as enabled_projects,
                COALESCE(SUM(ad.total_views), 0) as total_views,
                COALESCE(SUM(ad.total_submissions), 0) as total_submissions,
                COALESCE(SUM(ad.total_completions), 0) as total_completions,
                COALESCE(SUM(ad.total_revenue), 0) as total_revenue,
                COALESCE(SUM(ad.unique_sessions), 0) as total_sessions
            FROM projects_v6 p
            LEFT JOIN analytics_dashboard_v6 ad ON p.id = ad.project_id
            WHERE p.user_id = $1
        `;
        
        const overallResult = await pool.query(overallQuery, [userId]);
        
        res.json({
            success: true,
            projects: result.rows,
            overview: overallResult.rows[0]
        });
        
    } catch (error) {
        console.error('Error loading analytics dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load analytics dashboard'
        });
    }
});

/**
 * GET /api/analytics/project/:projectId
 * Get detailed analytics for a specific project
 */
router.get('/project/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { timeRange = '30d' } = req.query;
        
        // Calculate date range
        let dateFilter = '';
        switch (timeRange) {
            case '24h':
                dateFilter = "AND ta.created_at > NOW() - INTERVAL '24 hours'";
                break;
            case '7d':
                dateFilter = "AND ta.created_at > NOW() - INTERVAL '7 days'";
                break;
            case '30d':
                dateFilter = "AND ta.created_at > NOW() - INTERVAL '30 days'";
                break;
            case '90d':
                dateFilter = "AND ta.created_at > NOW() - INTERVAL '90 days'";
                break;
        }
        
        // Get daily analytics data
        const dailyQuery = `
            SELECT 
                DATE(ta.created_at) as date,
                COUNT(*) FILTER (WHERE ta.event_type = 'view') as views,
                COUNT(*) FILTER (WHERE ta.event_type = 'submit') as submissions,
                COUNT(*) FILTER (WHERE ta.event_type = 'complete') as completions,
                COUNT(*) FILTER (WHERE ta.event_type = 'error') as errors,
                COUNT(DISTINCT ta.session_id) as unique_sessions,
                COALESCE(SUM(tr.revenue_amount), 0) as revenue
            FROM tool_analytics_v6 ta
            LEFT JOIN tool_revenue_v6 tr ON ta.project_id = tr.project_id 
                AND DATE(ta.created_at) = DATE(tr.created_at)
            WHERE ta.project_id = $1 ${dateFilter}
            GROUP BY DATE(ta.created_at)
            ORDER BY date DESC
            LIMIT 90
        `;
        
        const dailyResult = await pool.query(dailyQuery, [projectId]);
        
        // Get top errors
        const errorsQuery = `
            SELECT 
                error_details,
                COUNT(*) as error_count,
                MAX(created_at) as last_occurrence
            FROM tool_analytics_v6 
            WHERE project_id = $1 AND event_type = 'error' ${dateFilter}
            GROUP BY error_details
            ORDER BY error_count DESC, last_occurrence DESC
            LIMIT 10
        `;
        
        const errorsResult = await pool.query(errorsQuery, [projectId]);
        
        // Get performance data
        const performanceQuery = `
            SELECT 
                AVG(response_time_ms) as avg_response_time,
                PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) as p50_response_time,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time,
                MAX(response_time_ms) as max_response_time
            FROM tool_analytics_v6 
            WHERE project_id = $1 AND response_time_ms IS NOT NULL ${dateFilter}
        `;
        
        const performanceResult = await pool.query(performanceQuery, [projectId]);
        
        res.json({
            success: true,
            timeRange,
            daily: dailyResult.rows,
            errors: errorsResult.rows,
            performance: performanceResult.rows[0] || {}
        });
        
    } catch (error) {
        console.error('Error loading project analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load project analytics'
        });
    }
});

/**
 * POST /api/analytics/track
 * Track analytics events (called by deployed tools)
 */
router.post('/track', async (req, res) => {
    try {
        const {
            projectId,
            eventType,
            sessionId,
            sessionData,
            stepData,
            errorDetails,
            responseTime
        } = req.body;
        
        // Get client info
        const userIp = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        
        const query = `
            INSERT INTO tool_analytics_v6 
            (project_id, event_type, user_ip, user_agent, session_id, 
             session_data, step_data, error_details, response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `;
        
        const result = await pool.query(query, [
            projectId, eventType, userIp, userAgent, sessionId,
            sessionData ? JSON.stringify(sessionData) : null,
            stepData ? JSON.stringify(stepData) : null,
            errorDetails, responseTime
        ]);
        
        res.json({
            success: true,
            trackingId: result.rows[0].id
        });
        
    } catch (error) {
        console.error('Error tracking analytics event:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track event'
        });
    }
});

/**
 * POST /api/analytics/revenue
 * Track revenue events (called by advertising system)
 */
router.post('/revenue', async (req, res) => {
    try {
        const {
            projectId,
            revenueType,
            revenueAmount,
            adUnitId
        } = req.body;
        
        const userIp = req.ip || req.connection.remoteAddress;
        
        const query = `
            INSERT INTO tool_revenue_v6 
            (project_id, revenue_type, revenue_amount, ad_unit_id, user_ip)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;
        
        const result = await pool.query(query, [
            projectId, revenueType, revenueAmount, adUnitId, userIp
        ]);
        
        res.json({
            success: true,
            revenueId: result.rows[0].id
        });
        
    } catch (error) {
        console.error('Error tracking revenue event:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track revenue'
        });
    }
});

module.exports = router;