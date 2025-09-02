const express = require('express');
const router = express.Router();
const aiConfig = require('../services/aiConfig');
const { authenticateToken } = require('../middleware/auth');

// All AI config routes require authentication
router.use(authenticateToken);

/**
 * GET /api/ai-config
 * Get current AI configuration
 */
router.get('/', async (req, res) => {
    try {
        console.log('📋 Getting current AI configuration for user:', req.user.id);
        
        const config = await aiConfig.getCurrentConfig(req.user.id);
        res.json(config);
        
    } catch (error) {
        console.error('Get AI config error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get AI configuration'
        });
    }
});

/**
 * GET /api/ai-config/providers
 * Get list of supported providers
 */
router.get('/providers', async (req, res) => {
    try {
        const providers = aiConfig.getSupportedProviders();
        res.json({
            success: true,
            providers
        });
        
    } catch (error) {
        console.error('Get providers error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get providers'
        });
    }
});

/**
 * POST /api/ai-config/test-key
 * Test an API key for a specific provider
 */
router.post('/test-key', async (req, res) => {
    try {
        const { providerId, apiKey } = req.body;

        if (!providerId || !apiKey) {
            return res.status(400).json({
                success: false,
                error: 'Provider ID and API key are required'
            });
        }

        console.log(`🧪 Testing API key for provider: ${providerId}`);
        
        const result = await aiConfig.testApiKey(providerId, apiKey);
        res.json(result);
        
    } catch (error) {
        console.error('Test API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test API key'
        });
    }
});

/**
 * POST /api/ai-config/update-key
 * Update API key for a provider and restart API server
 */
router.post('/update-key', async (req, res) => {
    try {
        const { providerId, apiKey, selectedModel } = req.body;

        if (!providerId || !apiKey) {
            return res.status(400).json({
                success: false,
                error: 'Provider ID and API key are required'
            });
        }

        console.log(`🔑 Updating API key for provider: ${providerId} for user: ${req.user.id} and restarting server...`);
        
        const result = await aiConfig.updateApiKeyAndRestart(providerId, apiKey, selectedModel, req.user.id);
        res.json(result);
        
    } catch (error) {
        console.error('Update API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update API key'
        });
    }
});

/**
 * POST /api/ai-config/set-active
 * Set active AI provider and model and restart API server
 */
router.post('/set-active', async (req, res) => {
    try {
        const { providerId, model } = req.body;

        if (!providerId || !model) {
            return res.status(400).json({
                success: false,
                error: 'Provider ID and model are required'
            });
        }

        console.log(`🎯 Setting active provider: ${providerId} with model: ${model} and restarting server...`);
        
        const result = await aiConfig.setActiveProviderAndRestart(providerId, model);
        res.json(result);
        
    } catch (error) {
        console.error('Set active provider error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set active provider'
        });
    }
});

/**
 * DELETE /api/ai-config/remove-key/:providerId
 * Remove API key for a provider
 */
router.delete('/remove-key/:providerId', async (req, res) => {
    try {
        const { providerId } = req.params;

        console.log(`🗑️ Removing API key for provider: ${providerId}`);
        
        const result = await aiConfig.removeApiKey(providerId);
        res.json(result);
        
    } catch (error) {
        console.error('Remove API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove API key'
        });
    }
});

module.exports = router;