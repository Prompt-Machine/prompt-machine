// ========================================
// ANALYTICS SERVICE
// Comprehensive analytics and reporting
// ========================================

const { Pool } = require('pg');
const moment = require('moment');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

class AnalyticsService {
    /**
     * Track analytics event
     */
    async trackEvent(eventData) {
        const {
            eventType,
            eventCategory,
            eventAction,
            eventLabel,
            eventValue,
            userId,
            sessionId,
            projectId,
            toolVersion,
            pageUrl,
            referrerUrl,
            utmSource,
            utmMedium,
            utmCampaign,
            deviceInfo,
            ipAddress,
            customProperties
        } = eventData;

        // Get location from IP
        const location = await this.getLocationFromIP(ipAddress);

        const query = `
            INSERT INTO analytics_events (
                event_type, event_category, event_action, event_label, event_value,
                user_id, session_id, project_id, tool_version,
                page_url, referrer_url, utm_source, utm_medium, utm_campaign,
                device_type, browser, os, ip_address,
                country, region, city, custom_properties
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING id
        `;

        const result = await pool.query(query, [
            eventType,
            eventCategory,
            eventAction,
            eventLabel,
            eventValue,
            userId,
            sessionId,
            projectId,
            toolVersion,
            pageUrl,
            referrerUrl,
            utmSource,
            utmMedium,
            utmCampaign,
            deviceInfo?.type,
            deviceInfo?.browser,
            deviceInfo?.os,
            ipAddress,
            location?.country,
            location?.region,
            location?.city,
            JSON.stringify(customProperties || {})
        ]);

        // Update session if exists
        if (sessionId) {
            await this.updateSession(sessionId, eventType);
        }

        return result.rows[0];
    }

    /**
     * Create or update session
     */
    async createSession(sessionData) {
        const {
            sessionId,
            userId,
            entryPage,
            deviceInfo,
            locationInfo
        } = sessionData;

        // Check if session exists
        const existing = await pool.query(
            'SELECT id FROM analytics_sessions WHERE session_id = $1',
            [sessionId]
        );

        if (existing.rows.length > 0) {
            // Update existing session
            return await this.updateSession(sessionId, 'page_view');
        }

        // Create new session
        const query = `
            INSERT INTO analytics_sessions (
                session_id, user_id, entry_page,
                device_info, location_info
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const result = await pool.query(query, [
            sessionId,
            userId,
            entryPage,
            JSON.stringify(deviceInfo || {}),
            JSON.stringify(locationInfo || {})
        ]);

        return result.rows[0];
    }

    /**
     * Update session
     */
    async updateSession(sessionId, eventType) {
        const updates = {
            page_views: eventType === 'page_view' ? 'page_views + 1' : 'page_views',
            events_count: 'events_count + 1',
            ended_at: 'NOW()'
        };

        const query = `
            UPDATE analytics_sessions 
            SET page_views = ${updates.page_views},
                events_count = ${updates.events_count},
                ended_at = ${updates.ended_at}
            WHERE session_id = $1
            RETURNING *
        `;

        const result = await pool.query(query, [sessionId]);
        return result.rows[0];
    }

    /**
     * Get dashboard statistics
     */
    async getDashboardStats(timeframe = '7d') {
        const startDate = this.getStartDate(timeframe);

        const query = `
            SELECT 
                -- User metrics
                (SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE created_at >= $1) as unique_visitors,
                (SELECT COUNT(*) FROM analytics_events WHERE event_type = 'page_view' AND created_at >= $1) as total_pageviews,
                (SELECT COUNT(DISTINCT session_id) FROM analytics_sessions WHERE started_at >= $1) as total_sessions,
                (SELECT AVG(duration_seconds) FROM analytics_sessions WHERE started_at >= $1) as avg_session_duration,
                
                -- Tool metrics
                (SELECT COUNT(*) FROM projects_v6 WHERE created_at >= $1) as tools_created,
                (SELECT COUNT(*) FROM tool_deployments WHERE created_at >= $1) as tools_deployed,
                (SELECT COUNT(*) FROM analytics_events WHERE event_type = 'tool_used' AND created_at >= $1) as tool_uses,
                
                -- Revenue metrics
                (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE created_at >= $1 AND status = 'paid') as revenue,
                (SELECT COUNT(*) FROM subscriptions WHERE created_at >= $1) as new_subscriptions,
                (SELECT COUNT(*) FROM subscriptions WHERE status = 'cancelled' AND cancelled_at >= $1) as cancelled_subscriptions,
                
                -- Engagement metrics
                (SELECT COUNT(*) FROM analytics_events WHERE event_type = 'conversion' AND created_at >= $1) as conversions,
                (SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE created_at >= $1 AND user_id IN (
                    SELECT user_id FROM analytics_events WHERE created_at >= $1 - INTERVAL '1 day' 
                )) as returning_users
        `;

        const result = await pool.query(query, [startDate]);
        return result.rows[0];
    }

    /**
     * Get tool analytics
     */
    async getToolAnalytics(projectId, timeframe = '30d') {
        const startDate = this.getStartDate(timeframe);

        const query = `
            SELECT 
                -- Usage metrics
                COUNT(*) as total_uses,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT session_id) as total_sessions,
                AVG(event_value) as avg_completion_rate,
                
                -- Engagement metrics
                COUNT(*) FILTER (WHERE event_type = 'tool_started') as starts,
                COUNT(*) FILTER (WHERE event_type = 'tool_completed') as completions,
                COUNT(*) FILTER (WHERE event_type = 'tool_shared') as shares,
                COUNT(*) FILTER (WHERE event_type = 'tool_exported') as exports,
                
                -- Performance metrics
                AVG(CAST(custom_properties->>'load_time' AS NUMERIC)) as avg_load_time,
                AVG(CAST(custom_properties->>'generation_time' AS NUMERIC)) as avg_generation_time,
                
                -- User feedback
                AVG(CAST(custom_properties->>'rating' AS NUMERIC)) as avg_rating,
                COUNT(*) FILTER (WHERE custom_properties->>'feedback' IS NOT NULL) as feedback_count
                
            FROM analytics_events
            WHERE project_id = $1 AND created_at >= $2
        `;

        const result = await pool.query(query, [projectId, startDate]);
        
        // Get time series data
        const timeSeriesQuery = `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as uses,
                COUNT(DISTINCT user_id) as users
            FROM analytics_events
            WHERE project_id = $1 AND created_at >= $2
            GROUP BY DATE(created_at)
            ORDER BY date
        `;

        const timeSeries = await pool.query(timeSeriesQuery, [projectId, startDate]);

        return {
            metrics: result.rows[0],
            timeSeries: timeSeries.rows
        };
    }

    /**
     * Get user analytics
     */
    async getUserAnalytics(userId) {
        const query = `
            SELECT 
                -- Activity metrics
                COUNT(*) as total_events,
                COUNT(DISTINCT DATE(created_at)) as active_days,
                COUNT(DISTINCT project_id) as tools_used,
                COUNT(DISTINCT session_id) as total_sessions,
                
                -- Engagement metrics
                COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views,
                COUNT(*) FILTER (WHERE event_type = 'tool_used') as tool_uses,
                COUNT(*) FILTER (WHERE event_type = 'conversion') as conversions,
                
                -- Time patterns
                EXTRACT(HOUR FROM created_at) as most_active_hour,
                EXTRACT(DOW FROM created_at) as most_active_day,
                
                -- First and last activity
                MIN(created_at) as first_seen,
                MAX(created_at) as last_seen
                
            FROM analytics_events
            WHERE user_id = $1
            GROUP BY EXTRACT(HOUR FROM created_at), EXTRACT(DOW FROM created_at)
            ORDER BY COUNT(*) DESC
            LIMIT 1
        `;

        const result = await pool.query(query, [userId]);
        return result.rows[0];
    }

    /**
     * Get revenue analytics
     */
    async getRevenueAnalytics(timeframe = '30d') {
        const startDate = this.getStartDate(timeframe);

        const query = `
            SELECT 
                -- Revenue metrics
                COALESCE(SUM(total), 0) as total_revenue,
                COALESCE(AVG(total), 0) as avg_transaction,
                COUNT(*) as total_transactions,
                COUNT(DISTINCT s.user_id) as paying_customers,
                
                -- Subscription metrics
                COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as active_subscriptions,
                COUNT(DISTINCT s.id) FILTER (WHERE s.billing_cycle = 'monthly') as monthly_subscriptions,
                COUNT(DISTINCT s.id) FILTER (WHERE s.billing_cycle = 'yearly') as yearly_subscriptions,
                
                -- MRR/ARR
                SUM(sp.price_monthly) FILTER (WHERE s.status = 'active' AND s.billing_cycle = 'monthly') as mrr,
                SUM(sp.price_yearly / 12) FILTER (WHERE s.status = 'active' AND s.billing_cycle = 'yearly') as arr_monthly,
                
                -- Growth metrics
                COUNT(DISTINCT s.id) FILTER (WHERE s.created_at >= $1) as new_subscriptions,
                COUNT(DISTINCT s.id) FILTER (WHERE s.cancelled_at >= $1) as churned_subscriptions
                
            FROM invoices i
            LEFT JOIN subscriptions s ON i.subscription_id = s.id
            LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE i.created_at >= $1
        `;

        const result = await pool.query(query, [startDate]);

        // Calculate churn rate
        const churnQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE cancelled_at >= $1) * 100.0 / 
                NULLIF(COUNT(*) FILTER (WHERE created_at < $1), 0) as churn_rate
            FROM subscriptions
        `;

        const churnResult = await pool.query(churnQuery, [startDate]);

        return {
            ...result.rows[0],
            churn_rate: churnResult.rows[0].churn_rate || 0
        };
    }

    /**
     * Get conversion funnel
     */
    async getConversionFunnel(projectId, steps) {
        const funnel = [];

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const query = `
                SELECT COUNT(DISTINCT session_id) as count
                FROM analytics_events
                WHERE project_id = $1 AND event_type = $2
            `;

            const result = await pool.query(query, [projectId, step.event]);
            
            funnel.push({
                name: step.name,
                event: step.event,
                count: parseInt(result.rows[0].count),
                rate: i === 0 ? 100 : 0
            });
        }

        // Calculate conversion rates
        for (let i = 1; i < funnel.length; i++) {
            funnel[i].rate = funnel[0].count > 0 
                ? (funnel[i].count / funnel[0].count * 100).toFixed(2)
                : 0;
        }

        return funnel;
    }

    /**
     * Get top performing tools
     */
    async getTopTools(limit = 10) {
        const query = `
            SELECT 
                p.id,
                p.name,
                p.description,
                COUNT(DISTINCT ae.user_id) as unique_users,
                COUNT(ae.id) as total_uses,
                AVG(CAST(ae.custom_properties->>'rating' AS NUMERIC)) as avg_rating,
                COALESCE(SUM(tm.revenue_total), 0) as revenue
            FROM projects_v6 p
            LEFT JOIN analytics_events ae ON p.id = ae.project_id
            LEFT JOIN tool_marketplace tm ON p.id = tm.project_id
            GROUP BY p.id
            ORDER BY unique_users DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [limit]);
        return result.rows;
    }

    /**
     * Get user segments
     */
    async getUserSegments() {
        const segments = [];

        // New users (registered in last 7 days)
        const newUsersQuery = `
            SELECT COUNT(*) as count
            FROM users_extended
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `;
        const newUsers = await pool.query(newUsersQuery);
        segments.push({
            name: 'New Users',
            count: parseInt(newUsers.rows[0].count),
            criteria: 'Registered in last 7 days'
        });

        // Active users (activity in last 30 days)
        const activeUsersQuery = `
            SELECT COUNT(DISTINCT user_id) as count
            FROM analytics_events
            WHERE created_at >= NOW() - INTERVAL '30 days'
        `;
        const activeUsers = await pool.query(activeUsersQuery);
        segments.push({
            name: 'Active Users',
            count: parseInt(activeUsers.rows[0].count),
            criteria: 'Activity in last 30 days'
        });

        // Power users (>100 events in last 30 days)
        const powerUsersQuery = `
            SELECT COUNT(DISTINCT user_id) as count
            FROM (
                SELECT user_id, COUNT(*) as event_count
                FROM analytics_events
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY user_id
                HAVING COUNT(*) > 100
            ) as power_users
        `;
        const powerUsers = await pool.query(powerUsersQuery);
        segments.push({
            name: 'Power Users',
            count: parseInt(powerUsers.rows[0].count),
            criteria: '>100 events in last 30 days'
        });

        // Paying customers
        const payingCustomersQuery = `
            SELECT COUNT(DISTINCT user_id) as count
            FROM subscriptions
            WHERE status = 'active'
        `;
        const payingCustomers = await pool.query(payingCustomersQuery);
        segments.push({
            name: 'Paying Customers',
            count: parseInt(payingCustomers.rows[0].count),
            criteria: 'Active subscription'
        });

        // At risk (no activity in 14-30 days)
        const atRiskQuery = `
            SELECT COUNT(DISTINCT user_id) as count
            FROM users_extended u
            WHERE u.id IN (
                SELECT DISTINCT user_id
                FROM analytics_events
                WHERE created_at < NOW() - INTERVAL '14 days'
                  AND created_at >= NOW() - INTERVAL '30 days'
            ) AND u.id NOT IN (
                SELECT DISTINCT user_id
                FROM analytics_events
                WHERE created_at >= NOW() - INTERVAL '14 days'
            )
        `;
        const atRisk = await pool.query(atRiskQuery);
        segments.push({
            name: 'At Risk',
            count: parseInt(atRisk.rows[0].count),
            criteria: 'No activity in 14-30 days'
        });

        // Churned (no activity in 30+ days)
        const churnedQuery = `
            SELECT COUNT(DISTINCT user_id) as count
            FROM users_extended u
            WHERE u.id NOT IN (
                SELECT DISTINCT user_id
                FROM analytics_events
                WHERE created_at >= NOW() - INTERVAL '30 days'
            ) AND u.created_at < NOW() - INTERVAL '30 days'
        `;
        const churned = await pool.query(churnedQuery);
        segments.push({
            name: 'Churned',
            count: parseInt(churned.rows[0].count),
            criteria: 'No activity in 30+ days'
        });

        return segments;
    }

    /**
     * Get real-time stats
     */
    async getRealTimeStats() {
        const query = `
            SELECT 
                -- Active users now (last 5 minutes)
                (SELECT COUNT(DISTINCT user_id) 
                 FROM analytics_events 
                 WHERE created_at >= NOW() - INTERVAL '5 minutes') as active_users,
                
                -- Current sessions
                (SELECT COUNT(DISTINCT session_id)
                 FROM analytics_sessions
                 WHERE ended_at IS NULL OR ended_at >= NOW() - INTERVAL '30 minutes') as active_sessions,
                
                -- Events in last minute
                (SELECT COUNT(*)
                 FROM analytics_events
                 WHERE created_at >= NOW() - INTERVAL '1 minute') as events_per_minute,
                
                -- Top current page
                (SELECT page_url
                 FROM analytics_events
                 WHERE created_at >= NOW() - INTERVAL '5 minutes'
                 GROUP BY page_url
                 ORDER BY COUNT(*) DESC
                 LIMIT 1) as top_page,
                
                -- Top current tool
                (SELECT p.name
                 FROM analytics_events ae
                 JOIN projects_v6 p ON ae.project_id = p.id
                 WHERE ae.created_at >= NOW() - INTERVAL '5 minutes'
                 GROUP BY p.name
                 ORDER BY COUNT(*) DESC
                 LIMIT 1) as top_tool
        `;

        const result = await pool.query(query);
        return result.rows[0];
    }

    /**
     * Generate analytics report
     */
    async generateReport(reportType, parameters) {
        const { startDate, endDate, projectId, userId, format } = parameters;

        let reportData;

        switch (reportType) {
            case 'dashboard':
                reportData = await this.getDashboardStats(parameters.timeframe);
                break;
            case 'tool':
                reportData = await this.getToolAnalytics(projectId, parameters.timeframe);
                break;
            case 'user':
                reportData = await this.getUserAnalytics(userId);
                break;
            case 'revenue':
                reportData = await this.getRevenueAnalytics(parameters.timeframe);
                break;
            case 'custom':
                reportData = await this.getCustomReport(parameters);
                break;
            default:
                throw new Error('Invalid report type');
        }

        // Store report
        const query = `
            INSERT INTO reports_generated (
                report_type, title, description,
                generated_by, client_id, project_id,
                date_range_start, date_range_end,
                format, parameters, data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;

        const result = await pool.query(query, [
            reportType,
            parameters.title || `${reportType} Report`,
            parameters.description,
            parameters.generatedBy,
            parameters.clientId,
            projectId,
            startDate,
            endDate,
            format || 'json',
            JSON.stringify(parameters),
            JSON.stringify(reportData)
        ]);

        return result.rows[0];
    }

    /**
     * Get custom report
     */
    async getCustomReport(parameters) {
        const { metrics, dimensions, filters, startDate, endDate, groupBy } = parameters;

        // Build dynamic query based on parameters
        let query = 'SELECT ';
        
        // Add metrics
        const metricClauses = metrics.map(metric => {
            switch (metric) {
                case 'users':
                    return 'COUNT(DISTINCT user_id) as users';
                case 'sessions':
                    return 'COUNT(DISTINCT session_id) as sessions';
                case 'events':
                    return 'COUNT(*) as events';
                case 'revenue':
                    return 'SUM(event_value) as revenue';
                default:
                    return `COUNT(*) FILTER (WHERE event_type = '${metric}') as ${metric}`;
            }
        });

        query += metricClauses.join(', ');

        // Add dimensions
        if (dimensions && dimensions.length > 0) {
            query += ', ' + dimensions.join(', ');
        }

        query += ' FROM analytics_events WHERE 1=1';

        // Add filters
        if (startDate) {
            query += ` AND created_at >= '${startDate}'`;
        }
        if (endDate) {
            query += ` AND created_at <= '${endDate}'`;
        }
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                query += ` AND ${key} = '${value}'`;
            });
        }

        // Add grouping
        if (groupBy) {
            query += ` GROUP BY ${groupBy}`;
        }

        query += ' ORDER BY 1 DESC';

        const result = await pool.query(query);
        return result.rows;
    }

    /**
     * Helper: Get start date from timeframe
     */
    getStartDate(timeframe) {
        const now = moment();
        switch (timeframe) {
            case '1h':
                return now.subtract(1, 'hour').toDate();
            case '24h':
                return now.subtract(24, 'hours').toDate();
            case '7d':
                return now.subtract(7, 'days').toDate();
            case '30d':
                return now.subtract(30, 'days').toDate();
            case '90d':
                return now.subtract(90, 'days').toDate();
            case '1y':
                return now.subtract(1, 'year').toDate();
            default:
                return now.subtract(7, 'days').toDate();
        }
    }

    /**
     * Helper: Get location from IP address
     */
    async getLocationFromIP(ipAddress) {
        // This would integrate with a geolocation service
        // For now, return mock data
        return {
            country: 'US',
            region: 'California',
            city: 'San Francisco'
        };
    }
}

module.exports = new AnalyticsService();
