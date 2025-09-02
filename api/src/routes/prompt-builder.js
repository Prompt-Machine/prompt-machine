const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const claudeService = require('../services/claude');

const router = express.Router();

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// POST /api/prompt-builder/start - Start new conversation for a project
router.post('/start', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.body;

        if (!projectId) {
            return res.status(400).json({ 
                error: 'Project ID is required' 
            });
        }

        // Verify project exists and belongs to user
        const projectResult = await pool.query(
            'SELECT id, name FROM projects WHERE id = $1 AND user_id = $2',
            [projectId, req.user.id]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Project not found' 
            });
        }

        const project = projectResult.rows[0];

        // Check if conversation already exists for this project
        let conversationResult = await pool.query(
            'SELECT id, messages FROM conversations WHERE project_id = $1',
            [projectId]
        );

        let conversationId;
        let messages = [];

        if (conversationResult.rows.length === 0) {
            // Create new conversation with empty messages
            const newConversationResult = await pool.query(
                'INSERT INTO conversations (project_id, messages) VALUES ($1, $2) RETURNING id',
                [projectId, JSON.stringify([])]
            );
            conversationId = newConversationResult.rows[0].id;

            // Return empty conversation - let user start the conversation manually
            res.json({
                conversationId,
                messages: [],
                suggestedFields: []
            });

        } else {
            // Return existing conversation
            conversationId = conversationResult.rows[0].id;
            messages = conversationResult.rows[0].messages || [];

            // Also load existing fields from saved prompts
            let existingFields = [];
            try {
                const promptResult = await pool.query(
                    'SELECT fields FROM prompts WHERE project_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
                    [projectId]
                );
                
                if (promptResult.rows.length > 0 && promptResult.rows[0].fields) {
                    existingFields = JSON.parse(promptResult.rows[0].fields);
                }
            } catch (fieldError) {
                console.warn('Could not load existing fields:', fieldError.message);
            }

            res.json({
                conversationId,
                messages,
                suggestedFields: existingFields,
                reply: messages.length > 0 ? messages[messages.length - 1].content : 'Conversation started'
            });
        }

    } catch (error) {
        console.error('Start conversation error:', error);
        res.status(500).json({ 
            error: 'Failed to start conversation' 
        });
    }
});

// POST /api/prompt-builder/message - Send message in existing conversation
router.post('/message', authenticateToken, async (req, res) => {
    try {
        const { conversationId, message } = req.body;

        if (!conversationId || !message) {
            return res.status(400).json({ 
                error: 'Conversation ID and message are required' 
            });
        }

        // Get conversation and verify ownership through project
        const conversationResult = await pool.query(
            `SELECT c.id, c.messages, c.project_id, p.user_id 
             FROM conversations c
             JOIN projects p ON c.project_id = p.id
             WHERE c.id = $1 AND p.user_id = $2`,
            [conversationId, req.user.id]
        );

        if (conversationResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Conversation not found' 
            });
        }

        const conversation = conversationResult.rows[0];
        let messages = conversation.messages || [];

        // Add user message to conversation history
        messages.push({ role: 'user', content: message });

        try {
            // Get Claude's response
            const claudeResponse = await claudeService.chat(message, messages.slice(-10)); // Keep last 10 messages for context

            // Add Claude's response to conversation
            messages.push({ role: 'assistant', content: claudeResponse });

            // Update conversation in database
            await pool.query(
                'UPDATE conversations SET messages = $1 WHERE id = $2',
                [JSON.stringify(messages), conversationId]
            );

            res.json({
                conversationId,
                reply: claudeResponse,
                messages: messages,
                suggestedFields: claudeService.extractSuggestedFields(claudeResponse)
            });

        } catch (claudeError) {
            console.error('Claude API error:', claudeError.message);
            
            // Still save the user message even if Claude fails
            await pool.query(
                'UPDATE conversations SET messages = $1 WHERE id = $2',
                [JSON.stringify(messages), conversationId]
            );

            res.status(503).json({
                error: 'Claude AI is currently unavailable. Please try again later.',
                claudeError: claudeError.message,
                conversationId
            });
        }

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ 
            error: 'Failed to send message' 
        });
    }
});

// GET /api/prompt-builder/conversation/:projectId - Get conversation history
router.get('/conversation/:projectId', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.projectId;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        // Get conversation for project (verify user ownership)
        const result = await pool.query(
            `SELECT c.id, c.messages, c.created_at, p.name as project_name
             FROM conversations c
             JOIN projects p ON c.project_id = p.id
             WHERE c.project_id = $1 AND p.user_id = $2`,
            [projectId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.json({
                conversationId: null,
                messages: [],
                projectName: null,
                exists: false
            });
        }

        const conversation = result.rows[0];

        res.json({
            conversationId: conversation.id,
            messages: conversation.messages || [],
            projectName: conversation.project_name,
            createdAt: conversation.created_at,
            exists: true
        });

    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve conversation' 
        });
    }
});

// POST /api/prompt-builder/save - Save prompt configuration
router.post('/save', authenticateToken, async (req, res) => {
    try {
        const { projectId, systemPrompt, fields } = req.body;

        if (!projectId || !systemPrompt) {
            return res.status(400).json({ 
                error: 'Project ID and system prompt are required' 
            });
        }

        // Verify project ownership
        const projectResult = await pool.query(
            'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
            [projectId, req.user.id]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Project not found' 
            });
        }

        // Deactivate any existing prompts for this project
        await pool.query(
            'UPDATE prompts SET is_active = false WHERE project_id = $1',
            [projectId]
        );

        // Insert new prompt
        const result = await pool.query(
            `INSERT INTO prompts (project_id, system_prompt, fields, is_active) 
             VALUES ($1, $2, $3, true) 
             RETURNING id, system_prompt, fields, is_active, created_at`,
            [projectId, systemPrompt, JSON.stringify(fields || [])]
        );

        const newPrompt = result.rows[0];

        res.status(201).json({
            prompt: {
                id: newPrompt.id,
                project_id: projectId,
                system_prompt: newPrompt.system_prompt,
                fields: newPrompt.fields,
                is_active: newPrompt.is_active,
                created_at: newPrompt.created_at
            }
        });

    } catch (error) {
        console.error('Save prompt error:', error);
        res.status(500).json({ 
            error: 'Failed to save prompt' 
        });
    }
});

// GET /api/prompt-builder/health - Health check for Claude API
router.get('/health', authenticateToken, async (req, res) => {
    try {
        const isHealthy = await claudeService.healthCheck();
        
        res.json({
            claudeApi: isHealthy ? 'available' : 'unavailable',
            apiKey: process.env.CLAUDE_API_KEY ? 'configured' : 'missing',
            model: 'claude-3-sonnet-20240229',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Claude health check error:', error);
        res.status(503).json({
            claudeApi: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;