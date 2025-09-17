const express = require('express');
const { Pool } = require('pg');
const claudeService = require('../services/claude');
const deploymentService = require('../services/deploy');

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

// GET /api/tools/directory - PUBLIC endpoint for tools directory
router.get('/directory', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id,
                p.name,
                p.description,
                p.subdomain,
                p.deployed,
                p.enabled,
                p.created_at,
                p.ai_role as category,
                -- Check if premium features are required
                CASE 
                    WHEN p.ai_persona_description IS NOT NULL 
                         OR LENGTH(p.system_prompt) > 500 
                         OR (SELECT COUNT(*) FROM project_fields_v6 pf 
                             JOIN project_steps_v6 ps ON pf.step_id = ps.id 
                             WHERE ps.project_id = p.id) > 5 
                    THEN true 
                    ELSE false 
                END as is_premium,
                -- Mock usage stats for now
                FLOOR(RANDOM() * 100) as view_count,
                FLOOR(RANDOM() * 50) as usage_count
            FROM projects_v6 p
            WHERE p.deployed = true 
                AND p.enabled = true 
                AND p.subdomain IS NOT NULL
            ORDER BY p.created_at DESC
        `;
        
        const result = await pool.query(query);
        
        // Process tools to add category mapping
        const tools = result.rows.map(tool => ({
            ...tool,
            category: mapAiRoleToCategory(tool.category),
            description: tool.description || 'AI-powered tool built with Prompt Machine'
        }));
        
        res.json({
            success: true,
            tools: tools,
            total: tools.length
        });

    } catch (error) {
        console.error('Tools directory error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load tools directory',
            tools: []
        });
    }
});

// Helper function to map AI roles to categories
function mapAiRoleToCategory(aiRole) {
    if (!aiRole) return 'general';
    
    const role = aiRole.toLowerCase();
    
    if (role.includes('business') || role.includes('consultant') || role.includes('sales')) {
        return 'business';
    } else if (role.includes('creative') || role.includes('writer') || role.includes('designer')) {
        return 'creative';
    } else if (role.includes('productivity') || role.includes('assistant') || role.includes('organizer')) {
        return 'productivity';
    } else if (role.includes('education') || role.includes('teacher') || role.includes('tutor')) {
        return 'education';
    } else if (role.includes('entertainment') || role.includes('game') || role.includes('fun')) {
        return 'entertainment';
    } else if (role.includes('health') || role.includes('fitness') || role.includes('wellness')) {
        return 'health';
    } else if (role.includes('marketing') || role.includes('advertis')) {
        return 'marketing';
    } else {
        return 'general';
    }
}

module.exports = router;