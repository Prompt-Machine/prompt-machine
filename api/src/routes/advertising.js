const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');

// Database configuration
const pool = new Pool({
    user: 'promptmachine_userbeta',
    host: 'sql.prompt-machine.com',
    database: 'promptmachine_dbbeta',
    password: '94oE1q7K',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

const router = express.Router();

// GET /api/advertising/tool/:toolId - Get advertising settings for a tool
router.get('/tool/:toolId', authenticateToken, async (req, res) => {
    try {
        const { toolId } = req.params;
        
        // Verify tool ownership
        const toolResult = await pool.query(
            'SELECT id FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [toolId, req.user.id]
        );
        
        if (toolResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tool not found or access denied' });
        }
        
        // Get advertising settings
        const adResult = await pool.query(
            'SELECT * FROM tool_advertising WHERE tool_id = $1',
            [toolId]
        );
        
        if (adResult.rows.length === 0) {
            // Return default settings if none exist
            return res.json({
                tool_id: toolId,
                provider: 'none',
                google_ads_client_id: '',
                google_ads_slot_id: '',
                custom_header_code: '',
                custom_body_code: '',
                show_header_ad: false,
                show_footer_ad: false,
                show_sidebar_ad: false,
                enabled: false,
                clicks_tracked: 0,
                impressions_tracked: 0
            });
        }
        
        const settings = adResult.rows[0];
        
        // Don't expose sensitive internal fields
        delete settings.revenue_share_enabled;
        delete settings.platform_revenue_percentage;
        delete settings.user_id;
        
        res.json(settings);
        
    } catch (error) {
        console.error('Error fetching advertising settings:', error);
        res.status(500).json({ error: 'Failed to fetch advertising settings' });
    }
});

// POST /api/advertising/tool/:toolId - Create or update advertising settings
router.post('/tool/:toolId', authenticateToken, async (req, res) => {
    try {
        const { toolId } = req.params;
        const {
            provider,
            google_ads_client_id,
            google_ads_slot_id,
            custom_header_code,
            custom_body_code,
            show_header_ad,
            show_footer_ad,
            show_sidebar_ad,
            enabled
        } = req.body;
        
        // Verify tool ownership
        const toolResult = await pool.query(
            'SELECT id, name FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [toolId, req.user.id]
        );
        
        if (toolResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tool not found or access denied' });
        }
        
        // Validate provider
        const validProviders = ['none', 'google-ads', 'custom'];
        if (!validProviders.includes(provider)) {
            return res.status(400).json({ error: 'Invalid advertising provider' });
        }
        
        // Validate Google Ads settings if provider is google-ads
        if (provider === 'google-ads') {
            if (!google_ads_client_id || !google_ads_client_id.startsWith('ca-pub-')) {
                return res.status(400).json({ 
                    error: 'Valid Google Ads Client ID (ca-pub-xxxxxxxxxxxxxxx) is required' 
                });
            }
            if (!google_ads_slot_id) {
                return res.status(400).json({ error: 'Google Ads Slot ID is required' });
            }
        }
        
        // Sanitize custom code (basic safety check)
        const sanitizeCode = (code) => {
            if (!code) return '';
            // Remove potentially dangerous script injections
            return code.replace(/<script[^>]*src=[^>]*>/gi, '<!-- Blocked external script -->')
                      .replace(/javascript:/gi, '/* blocked javascript: */')
                      .substring(0, 10000); // Limit length
        };
        
        const sanitizedHeaderCode = sanitizeCode(custom_header_code);
        const sanitizedBodyCode = sanitizeCode(custom_body_code);
        
        // Check if settings already exist
        const existingResult = await pool.query(
            'SELECT id FROM tool_advertising WHERE tool_id = $1',
            [toolId]
        );
        
        let result;
        
        if (existingResult.rows.length > 0) {
            // Update existing settings
            result = await pool.query(`
                UPDATE tool_advertising 
                SET provider = $2,
                    google_ads_client_id = $3,
                    google_ads_slot_id = $4,
                    custom_header_code = $5,
                    custom_body_code = $6,
                    show_header_ad = $7,
                    show_footer_ad = $8,
                    show_sidebar_ad = $9,
                    enabled = $10,
                    updated_at = CURRENT_TIMESTAMP
                WHERE tool_id = $1
                RETURNING *
            `, [
                toolId, provider, google_ads_client_id, google_ads_slot_id,
                sanitizedHeaderCode, sanitizedBodyCode,
                show_header_ad, show_footer_ad, show_sidebar_ad, enabled
            ]);
        } else {
            // Create new settings
            result = await pool.query(`
                INSERT INTO tool_advertising (
                    tool_id, user_id, provider,
                    google_ads_client_id, google_ads_slot_id,
                    custom_header_code, custom_body_code,
                    show_header_ad, show_footer_ad, show_sidebar_ad,
                    enabled
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `, [
                toolId, req.user.id, provider,
                google_ads_client_id, google_ads_slot_id,
                sanitizedHeaderCode, sanitizedBodyCode,
                show_header_ad, show_footer_ad, show_sidebar_ad, enabled
            ]);
        }
        
        const settings = result.rows[0];
        
        // Don't expose sensitive fields
        delete settings.revenue_share_enabled;
        delete settings.platform_revenue_percentage;
        delete settings.user_id;
        
        console.log(`✅ Updated advertising settings for tool: ${toolResult.rows[0].name}`);
        
        res.json({
            success: true,
            message: 'Advertising settings updated successfully',
            settings: settings
        });
        
    } catch (error) {
        console.error('Error updating advertising settings:', error);
        res.status(500).json({ error: 'Failed to update advertising settings' });
    }
});

// DELETE /api/advertising/tool/:toolId - Remove advertising from a tool
router.delete('/tool/:toolId', authenticateToken, async (req, res) => {
    try {
        const { toolId } = req.params;
        
        // Verify tool ownership
        const toolResult = await pool.query(
            'SELECT id, name FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [toolId, req.user.id]
        );
        
        if (toolResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tool not found or access denied' });
        }
        
        // Delete advertising settings
        await pool.query(
            'DELETE FROM tool_advertising WHERE tool_id = $1',
            [toolId]
        );
        
        console.log(`✅ Removed advertising from tool: ${toolResult.rows[0].name}`);
        
        res.json({
            success: true,
            message: 'Advertising settings removed successfully'
        });
        
    } catch (error) {
        console.error('Error removing advertising settings:', error);
        res.status(500).json({ error: 'Failed to remove advertising settings' });
    }
});

// GET /api/advertising/stats/:toolId - Get advertising stats for a tool
router.get('/stats/:toolId', authenticateToken, async (req, res) => {
    try {
        const { toolId } = req.params;
        
        // Verify tool ownership
        const toolResult = await pool.query(
            'SELECT id, name FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [toolId, req.user.id]
        );
        
        if (toolResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tool not found or access denied' });
        }
        
        // Get advertising stats
        const statsResult = await pool.query(
            'SELECT clicks_tracked, impressions_tracked, created_at FROM tool_advertising WHERE tool_id = $1',
            [toolId]
        );
        
        if (statsResult.rows.length === 0) {
            return res.json({
                tool_name: toolResult.rows[0].name,
                clicks_tracked: 0,
                impressions_tracked: 0,
                advertising_active: false
            });
        }
        
        const stats = statsResult.rows[0];
        
        res.json({
            tool_name: toolResult.rows[0].name,
            clicks_tracked: stats.clicks_tracked,
            impressions_tracked: stats.impressions_tracked,
            advertising_active: true,
            advertising_since: stats.created_at
        });
        
    } catch (error) {
        console.error('Error fetching advertising stats:', error);
        res.status(500).json({ error: 'Failed to fetch advertising stats' });
    }
});

module.exports = router;