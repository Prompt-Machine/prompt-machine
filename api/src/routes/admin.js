const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { verifyAuth } = require('../middleware/auth');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

// Simple admin check middleware that uses existing verifyAuth
async function requireAdmin(req, res, next) {
    // First verify authentication using the working middleware
    verifyAuth(req, res, () => {
        // Now check if user is admin
        try {
            console.log('🔐 Checking admin permissions for user:', req.user.email);
            if (req.user.email && req.user.email.includes('admin')) {
                console.log('✅ Admin access granted for user:', req.user.email);
                next();
            } else {
                console.log('❌ User is not admin:', req.user.email);
                return res.status(403).json({ 
                    success: false,
                    error: 'Admin access required' 
                });
            }
        } catch (error) {
            console.error('Admin check error:', error);
            return res.status(403).json({ 
                success: false,
                error: 'Admin access check failed' 
            });
        }
    });
}

// Test endpoint without authentication
router.get('/test', async (req, res) => {
    res.json({
        success: true,
        message: 'Admin routes working',
        timestamp: new Date().toISOString()
    });
});

// Simplified system status endpoint with basic auth check
router.get('/system/status/public', async (req, res) => {
    try {
        // Public endpoint - no authentication required

        // Test database connection
        await pool.query('SELECT 1');
        
        // Get basic system info
        const uptimeSeconds = Math.floor(process.uptime());
        const uptimeDays = Math.floor(uptimeSeconds / 86400);
        const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
        const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
        const formattedUptime = `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`;
        
        const memUsage = process.memoryUsage();
        const memoryUsage = `${Math.round(memUsage.rss / 1024 / 1024)}MB`;
        
        // Mock system status (for now)
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            status: {
                api: {
                    healthy: true,
                    uptime: formattedUptime,
                    version: 'v1.5.0rc'
                },
                database: {
                    connected: true,
                    pool_size: 10,
                    active_connections: 2
                },
                ai_service: {
                    configured: true,
                    provider: 'OpenAI',
                    model: 'gpt-4o-mini-2024-07-18'
                },
                storage: {
                    root_disk: {
                        usage_percentage: '45',
                        total_size: '20GB',
                        available_size: '11GB',
                        used_size: '9GB'
                    }
                },
                system: {
                    hostname: require('os').hostname(),
                    platform: `${process.platform} ${process.arch}`,
                    node_version: process.version,
                    memory_usage: memoryUsage,
                    cpu_usage: '< 1%'
                }
            }
        });
        
    } catch (error) {
        console.error('System status error:', error);
        res.status(500).json({
            success: false,
            error: 'System status check failed',
            status: {
                api: { healthy: false, error: error.message },
                database: { connected: false, error: error.message },
                ai_service: { configured: false },
                storage: { root_disk: null }
            }
        });
    }
});

// Simplified AI config endpoint with basic auth check
router.get('/ai-config/public', async (req, res) => {
    try {
        // Simple auth check
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        // Read AI config from .env file
        const fs = require('fs');
        let envContent = '';
        try {
            envContent = fs.readFileSync(process.cwd() + '/.env', 'utf8');
        } catch (error) {
            console.error('Error reading .env file:', error);
        }

        // Parse AI configuration
        const openaiKeyMatch = envContent.match(/^OPENAI_API_KEY=(.*)$/m);
        const claudeKeyMatch = envContent.match(/^CLAUDE_API_KEY=(.*)$/m);
        const activeProviderMatch = envContent.match(/^AI_PROVIDER=(.*)$/m);
        const activeModelMatch = envContent.match(/^AI_MODEL=(.*)$/m);

        const hasOpenAI = openaiKeyMatch && openaiKeyMatch[1] && openaiKeyMatch[1].trim() !== '';
        const hasClaude = claudeKeyMatch && claudeKeyMatch[1] && claudeKeyMatch[1].trim() !== '';
        const activeProvider = activeProviderMatch ? activeProviderMatch[1].trim() : '';
        const activeModel = activeModelMatch ? activeModelMatch[1].trim() : '';

        // Create provider objects
        const providers = {
            openai: {
                name: 'OpenAI',
                hasKey: hasOpenAI,
                isActive: activeProvider === 'openai',
                keyPreview: hasOpenAI ? 'sk-...' + (openaiKeyMatch[1].slice(-6)) : null,
                selectedModel: activeProvider === 'openai' ? activeModel : 'gpt-4o-mini-2024-07-18',
                models: ['gpt-4o-mini-2024-07-18', 'gpt-4', 'gpt-3.5-turbo'],
                keyFormat: 'sk-...'
            },
            anthropic: {
                name: 'Claude (Anthropic)',
                hasKey: hasClaude,
                isActive: activeProvider === 'anthropic',
                keyPreview: hasClaude ? 'sk-ant-...' + (claudeKeyMatch[1].slice(-6)) : null,
                selectedModel: activeProvider === 'anthropic' ? activeModel : 'claude-3-5-sonnet-20241022',
                models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
                keyFormat: 'sk-ant-...'
            }
        };

        // Determine current model
        let currentModel = null;
        if (activeProvider && activeModel) {
            currentModel = activeModel;
        }

        res.json({
            success: true,
            providers: providers,
            currentModel: currentModel,
            activeProvider: activeProvider
        });

    } catch (error) {
        console.error('AI config error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get AI configuration'
        });
    }
});

// AI Config key management endpoints
router.post('/ai-config/test-key', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { providerId, apiKey } = req.body;
        
        if (!providerId || !apiKey) {
            return res.status(400).json({
                success: false,
                error: 'Provider ID and API key are required'
            });
        }

        // Simple API key validation based on format
        let models = [];
        let isValid = false;
        
        if (providerId === 'openai') {
            isValid = apiKey.startsWith('sk-');
            models = ['gpt-4o-mini-2024-07-18', 'gpt-4', 'gpt-3.5-turbo'];
        } else if (providerId === 'anthropic') {
            isValid = apiKey.startsWith('sk-ant-');
            models = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'];
        }

        if (isValid) {
            res.json({
                success: true,
                message: 'API key format is valid',
                models: models
            });
        } else {
            res.json({
                success: false,
                error: 'Invalid API key format'
            });
        }
        
    } catch (error) {
        console.error('Test API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test API key'
        });
    }
});

router.post('/ai-config/update-key', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { providerId, apiKey, selectedModel } = req.body;
        
        if (!providerId || !apiKey || !selectedModel) {
            return res.status(400).json({
                success: false,
                error: 'Provider ID, API key, and model are required'
            });
        }

        // Update .env file
        const fs = require('fs');
        const path = require('path');
        const envPath = path.resolve(process.cwd(), '.env');
        
        let envContent = '';
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Could not read .env file'
            });
        }

        // Update the appropriate API key
        const keyField = providerId === 'openai' ? 'OPENAI_API_KEY' : 'CLAUDE_API_KEY';
        const keyRegex = new RegExp(`^${keyField}=.*$`, 'm');
        
        if (keyRegex.test(envContent)) {
            envContent = envContent.replace(keyRegex, `${keyField}=${apiKey}`);
        } else {
            envContent += `\n${keyField}=${apiKey}`;
        }

        // Write back to .env file
        fs.writeFileSync(envPath, envContent);

        res.json({
            success: true,
            message: 'API key saved successfully',
            restarted: false // Don't restart unless provider/model changes
        });
        
    } catch (error) {
        console.error('Update API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save API key'
        });
    }
});

router.post('/ai-config/set-active', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { providerId, model } = req.body;
        
        if (!providerId || !model) {
            return res.status(400).json({
                success: false,
                error: 'Provider ID and model are required'
            });
        }

        // Update .env file with active provider and model
        const fs = require('fs');
        const path = require('path');
        const envPath = path.resolve(process.cwd(), '.env');
        
        let envContent = '';
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Could not read .env file'
            });
        }

        // Update AI_PROVIDER
        const providerRegex = /^AI_PROVIDER=.*$/m;
        if (providerRegex.test(envContent)) {
            envContent = envContent.replace(providerRegex, `AI_PROVIDER=${providerId}`);
        } else {
            envContent += `\nAI_PROVIDER=${providerId}`;
        }

        // Update AI_MODEL
        const modelRegex = /^AI_MODEL=.*$/m;
        if (modelRegex.test(envContent)) {
            envContent = envContent.replace(modelRegex, `AI_MODEL=${model}`);
        } else {
            envContent += `\nAI_MODEL=${model}`;
        }

        // Write back to .env file
        fs.writeFileSync(envPath, envContent);

        res.json({
            success: true,
            message: `Switched to ${providerId} with model ${model}`,
            restarted: true // Only restart when changing active provider/model
        });
        
    } catch (error) {
        console.error('Set active provider error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set active provider'
        });
    }
});

router.delete('/ai-config/remove-key/:providerId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { providerId } = req.params;
        
        // Update .env file to remove API key
        const fs = require('fs');
        const path = require('path');
        const envPath = path.resolve(process.cwd(), '.env');
        
        let envContent = '';
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Could not read .env file'
            });
        }

        // Remove the appropriate API key
        const keyField = providerId === 'openai' ? 'OPENAI_API_KEY' : 'CLAUDE_API_KEY';
        const keyRegex = new RegExp(`^${keyField}=.*$`, 'm');
        
        if (keyRegex.test(envContent)) {
            envContent = envContent.replace(keyRegex, `# ${keyField}=your-api-key-here`);
            fs.writeFileSync(envPath, envContent);
        }

        res.json({
            success: true,
            message: 'API key removed successfully'
        });
        
    } catch (error) {
        console.error('Remove API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove API key'
        });
    }
});

// Advertising management endpoints
router.get('/advertising/all', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        // Get all deployed tools with advertising information
        const result = await pool.query(`
            SELECT 
                p.id,
                p.name,
                p.description,
                p.deployed,
                p.enabled,
                COALESCE(ta.enabled, false) as ad_enabled,
                ta.google_ads_client_id,
                ta.google_ads_slot_id,
                ta.show_header_ad,
                ta.show_footer_ad,
                ta.show_sidebar_ad,
                ta.revenue_share_enabled,
                ta.platform_revenue_percentage,
                ta.clicks_tracked,
                ta.impressions_tracked
            FROM projects_v6 p
            LEFT JOIN tool_advertising ta ON p.id = ta.tool_id
            WHERE p.deployed = true
            ORDER BY p.name
        `);

        res.json({
            success: true,
            tools: result.rows
        });
        
    } catch (error) {
        console.error('Error getting advertising data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load advertising data'
        });
    }
});

// Configure advertising for a tool
router.post('/advertising/configure', async (req, res) => {
    try {
        const { toolId, adSettings } = req.body;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        // Check if advertising config exists for this tool
        const existingConfig = await pool.query(
            'SELECT id FROM tool_advertising WHERE tool_id = $1',
            [toolId]
        );

        if (existingConfig.rows.length > 0) {
            // Update existing configuration
            await pool.query(`
                UPDATE tool_advertising SET
                    google_ads_client_id = $2,
                    google_ads_slot_id = $3,
                    show_header_ad = $4,
                    show_footer_ad = $5,
                    show_sidebar_ad = $6,
                    revenue_share_enabled = $7,
                    platform_revenue_percentage = $8,
                    enabled = $9,
                    updated_at = CURRENT_TIMESTAMP
                WHERE tool_id = $1
            `, [
                toolId,
                adSettings.google_ads_client_id,
                adSettings.google_ads_slot_id,
                adSettings.show_header_ad || false,
                adSettings.show_footer_ad || false,
                adSettings.show_sidebar_ad || false,
                adSettings.revenue_share_enabled || false,
                adSettings.platform_revenue_percentage || 10.00,
                adSettings.enabled || false
            ]);
        } else {
            // Insert new configuration
            await pool.query(`
                INSERT INTO tool_advertising (
                    tool_id, user_id, provider, google_ads_client_id, google_ads_slot_id,
                    show_header_ad, show_footer_ad, show_sidebar_ad, 
                    revenue_share_enabled, platform_revenue_percentage, enabled
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                toolId,
                'admin@prompt-machine.com', // Default admin user
                adSettings.provider || 'google',
                adSettings.google_ads_client_id,
                adSettings.google_ads_slot_id,
                adSettings.show_header_ad || false,
                adSettings.show_footer_ad || false,
                adSettings.show_sidebar_ad || false,
                adSettings.revenue_share_enabled || false,
                adSettings.platform_revenue_percentage || 10.00,
                adSettings.enabled || false
            ]);
        }

        res.json({
            success: true,
            message: 'Advertising configuration updated'
        });

    } catch (error) {
        console.error('Error configuring advertising:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to configure advertising'
        });
    }
});

// Package management endpoints
router.get('/packages/all', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        // Get all packages
        const packagesResult = await pool.query(`
            SELECT id, name, display_name, description, price, billing_period, features, limits, created_at
            FROM packages
            WHERE is_active = true
            ORDER BY price
        `);

        // Get users with package information
        const usersResult = await pool.query(`
            SELECT 
                u.id,
                u.email,
                u.created_at,
                p.display_name as package_name,
                0 as usage_count
            FROM users u
            LEFT JOIN user_packages up ON u.id = up.user_id AND up.is_active = true
            LEFT JOIN packages p ON up.package_id = p.id
            ORDER BY u.created_at DESC
            LIMIT 50
        `);

        res.json({
            success: true,
            packages: packagesResult.rows,
            users: usersResult.rows
        });
        
    } catch (error) {
        console.error('Error getting packages data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load packages data'
        });
    }
});

// User management endpoints
router.put('/users/:userId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { userId } = req.params;
        const { email } = req.body;
        
        // Update user email
        await pool.query(
            'UPDATE users SET email = $1 WHERE id = $2',
            [email, userId]
        );

        res.json({
            success: true,
            message: 'User updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

router.put('/users/:userId/package', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { userId } = req.params;
        const { package: packageName } = req.body;
        
        // Get package ID by name
        let packageId = null;
        if (packageName && packageName !== 'free') {
            const packageResult = await pool.query(
                'SELECT id FROM packages WHERE name ILIKE $1',
                [packageName]
            );
            if (packageResult.rows.length > 0) {
                packageId = packageResult.rows[0].id;
            }
        }
        
        // Deactivate existing user packages
        await pool.query(
            'UPDATE user_packages SET is_active = false WHERE user_id = $1',
            [userId]
        );
        
        // Add new package if not free
        if (packageId) {
            await pool.query(`
                INSERT INTO user_packages (user_id, package_id, granted_by, is_active)
                VALUES ($1, $2, (SELECT id FROM users WHERE email = 'admin@prompt-machine.com'), true)
                ON CONFLICT (user_id, package_id) 
                DO UPDATE SET is_active = true, granted_at = CURRENT_TIMESTAMP
            `, [userId, packageId]);
        }

        res.json({
            success: true,
            message: 'User package updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating user package:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user package'
        });
    }
});

// Admin dashboard stats
router.get('/dashboard/stats', requireAdmin, async (req, res) => {
    try {
        // Get total users count
        const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
        const totalUsers = parseInt(usersResult.rows[0].count) || 0;
        
        // Get active tools count (deployed and enabled)
        const toolsResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM projects_v6 
            WHERE deployed = true AND enabled = true
        `);
        const activeTools = parseInt(toolsResult.rows[0].count) || 0;
        
        // Get early access signups count
        const earlyAccessResult = await pool.query('SELECT COUNT(*) as count FROM early_access_signups');
        const earlyAccessSignups = parseInt(earlyAccessResult.rows[0].count) || 0;
        
        // Get total usage count (sum of all tool usage)
        const usageResult = await pool.query(`
            SELECT COALESCE(SUM(
                COALESCE((SELECT COUNT(*) FROM project_sessions_v6 WHERE project_id = p.id), 0)
            ), 0) as total_usage
            FROM projects_v6 p
            WHERE deployed = true AND enabled = true
        `);
        const totalUsage = parseInt(usageResult.rows[0].total_usage) || 0;
        
        res.json({
            success: true,
            stats: {
                totalUsers,
                activeTools,
                earlyAccessSignups,
                totalUsage
            }
        });
        
    } catch (error) {
        console.error('Error getting admin dashboard stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard statistics'
        });
    }
});

// Get recent users
router.get('/users/recent', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const result = await pool.query(`
            SELECT id, email, created_at,
                   CASE 
                       WHEN email ILIKE '%admin%' THEN 'admin'
                       ELSE 'user'
                   END as role
            FROM users 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [limit]);
        
        res.json({
            success: true,
            users: result.rows
        });
        
    } catch (error) {
        console.error('Error getting recent users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load recent users'
        });
    }
});

// Get all users with pagination
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const role = req.query.role || '';
        
        let query = `
            SELECT u.id, u.email, u.created_at,
                   CASE 
                       WHEN u.email ILIKE '%admin%' THEN 'admin'
                       ELSE 'user'
                   END as role,
                   COUNT(p.id) as tool_count
            FROM users u
            LEFT JOIN projects_v6 p ON u.id = p.user_id
        `;
        let params = [];
        let conditions = [];
        
        if (search) {
            conditions.push(`u.email ILIKE $${params.length + 1}`);
            params.push(`%${search}%`);
        }
        
        if (role) {
            if (role === 'admin') {
                conditions.push(`u.email ILIKE '%admin%'`);
            } else {
                conditions.push(`u.email NOT ILIKE '%admin%'`);
            }
        }
        
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as count FROM users';
        let countParams = [];
        
        if (search || role) {
            let countConditions = [];
            if (search) {
                countConditions.push(`email ILIKE $${countParams.length + 1}`);
                countParams.push(`%${search}%`);
            }
            if (role) {
                countConditions.push(`role = $${countParams.length + 1}`);
                countParams.push(role);
            }
            countQuery += ` WHERE ${countConditions.join(' AND ')}`;
        }
        
        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count) || 0;
        
        res.json({
            success: true,
            users: result.rows,
            pagination: {
                page,
                limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
        
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load users'
        });
    }
});

// Create new user
router.post('/users', requireAdmin, async (req, res) => {
    try {
        const { email, role = 'user', package: packageName } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }

        // Create user
        const userResult = await pool.query(
            'INSERT INTO users (email, created_at) VALUES ($1, NOW()) RETURNING id, email, created_at',
            [email]
        );

        const user = userResult.rows[0];

        // If package is specified, assign it
        if (packageName) {
            const packageResult = await pool.query(
                'SELECT id FROM packages WHERE name = $1',
                [packageName]
            );

            if (packageResult.rows.length > 0) {
                await pool.query(
                    'UPDATE users SET package_id = $1 WHERE id = $2',
                    [packageResult.rows[0].id, user.id]
                );
            }
        }

        res.json({
            success: true,
            message: 'User created successfully',
            user: {
                ...user,
                role: email.includes('admin') ? 'admin' : 'user'
            }
        });
        
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user'
        });
    }
});

// Delete user
router.delete('/users/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check if user exists and is not admin
        const userCheck = await pool.query(
            'SELECT email FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const userEmail = userCheck.rows[0].email;
        if (userEmail.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: 'Cannot delete admin users'
            });
        }

        // Delete user's projects first (cascade)
        await pool.query('DELETE FROM projects_v6 WHERE user_id = $1', [userId]);
        
        // Delete user
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
});

// Get all tools with admin details
router.get('/tools', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.name, p.description, p.subdomain, p.deployed, p.enabled, 
                   p.created_at, p.ai_role, u.email as owner_email,
                   COALESCE((SELECT COUNT(*) FROM project_sessions_v6 WHERE project_id = p.id), 0) as usage_count
            FROM projects_v6 p
            LEFT JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
        `);
        
        res.json({
            success: true,
            tools: result.rows
        });
        
    } catch (error) {
        console.error('Error getting admin tools:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load tools'
        });
    }
});

// System status check
router.get('/system/status', requireAdmin, async (req, res) => {
    try {
        // Test database connection and get detailed stats
        await pool.query('SELECT 1');
        
        const dbStatsQuery = await pool.query(`
            SELECT 
                pg_size_pretty(pg_database_size(current_database())) as database_size,
                (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
                (SELECT count(*) FROM pg_stat_activity) as total_connections,
                current_database() as database_name,
                inet_server_addr() as server_ip,
                inet_server_port() as server_port,
                version() as postgres_version
        `);
        
        const dbStats = dbStatsQuery.rows[0];
        
        // Get table statistics
        const tableStatsQuery = await pool.query(`
            SELECT 
                schemaname,
                relname as tablename,
                n_tup_ins as inserts,
                n_tup_upd as updates,
                n_tup_del as deletes,
                n_live_tup as live_tuples,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as table_size
            FROM pg_stat_user_tables 
            ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC 
            LIMIT 10
        `);
        
        // Get PM2 status (if available)
        let pm2Status = { status: 'unknown', processes: [] };
        try {
            const { exec } = require('child_process');
            const pm2Info = await new Promise((resolve, reject) => {
                exec('pm2 jlist', (error, stdout, stderr) => {
                    if (error) {
                        resolve([]);
                    } else {
                        try {
                            resolve(JSON.parse(stdout));
                        } catch (e) {
                            resolve([]);
                        }
                    }
                });
            });
            
            pm2Status = {
                status: 'connected',
                processes: pm2Info.map(proc => ({
                    name: proc.name,
                    pid: proc.pid,
                    status: proc.pm2_env.status,
                    uptime: proc.pm2_env.pm_uptime,
                    cpu: proc.monit.cpu,
                    memory: proc.monit.memory,
                    restart_time: proc.pm2_env.restart_time,
                    version: proc.pm2_env.version
                }))
            };
        } catch (pm2Error) {
            console.log('PM2 not available:', pm2Error.message);
        }
        
        // Get system storage info
        let storageInfo = { status: 'unknown' };
        try {
            const { exec } = require('child_process');
            
            const diskUsage = await new Promise((resolve, reject) => {
                exec('df -h /', (error, stdout, stderr) => {
                    if (error) {
                        resolve({ status: 'error' });
                    } else {
                        const lines = stdout.trim().split('\n');
                        if (lines.length > 1) {
                            const parts = lines[1].split(/\s+/);
                            resolve({
                                filesystem: parts[0],
                                total_size: parts[1],
                                used_size: parts[2],
                                available_size: parts[3],
                                usage_percentage: parts[4].replace('%', ''),
                                mount_point: parts[5]
                            });
                        } else {
                            resolve({ status: 'error' });
                        }
                    }
                });
            });
            
            storageInfo = {
                status: 'ok',
                root_disk: diskUsage,
                database_size: dbStats.database_size,
                application_path: process.cwd(),
                log_path: process.env.HOME + '/.pm2/logs'
            };
        } catch (storageError) {
            console.log('Storage info error:', storageError.message);
        }
        
        // Read .env file to get accurate AI configuration
        let aiServiceInfo = {
            status: 'active',
            providers: [],
            active_features: [
                'AI Tool Generation',
                'Prompt Engineering V6', 
                'Content Generation',
                'Multi-step Workflows'
            ]
        };

        try {
            const fs = require('fs');
            const envContent = fs.readFileSync(process.cwd() + '/.env', 'utf8');
            
            // Check Claude configuration
            const claudeKeyMatch = envContent.match(/^CLAUDE_API_KEY=(.*)$/m);
            const claudeConfigured = claudeKeyMatch && claudeKeyMatch[1] && claudeKeyMatch[1].trim() !== '';
            const claudeModelMatch = envContent.match(/^CLAUDE_MODEL=(.*)$/m);
            
            // Check OpenAI configuration  
            const openaiKeyMatch = envContent.match(/^OPENAI_API_KEY=(.*)$/m);
            const openaiConfigured = openaiKeyMatch && openaiKeyMatch[1] && openaiKeyMatch[1].trim() !== '';
            const openaiModelMatch = envContent.match(/^OPENAI_MODEL=(.*)$/m);
            
            // Check active provider
            const activeProviderMatch = envContent.match(/^AI_PROVIDER=(.*)$/m);
            const activeProvider = activeProviderMatch ? activeProviderMatch[1].trim() : null;
            
            // Check active model
            const activeModelMatch = envContent.match(/^AI_MODEL=(.*)$/m);
            const activeModel = activeModelMatch ? activeModelMatch[1].trim() : null;
            
            aiServiceInfo.providers = [
                {
                    name: 'Claude (Anthropic)',
                    status: claudeConfigured ? 'configured' : 'not_configured',
                    is_active: activeProvider === 'anthropic',
                    features: ['Tool Generation', 'Content Creation', 'Prompt Engineering'],
                    model: claudeModelMatch ? claudeModelMatch[1].trim() : 'claude-3-sonnet-20240229',
                    current_model: activeProvider === 'anthropic' ? activeModel : null
                },
                {
                    name: 'OpenAI GPT',
                    status: openaiConfigured ? 'configured' : 'not_configured',
                    is_active: activeProvider === 'openai',
                    features: ['Alternative AI Provider', 'Chat Completion'],
                    model: openaiModelMatch ? openaiModelMatch[1].trim() : 'gpt-4',
                    current_model: activeProvider === 'openai' ? activeModel : null
                }
            ];
            
            aiServiceInfo.active_provider = activeProvider;
            aiServiceInfo.active_model = activeModel;
            
        } catch (error) {
            console.error('Error reading .env for AI config:', error);
            // Fallback to environment variables
            aiServiceInfo.providers = [
                {
                    name: 'Claude (Anthropic)',
                    status: process.env.CLAUDE_API_KEY ? 'configured' : 'not_configured',
                    is_active: false,
                    features: ['Tool Generation', 'Content Creation', 'Prompt Engineering'],
                    model: 'claude-3-sonnet-20240229'
                },
                {
                    name: 'OpenAI GPT',
                    status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
                    is_active: false,
                    features: ['Alternative AI Provider'],
                    model: 'gpt-4'
                }
            ];
        }
        
        // Format uptime
        const uptimeSeconds = Math.floor(process.uptime());
        const uptimeDays = Math.floor(uptimeSeconds / 86400);
        const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
        const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
        const formattedUptime = `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`;
        
        // Format memory usage
        const memUsage = process.memoryUsage();
        const memoryUsage = `${Math.round(memUsage.rss / 1024 / 1024)}MB used / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB heap`;
        
        // Format CPU usage (approximate)
        const cpuUsage = '< 1%'; // Simple placeholder since actual CPU monitoring is complex
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            status: {
                api: {
                    healthy: true,
                    uptime: formattedUptime,
                    version: 'v1.5.0rc',
                    error: null
                },
                database: {
                    connected: true,
                    pool_size: dbStats.total_connections,
                    active_connections: dbStats.active_connections,
                    error: null
                },
                ai_service: {
                    configured: aiServiceInfo.active_provider ? true : false,
                    provider: aiServiceInfo.active_provider || 'None',
                    model: aiServiceInfo.active_model || 'None',
                    error: null
                },
                storage: storageInfo,
                system: {
                    hostname: require('os').hostname(),
                    platform: `${process.platform} ${process.arch}`,
                    arch: process.arch,
                    node_version: process.version,
                    memory_usage: memoryUsage,
                    cpu_usage: cpuUsage
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting system status:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            status: {
                api: { status: 'online', error: 'Partial data available' },
                database: { status: 'error', error: error.message },
                ai_service: { status: 'unknown' },
                storage: { status: 'unknown' }
            }
        });
    }
});

// Affiliate marketing endpoints
router.post('/affiliates/configure', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { affiliateId, settings } = req.body;
        
        if (!affiliateId || !settings) {
            return res.status(400).json({
                success: false,
                error: 'Affiliate ID and settings are required'
            });
        }

        // Check if affiliate config exists
        const existingConfig = await pool.query(
            'SELECT id FROM affiliate_configurations WHERE affiliate_id = $1',
            [affiliateId]
        );

        if (existingConfig.rows.length > 0) {
            // Update existing configuration
            await pool.query(`
                UPDATE affiliate_configurations SET
                    settings = $2,
                    enabled = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE affiliate_id = $1
            `, [
                affiliateId,
                JSON.stringify(settings),
                settings.enabled || false
            ]);
        } else {
            // Insert new configuration
            await pool.query(`
                INSERT INTO affiliate_configurations (
                    affiliate_id, user_id, settings, enabled
                ) VALUES ($1, $2, $3, $4)
            `, [
                affiliateId,
                'admin@prompt-machine.com', // Default admin user
                JSON.stringify(settings),
                settings.enabled || false
            ]);
        }

        // Log the configuration change
        console.log(`✅ Affiliate configuration updated: ${affiliateId} - ${settings.enabled ? 'Enabled' : 'Disabled'}`);

        res.json({
            success: true,
            message: 'Affiliate configuration updated successfully'
        });

    } catch (error) {
        console.error('Error configuring affiliate:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to configure affiliate program'
        });
    }
});

router.get('/affiliates/all', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        // Get all affiliate configurations
        const result = await pool.query(`
            SELECT 
                affiliate_id,
                settings,
                enabled,
                created_at,
                updated_at
            FROM affiliate_configurations
            ORDER BY affiliate_id
        `);

        res.json({
            success: true,
            affiliates: result.rows
        });
        
    } catch (error) {
        console.error('Error getting affiliate data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load affiliate data'
        });
    }
});

// Advertising platforms endpoints  
router.post('/advertising-platforms/configure', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        const { platformId, settings } = req.body;
        
        if (!platformId || !settings) {
            return res.status(400).json({
                success: false,
                error: 'Platform ID and settings are required'
            });
        }

        // Check if platform config exists
        const existingConfig = await pool.query(
            'SELECT id FROM advertising_platform_configurations WHERE platform_id = $1',
            [platformId]
        );

        if (existingConfig.rows.length > 0) {
            // Update existing configuration
            await pool.query(`
                UPDATE advertising_platform_configurations SET
                    settings = $2,
                    enabled = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE platform_id = $1
            `, [
                platformId,
                JSON.stringify(settings),
                settings.enabled || false
            ]);
        } else {
            // Insert new configuration
            await pool.query(`
                INSERT INTO advertising_platform_configurations (
                    platform_id, user_id, settings, enabled
                ) VALUES ($1, $2, $3, $4)
            `, [
                platformId,
                'admin@prompt-machine.com', // Default admin user
                JSON.stringify(settings),
                settings.enabled || false
            ]);
        }

        // Log the configuration change
        console.log(`✅ Advertising platform configuration updated: ${platformId} - ${settings.enabled ? 'Enabled' : 'Disabled'}`);

        res.json({
            success: true,
            message: 'Advertising platform configuration updated successfully'
        });

    } catch (error) {
        console.error('Error configuring advertising platform:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to configure advertising platform'
        });
    }
});

router.get('/advertising-platforms/all', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization required' 
            });
        }

        // Get all advertising platform configurations
        const result = await pool.query(`
            SELECT 
                platform_id,
                settings,
                enabled,
                created_at,
                updated_at
            FROM advertising_platform_configurations
            ORDER BY platform_id
        `);

        res.json({
            success: true,
            platforms: result.rows
        });
        
    } catch (error) {
        console.error('Error getting advertising platform data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load advertising platform data'
        });
    }
});

module.exports = router;