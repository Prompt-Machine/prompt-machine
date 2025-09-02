const express = require('express');
const { Pool } = require('pg');
const fieldRecommendations = require('../services/fieldRecommendations');
const claude = require('../services/claude');

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
 * POST /api/v5/prompt-engineer/session
 * Start a new v5 prompt engineering session
 */

router.post('/session', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID is required' 
            });
        }
        
        const query = `
            INSERT INTO prompt_engineering_sessions_v5 
            (user_id, session_stage)
            VALUES ($1, 'expert_selection')
            RETURNING *
        `;
        
        const result = await pool.query(query, [userId]);
        const session = result.rows[0];
        
        // Log session start
        await pool.query(`
            INSERT INTO prompt_engineering_conversations_v5 
            (session_id, user_message, ai_response, stage)
            VALUES ($1, '', '{"message": "Session started - expert selection stage"}', 'expert_selection')
        `, [session.id]);
        
        res.json({
            success: true,
            sessionId: session.id,
            stage: 'expert_selection',
            session: session
        });
        
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create session' 
        });
    }
});

/**
 * GET /api/v5/prompt-engineer/expert-types
 * Get available expert types for selection
 */
router.get('/expert-types', async (req, res) => {
    try {
        const expertTypes = await fieldRecommendations.getAllExpertTypes();
        
        // Also include some common types that might not have templates yet
        const commonTypes = [
            'story_writer',
            'business_consultant',
            'content_creator',
            'marketing_expert',
            'fitness_coach',
            'recipe_creator',
            'travel_planner',
            'study_tutor'
        ];
        
        const availableTypes = [...new Set([
            ...expertTypes.map(et => et.expert_type),
            ...commonTypes
        ])];
        
        res.json({
            success: true,
            expertTypes: availableTypes,
            templates: expertTypes
        });
        
    } catch (error) {
        console.error('Error getting expert types:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get expert types' 
        });
    }
});

/**
 * POST /api/v5/prompt-engineer/select-expert
 * Select expert type and get field recommendations
 */
router.post('/select-expert', async (req, res) => {
    try {
        const { sessionId, expertType } = req.body;
        
        if (!sessionId || !expertType) {
            return res.status(400).json({ 
                success: false, 
                error: 'Session ID and expert type are required' 
            });
        }
        
        // Update session with selected expert
        await pool.query(`
            UPDATE prompt_engineering_sessions_v5 
            SET ai_persona = $1, session_stage = 'field_selection', updated_at = NOW()
            WHERE id = $2
        `, [expertType, sessionId]);
        
        // Get field recommendations for the expert type
        const recommendations = await fieldRecommendations.getRecommendationsForExpert(expertType);
        
        // Log the expert selection
        await pool.query(`
            INSERT INTO prompt_engineering_conversations_v5 
            (session_id, user_message, ai_response, stage)
            VALUES ($1, $2, '{"message": "Field recommendations provided"}', 'field_selection')
        `, [sessionId, `Selected expert type: ${expertType}`]);
        
        res.json({
            success: true,
            stage: 'field_selection',
            expertType: expertType,
            recommendations: recommendations
        });
        
    } catch (error) {
        console.error('Error selecting expert:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to select expert type' 
        });
    }
});

/**
 * POST /api/v5/prompt-engineer/select-fields
 * Select fields from recommendations and proceed to tool configuration
 */
router.post('/select-fields', async (req, res) => {
    try {
        const { sessionId, selectedFields, toolName, toolDescription } = req.body;
        
        if (!sessionId || !selectedFields || !Array.isArray(selectedFields)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Session ID and selected fields array are required' 
            });
        }
        
        // Get current session data
        const sessionQuery = await pool.query(`
            SELECT * FROM prompt_engineering_sessions_v5 WHERE id = $1
        `, [sessionId]);
        
        if (sessionQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Session not found' 
            });
        }
        
        const session = sessionQuery.rows[0];
        
        // Get the system prompt template for the expert type
        const recommendations = await fieldRecommendations.getRecommendationsForExpert(session.ai_persona);
        
        // Process selected fields
        const processedFields = fieldRecommendations.processSelectedFields(
            selectedFields, 
            recommendations.systemPromptTemplate
        );
        
        // Update session with selected fields
        await pool.query(`
            UPDATE prompt_engineering_sessions_v5 
            SET 
                selected_fields = $1,
                session_stage = 'tool_configuration',
                tool_name = $2,
                tool_description = $3,
                system_prompt = $4,
                updated_at = NOW()
            WHERE id = $5
        `, [
            JSON.stringify(processedFields.fields),
            toolName || `${session.expert_type} Tool`,
            toolDescription || `AI-powered ${session.expert_type} assistant`,
            processedFields.systemPrompt,
            sessionId
        ]);
        
        // Log field selection
        await pool.query(`
            INSERT INTO prompt_engineering_conversations_v5 
            (session_id, user_message, ai_response, stage)
            VALUES ($1, $2, '{"message": "Fields selected for tool creation"}', 'tool_configuration')
        `, [sessionId, `Selected ${selectedFields.length} fields for tool creation`]);
        
        res.json({
            success: true,
            stage: 'tool_configuration',
            processedFields: processedFields,
            toolPreview: {
                name: toolName || `${session.ai_persona} Tool`,
                description: toolDescription || `AI-powered ${session.ai_persona} assistant`,
                expertType: session.ai_persona,
                fieldCount: selectedFields.length
            }
        });
        
    } catch (error) {
        console.error('Error selecting fields:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process field selection' 
        });
    }
});

/**
 * POST /api/v5/prompt-engineer/create-tool
 * Create and deploy the final tool
 */
router.post('/create-tool', async (req, res) => {
    try {
        const { sessionId, pageContent } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Session ID is required' 
            });
        }
        
        // Get session data
        const sessionQuery = await pool.query(`
            SELECT * FROM prompt_engineering_sessions_v5 WHERE id = $1
        `, [sessionId]);
        
        if (sessionQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Session not found' 
            });
        }
        
        const session = sessionQuery.rows[0];
        const selectedFields = session.selected_fields || [];
        const toolName = session.tool_name;
        const toolDescription = session.tool_description;
        const systemPrompt = session.system_prompt;
        
        // Generate unique subdomain
        const subdomain = `${session.ai_persona}-${Date.now()}`.toLowerCase().replace(/_/g, '-');
        
        // Create the tool in tools_v5
        const toolQuery = `
            INSERT INTO tools_v5 
            (user_id, session_id, name, description, subdomain, fields, system_prompt, deployed, enabled)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
            RETURNING *
        `;
        
        const toolResult = await pool.query(toolQuery, [
            session.user_id,
            sessionId,
            toolName,
            toolDescription,
            subdomain,
            JSON.stringify(selectedFields),
            systemPrompt
        ]);
        
        const tool = toolResult.rows[0];
        
        // Create individual field records
        if (selectedFields && selectedFields.length > 0) {
            for (const field of selectedFields) {
                await pool.query(`
                    INSERT INTO tool_fields_v5 
                    (tool_id, field_name, field_type, field_label, placeholder, options, is_required, field_order, description)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    tool.id,
                    field.field_name,
                    field.field_type,
                    field.field_label,
                    field.placeholder || null,
                    field.options ? JSON.stringify(field.options) : null,
                    field.is_required || false,
                    field.field_order,
                    field.description || null
                ]);
            }
        }
        
        // Update session to completed
        await pool.query(`
            UPDATE prompt_engineering_sessions_v5 
            SET session_stage = 'completed', updated_at = NOW()
            WHERE id = $1
        `, [sessionId]);
        
        // Log tool creation
        await pool.query(`
            INSERT INTO prompt_engineering_conversations_v5 
            (session_id, user_message, ai_response, stage)
            VALUES ($1, 'Deploy tool', $2, 'completed')
        `, [sessionId, JSON.stringify({message: `Tool created successfully: ${tool.name} (${subdomain})`})]);
        
        res.json({
            success: true,
            stage: 'completed',
            tool: tool,
            deploymentUrl: `https://${subdomain}.tool.prompt-machine.com`,
            fieldCount: selectedFields ? selectedFields.length : 0
        });
        
    } catch (error) {
        console.error('Error creating tool:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create tool' 
        });
    }
});

/**
 * GET /api/v5/prompt-engineer/session/:sessionId
 * Get session details and current state
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const sessionQuery = await pool.query(`
            SELECT * FROM prompt_engineering_sessions_v5 WHERE id = $1
        `, [sessionId]);
        
        if (sessionQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Session not found' 
            });
        }
        
        const session = sessionQuery.rows[0];
        
        // Get conversation history
        const conversationQuery = await pool.query(`
            SELECT * FROM prompt_engineering_conversations_v5 
            WHERE session_id = $1 
            ORDER BY created_at ASC
        `, [sessionId]);
        
        res.json({
            success: true,
            session: session,
            conversations: conversationQuery.rows
        });
        
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get session details' 
        });
    }
});








/**
 * GET /api/v5/tools
 * Get all v5 tools for admin dashboard
 */
router.get('/tools', async (req, res) => {
    try {
        const query = `
            SELECT 
                t.*,
                COUNT(tf.id) as field_count
            FROM tools_v5 t
            LEFT JOIN tool_fields_v5 tf ON t.id = tf.tool_id
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `;
        
        const result = await pool.query(query);
        
        res.json({
            success: true,
            tools: result.rows
        });
        
    } catch (error) {
        console.error('Error loading v5 tools:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load tools' 
        });
    }
});

/**
 * DELETE /api/v5/tools/:toolId
 * Delete a v5 tool
 */
router.delete('/tools/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        
        // Delete tool fields first (foreign key constraint)
        await pool.query('DELETE FROM tool_fields_v5 WHERE tool_id = $1', [toolId]);
        
        // Delete tool responses
        await pool.query('DELETE FROM tool_responses_v5 WHERE tool_id = $1', [toolId]);
        
        // Delete the tool
        const result = await pool.query('DELETE FROM tools_v5 WHERE id = $1 RETURNING *', [toolId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Tool not found' 
            });
        }
        
        res.json({
            success: true,
            message: 'Tool deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting v5 tool:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete tool' 
        });
    }
});

/**
 * GET /api/v5/tools/:toolId
 * Get specific v5 tool details
 */
router.get('/tools/:toolId', async (req, res) => {
    try {
        const { toolId } = req.params;
        
        const toolQuery = await pool.query(`
            SELECT * FROM tools_v5 WHERE id = $1
        `, [toolId]);
        
        if (toolQuery.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Tool not found' 
            });
        }
        
        const tool = toolQuery.rows[0];
        
        // Get tool fields
        const fieldsQuery = await pool.query(`
            SELECT * FROM tool_fields_v5 WHERE tool_id = $1 ORDER BY field_order ASC
        `, [toolId]);
        
        tool.fields = fieldsQuery.rows;
        
        res.json({
            success: true,
            tool: tool
        });
        
    } catch (error) {
        console.error('Error getting v5 tool:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get tool details' 
        });
    }
});

module.exports = router;