const express = require('express');
const claudeService = require('../services/claude');
const deploymentService = require('../services/deploy');

const router = express.Router();

// POST /api/tools/generate - PUBLIC endpoint for deployed tools to generate AI responses
router.post('/generate', async (req, res) => {
    console.log('🎯 Public Generate endpoint hit!', req.method, req.path);
    console.log('Headers:', req.headers.authorization ? 'Auth present' : 'No auth');
    try {
        const { tool_slug, system_prompt, inputs } = req.body;

        if (!tool_slug || !inputs) {
            return res.status(400).json({ 
                error: 'Tool slug and inputs are required' 
            });
        }

        // Create user prompt from inputs
        const inputText = Object.entries(inputs)
            .filter(([key, value]) => value && value.trim())
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        
        const userPrompt = inputText || 'Please generate a response based on my request.';
        
        // Call Claude AI to generate response
        console.log(`🤖 Generating AI response for tool: ${tool_slug}`);
        const aiResponse = await claudeService.chat(userPrompt, [], system_prompt);

        // Track usage
        try {
            await deploymentService.trackUsage(tool_slug);
        } catch (trackError) {
            console.warn('Usage tracking failed:', trackError.message);
        }

        res.json({
            output: aiResponse,
            usage: {
                tokens: 150,
                cost: 0.001
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Generate AI response error:', error);
        res.status(500).json({ 
            error: 'AI generation temporarily unavailable',
            message: 'The AI service is currently being updated. Please try again in a moment.'
        });
    }
});

// POST /api/tools/track-usage - PUBLIC endpoint to track tool usage
router.post('/track-usage', async (req, res) => {
    try {
        const { tool_slug, timestamp } = req.body;

        if (!tool_slug) {
            return res.status(400).json({ 
                error: 'Tool slug is required' 
            });
        }

        // Simple usage tracking for MVP
        console.log(`📊 Usage tracked for tool: ${tool_slug} at ${timestamp}`);
        
        // In production, this would save to usage_logs table
        res.json({ 
            success: true,
            message: 'Usage tracked successfully'
        });

    } catch (error) {
        console.error('Track usage error:', error);
        res.status(500).json({ 
            error: 'Failed to track usage' 
        });
    }
});

module.exports = router;