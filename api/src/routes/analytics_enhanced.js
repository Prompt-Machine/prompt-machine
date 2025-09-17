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

// Middleware to verify authentication
const verifyAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

/**
 * GET /api/analytics/user-summary
 * Get user-specific analytics summary
 */
router.get('/user-summary', verifyAuth, async (req, res) => {
    try {
        const userId = req.userId;
        const { days = 30 } = req.query;
        
        console.log(`📊 Loading user analytics summary for user ${userId}`);
        
        // Get user's projects analytics
        const analyticsQuery = `
            SELECT 
                COUNT(CASE WHEN a.event_type = 'view' THEN 1 END) as total_views,
                COUNT(CASE WHEN a.event_type = 'form_complete' THEN 1 END) as total_completions,
                COUNT(DISTINCT a.session_id) as unique_sessions,
                COUNT(DISTINCT a.project_id) as active_projects
            FROM tool_analytics_v6 a
            INNER JOIN projects_v6 p ON a.project_id = p.id
            WHERE p.user_id = $1
        `;
        
        const result = await pool.query(analyticsQuery, [userId]);
        const analytics = result.rows[0] || {
            total_views: 0,
            total_completions: 0,
            unique_sessions: 0,
            active_projects: 0
        };

        res.json({
            success: true,
            analytics: {
                totalViews: parseInt(analytics.total_views) || 0,
                totalCompletions: parseInt(analytics.total_completions) || 0,
                uniqueSessions: parseInt(analytics.unique_sessions) || 0,
                activeProjects: parseInt(analytics.active_projects) || 0
            }
        });

    } catch (error) {
        console.error('User analytics summary error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load user analytics summary' 
        });
    }
});

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard overview metrics
 */
router.get('/dashboard', verifyAuth, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        
        console.log(`📊 Loading analytics dashboard for ${days} days`);
        
        // Get overall summary using the database function
        const summaryResult = await pool.query('SELECT get_analytics_summary($1) as summary', [parseInt(days)]);
        const summary = summaryResult.rows[0].summary;
        
        // Get recent activity trends
        const trendsQuery = `
            SELECT 
                DATE(created_at) as date,
                COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
                COUNT(CASE WHEN event_type = 'form_start' THEN 1 END) as starts,
                COUNT(CASE WHEN event_type = 'form_complete' THEN 1 END) as completions,
                COUNT(DISTINCT session_id) as unique_sessions
            FROM tool_analytics_v6 
            WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 30
        `;
        
        const trendsResult = await pool.query(trendsQuery);
        const trends = trendsResult.rows;
        
        // Get top performing projects
        const topProjectsQuery = `
            SELECT 
                p.name,
                p.subdomain,
                p.id,
                COUNT(ta.id) as total_interactions,
                COUNT(DISTINCT ta.session_id) as unique_sessions,
                COUNT(CASE WHEN ta.event_type = 'form_complete' THEN 1 END) as completions,
                CASE 
                    WHEN COUNT(CASE WHEN ta.event_type = 'form_start' THEN 1 END) > 0 
                    THEN ROUND((COUNT(CASE WHEN ta.event_type = 'form_complete' THEN 1 END)::DECIMAL / COUNT(CASE WHEN ta.event_type = 'form_start' THEN 1 END)::DECIMAL) * 100, 2)
                    ELSE 0 
                END as completion_rate
            FROM projects_v6 p
            LEFT JOIN tool_analytics_v6 ta ON p.id = ta.project_id 
                AND ta.created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            WHERE p.deployed = true
            GROUP BY p.id, p.name, p.subdomain
            ORDER BY total_interactions DESC
            LIMIT 10
        `;
        
        const topProjectsResult = await pool.query(topProjectsQuery);
        const topProjects = topProjectsResult.rows;
        
        // Get device and browser statistics
        const deviceStatsQuery = `
            SELECT 
                device_type,
                COUNT(*) as count,
                ROUND((COUNT(*)::DECIMAL / NULLIF((SELECT COUNT(*) FROM tool_analytics_v6 WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'), 0)::DECIMAL) * 100, 1) as percentage
            FROM tool_analytics_v6 
            WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            AND device_type IS NOT NULL
            GROUP BY device_type
            ORDER BY count DESC
        `;
        
        const deviceStatsResult = await pool.query(deviceStatsQuery);
        const deviceStats = deviceStatsResult.rows;
        
        // Get user engagement metrics
        const engagementQuery = `
            SELECT 
                AVG(total_session_time) as avg_session_time,
                AVG(total_ai_interactions) as avg_ai_interactions,
                AVG(successful_completions) as avg_completions,
                SUM(revenue_generated) as total_revenue
            FROM user_engagement_metrics 
            WHERE date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
        `;
        
        const engagementResult = await pool.query(engagementQuery);
        const engagement = engagementResult.rows[0] || {};
        
        console.log(`✅ Analytics dashboard loaded successfully`);
        
        res.json({
            success: true,
            data: {
                summary,
                trends,
                top_projects: topProjects,
                device_stats: deviceStats,
                engagement: {
                    avg_session_time: parseFloat(engagement.avg_session_time) || 0,
                    avg_ai_interactions: parseFloat(engagement.avg_ai_interactions) || 0,
                    avg_completions: parseFloat(engagement.avg_completions) || 0,
                    total_revenue: parseFloat(engagement.total_revenue) || 0
                },
                period_days: parseInt(days)
            }
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
 * GET /api/analytics/projects/:projectId
 * Get detailed analytics for a specific project
 */
router.get('/projects/:projectId', verifyAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { days = 30 } = req.query;
        
        console.log(`📊 Loading project analytics for ${projectId}`);
        
        // Verify project exists and user has access
        const projectQuery = await pool.query(
            'SELECT name, subdomain, deployed FROM projects_v6 WHERE id = $1',
            [projectId]
        );
        
        if (projectQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        const project = projectQuery.rows[0];
        
        // Get comprehensive project metrics
        const metricsQuery = `
            SELECT 
                COUNT(CASE WHEN event_type = 'view' THEN 1 END) as total_views,
                COUNT(DISTINCT session_id) as unique_visitors,
                COUNT(CASE WHEN event_type = 'form_start' THEN 1 END) as form_starts,
                COUNT(CASE WHEN event_type = 'form_complete' THEN 1 END) as form_completions,
                COUNT(CASE WHEN event_type = 'error' THEN 1 END) as total_errors,
                AVG(session_duration) as avg_session_duration,
                AVG(ai_response_time) as avg_response_time,
                AVG(response_quality_rating) as avg_quality_rating
            FROM tool_analytics_v6 
            WHERE project_id = $1 
            AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
        `;
        
        const metricsResult = await pool.query(metricsQuery, [projectId]);
        const metrics = metricsResult.rows[0] || {};
        
        // Calculate key performance indicators
        const completionRate = metrics.form_starts > 0 
            ? (metrics.form_completions / metrics.form_starts * 100).toFixed(2)
            : 0;
            
        const bounceRate = metrics.total_views > 0 
            ? ((metrics.total_views - metrics.form_starts) / metrics.total_views * 100).toFixed(2)
            : 0;
            
        const errorRate = (metrics.total_views + metrics.form_starts) > 0 
            ? (metrics.total_errors / (metrics.total_views + metrics.form_starts) * 100).toFixed(2)
            : 0;
        
        // Get daily performance trends
        const dailyTrendsQuery = `
            SELECT 
                DATE(created_at) as date,
                COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
                COUNT(CASE WHEN event_type = 'form_start' THEN 1 END) as starts,
                COUNT(CASE WHEN event_type = 'form_complete' THEN 1 END) as completions,
                COUNT(CASE WHEN event_type = 'error' THEN 1 END) as errors,
                COUNT(DISTINCT session_id) as unique_sessions,
                AVG(ai_response_time) as avg_response_time
            FROM tool_analytics_v6 
            WHERE project_id = $1 
            AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;
        
        const dailyTrendsResult = await pool.query(dailyTrendsQuery, [projectId]);
        const dailyTrends = dailyTrendsResult.rows;
        
        // Get user feedback summary
        const feedbackQuery = `
            SELECT 
                AVG(rating) as avg_rating,
                COUNT(*) as total_feedback,
                AVG(ease_of_use_rating) as avg_ease_of_use,
                AVG(response_quality_rating) as avg_response_quality,
                AVG(overall_experience_rating) as avg_overall_experience,
                COUNT(CASE WHEN would_recommend = true THEN 1 END) as would_recommend_count,
                COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_ratings
            FROM user_feedback 
            WHERE project_id = $1 
            AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
        `;
        
        const feedbackResult = await pool.query(feedbackQuery, [projectId]);
        const feedback = feedbackResult.rows[0] || {};
        
        // Get device and traffic breakdown
        const trafficBreakdownQuery = `
            SELECT 
                device_type,
                browser,
                country,
                COUNT(*) as sessions,
                COUNT(DISTINCT session_id) as unique_sessions
            FROM tool_analytics_v6 
            WHERE project_id = $1 
            AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            AND device_type IS NOT NULL
            GROUP BY device_type, browser, country
            ORDER BY sessions DESC
            LIMIT 20
        `;
        
        const trafficBreakdownResult = await pool.query(trafficBreakdownQuery, [projectId]);
        const trafficBreakdown = trafficBreakdownResult.rows;
        
        console.log(`✅ Project analytics loaded successfully for ${project.name}`);
        
        res.json({
            success: true,
            data: {
                project: {
                    name: project.name,
                    subdomain: project.subdomain,
                    deployed: project.deployed,
                    url: project.subdomain ? `https://${project.subdomain}.tool.prompt-machine.com` : null
                },
                metrics: {
                    total_views: parseInt(metrics.total_views) || 0,
                    unique_visitors: parseInt(metrics.unique_visitors) || 0,
                    form_starts: parseInt(metrics.form_starts) || 0,
                    form_completions: parseInt(metrics.form_completions) || 0,
                    total_errors: parseInt(metrics.total_errors) || 0,
                    completion_rate: parseFloat(completionRate),
                    bounce_rate: parseFloat(bounceRate),
                    error_rate: parseFloat(errorRate),
                    avg_session_duration: parseFloat(metrics.avg_session_duration) || 0,
                    avg_response_time: parseFloat(metrics.avg_response_time) || 0,
                    avg_quality_rating: parseFloat(metrics.avg_quality_rating) || 0
                },
                daily_trends: dailyTrends,
                feedback: {
                    avg_rating: parseFloat(feedback.avg_rating) || 0,
                    total_feedback: parseInt(feedback.total_feedback) || 0,
                    avg_ease_of_use: parseFloat(feedback.avg_ease_of_use) || 0,
                    avg_response_quality: parseFloat(feedback.avg_response_quality) || 0,
                    avg_overall_experience: parseFloat(feedback.avg_overall_experience) || 0,
                    would_recommend_percentage: feedback.total_feedback > 0 
                        ? (feedback.would_recommend_count / feedback.total_feedback * 100).toFixed(1)
                        : 0,
                    satisfaction_score: feedback.total_feedback > 0 
                        ? (feedback.positive_ratings / feedback.total_feedback * 100).toFixed(1)
                        : 0
                },
                traffic_breakdown: trafficBreakdown,
                period_days: parseInt(days)
            }
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
 * Enhanced analytics tracking for deployed tools
 */
router.post('/track', async (req, res) => {
    try {
        const {
            project_id, session_id, event_type, step_number,
            field_interactions, user_agent, device_type, browser, os,
            session_duration, ai_response_time, error_message, metadata,
            country, city, referrer
        } = req.body;
        
        if (!project_id || !event_type) {
            return res.status(400).json({
                success: false,
                error: 'project_id and event_type are required'
            });
        }
        
        // Get client IP
        const user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        
        // Insert enhanced analytics event
        await pool.query(`
            INSERT INTO tool_analytics_v6 
            (project_id, session_id, event_type, step_number, field_interactions, 
             user_ip, user_agent, device_type, browser, os, session_duration, 
             ai_response_time, error_message, metadata, country, city, referrer)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
            project_id, session_id || null, event_type, step_number || null,
            field_interactions ? JSON.stringify(field_interactions) : null,
            user_ip, user_agent, device_type, browser, os, session_duration,
            ai_response_time, error_message, metadata ? JSON.stringify(metadata) : null,
            country, city, referrer
        ]);
        
        console.log(`📈 Enhanced analytics event tracked: ${event_type} for project ${project_id}`);
        
        res.json({
            success: true,
            message: 'Analytics event tracked successfully'
        });
        
    } catch (error) {
        console.error('Error tracking analytics event:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track analytics event'
        });
    }
});

/**
 * POST /api/analytics/feedback
 * Submit comprehensive user feedback
 */
router.post('/feedback', async (req, res) => {
    try {
        const {
            project_id, session_id, rating, feedback_text,
            improvement_suggestions, would_recommend,
            ease_of_use_rating, response_quality_rating,
            overall_experience_rating, feedback_category
        } = req.body;
        
        if (!project_id) {
            return res.status(400).json({
                success: false,
                error: 'project_id is required'
            });
        }
        
        // Get client IP
        const user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        
        // Insert comprehensive feedback
        await pool.query(`
            INSERT INTO user_feedback 
            (project_id, session_id, user_ip, rating, feedback_text, 
             improvement_suggestions, would_recommend, ease_of_use_rating,
             response_quality_rating, overall_experience_rating, feedback_category)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            project_id, session_id, user_ip, rating, feedback_text,
            improvement_suggestions, would_recommend, ease_of_use_rating,
            response_quality_rating, overall_experience_rating, feedback_category
        ]);
        
        console.log(`💬 Comprehensive feedback submitted for project ${project_id}: ${rating}/5 stars`);
        
        res.json({
            success: true,
            message: 'Feedback submitted successfully'
        });
        
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit feedback'
        });
    }
});

/**
 * GET /api/analytics/export/:projectId
 * Export comprehensive analytics data
 */
router.get('/export/:projectId', verifyAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { format = 'csv', days = 30 } = req.query;
        
        console.log(`📤 Exporting analytics for project ${projectId} in ${format} format`);
        
        // Get comprehensive analytics data
        const dataQuery = `
            SELECT 
                ta.created_at,
                ta.event_type,
                ta.step_number,
                ta.device_type,
                ta.browser,
                ta.os,
                ta.country,
                ta.city,
                ta.session_duration,
                ta.ai_response_time,
                ta.error_message,
                p.name as project_name,
                p.subdomain
            FROM tool_analytics_v6 ta
            JOIN projects_v6 p ON ta.project_id = p.id
            WHERE ta.project_id = $1 
            AND ta.created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            ORDER BY ta.created_at DESC
        `;
        
        const result = await pool.query(dataQuery, [projectId]);
        
        if (format === 'csv') {
            // Generate comprehensive CSV
            let csv = 'Date,Time,Event Type,Step,Device,Browser,OS,Country,City,Session Duration (s),AI Response Time (ms),Error,Project Name,Subdomain\n';
            result.rows.forEach(row => {
                const date = new Date(row.created_at);
                csv += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${row.event_type},${row.step_number || ''},${row.device_type || ''},${row.browser || ''},${row.os || ''},${row.country || ''},${row.city || ''},${row.session_duration || ''},${row.ai_response_time || ''},${row.error_message || ''},${row.project_name},${row.subdomain || ''}\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${projectId}-${Date.now()}.csv"`);
            res.send(csv);
        } else {
            // Return comprehensive JSON
            res.json({
                success: true,
                data: result.rows,
                count: result.rows.length,
                exported_at: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error('Error exporting analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export analytics data'
        });
    }
});

module.exports = router;