const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { verifyAuth } = require('../middleware/auth');
const toolGenerator = require('../services/toolGenerator');
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

// =====================================================
// CORE TOOL MANAGEMENT - Handles both wizard and editing
// =====================================================

// GET /api/v3/tools - Get all tools with wizard state
router.get('/tools', verifyAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, name, description, subdomain,
                wizard_step, wizard_complete,
                COALESCE(jsonb_array_length(fields), 0) as fields_count,
                deployed, deployment_url, enabled,
                created_at, updated_at
            FROM tools_v3 
            WHERE user_id = $1 
            ORDER BY created_at DESC
        `, [req.user.id]);

        res.json({
            success: true,
            tools: result.rows
        });

    } catch (error) {
        console.error('Get tools v3 error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch tools' 
        });
    }
});

// GET /api/v3/tools/:id - Get specific tool with full state
router.get('/tools/:id', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT * FROM tools_v3 
            WHERE id = $1 AND user_id = $2
        `, [id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }

        const tool = result.rows[0];
        
        // Parse JSON fields safely - handle both string and object types from JSONB
        tool.concept_conversation = (tool.concept_conversation && typeof tool.concept_conversation === 'string' && tool.concept_conversation.trim()) 
            ? JSON.parse(tool.concept_conversation) 
            : (tool.concept_conversation || []);
        tool.fields = (tool.fields && typeof tool.fields === 'string' && tool.fields.trim()) 
            ? JSON.parse(tool.fields) 
            : (tool.fields || []);
        tool.deployment_config = (tool.deployment_config && typeof tool.deployment_config === 'string' && tool.deployment_config.trim()) 
            ? JSON.parse(tool.deployment_config) 
            : (tool.deployment_config || {});

        res.json({
            success: true,
            tool
        });

    } catch (error) {
        console.error('Get tool v3 error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch tool' 
        });
    }
});

// POST /api/v3/tools - Create new tool (starts wizard at step 1)
router.post('/tools', verifyAuth, async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Tool name is required' 
            });
        }

        // Create tool in concept phase
        const result = await pool.query(`
            INSERT INTO tools_v3 (
                user_id, name, description, 
                wizard_step, wizard_complete
            )
            VALUES ($1, $2, $3, 1, false)
            RETURNING *
        `, [req.user.id, name.trim(), description || '']);

        const tool = result.rows[0];
        
        // Parse JSON fields for response
        tool.concept_conversation = [];
        tool.fields = [];
        tool.deployment_config = {};

        console.log(`✅ Created v3 tool: ${tool.name} (ID: ${tool.id})`);

        res.status(201).json({
            success: true,
            tool
        });

    } catch (error) {
        console.error('Create tool v3 error:', error);
        res.status(500).json({ 
            error: 'Failed to create tool' 
        });
    }
});

// =====================================================
// WIZARD STEP MANAGEMENT
// =====================================================

// PUT /api/v3/tools/:id/step/:step - Update wizard step data
router.put('/tools/:id/step/:step', verifyAuth, async (req, res) => {
    try {
        const { id, step } = req.params;
        const stepNum = parseInt(step);
        
        if (![1, 2, 3].includes(stepNum)) {
            return res.status(400).json({ 
                error: 'Invalid step. Must be 1, 2, or 3' 
            });
        }

        let updateQuery = '';
        let updateValues = [id, req.user.id];
        
        switch (stepNum) {
            case 1: // Concept step - update conversation and system prompt
                const { conversation, systemPrompt, name, description } = req.body;
                updateQuery = `
                    UPDATE tools_v3 
                    SET concept_conversation = $3, 
                        system_prompt = $4,
                        name = COALESCE($5, name),
                        description = COALESCE($6, description),
                        wizard_step = GREATEST(wizard_step, 1)
                    WHERE id = $1 AND user_id = $2
                    RETURNING *
                `;
                updateValues = [id, req.user.id, 
                    JSON.stringify(conversation || []), 
                    systemPrompt || null,
                    name || null,
                    description || null
                ];
                break;

            case 2: // Build step - update fields and subdomain
                const { fields, subdomain } = req.body;
                
                // Validate subdomain uniqueness if provided
                if (subdomain) {
                    const subdomainRegex = /^[a-zA-Z0-9-]+$/;
                    if (!subdomainRegex.test(subdomain)) {
                        return res.status(400).json({ 
                            error: 'Subdomain can only contain letters, numbers, and hyphens' 
                        });
                    }

                    const existingCheck = await pool.query(
                        'SELECT id FROM tools_v3 WHERE subdomain = $1 AND id != $2',
                        [subdomain.toLowerCase(), id]
                    );

                    if (existingCheck.rows.length > 0) {
                        return res.status(400).json({ 
                            error: 'Subdomain already exists. Please choose a different one.' 
                        });
                    }
                }

                updateQuery = `
                    UPDATE tools_v3 
                    SET fields = $3, 
                        subdomain = COALESCE($4, subdomain),
                        wizard_step = GREATEST(wizard_step, 2)
                    WHERE id = $1 AND user_id = $2
                    RETURNING *
                `;
                updateValues = [id, req.user.id, 
                    JSON.stringify(fields || []), 
                    subdomain ? subdomain.toLowerCase() : null
                ];
                break;

            case 3: // Deploy step - update deployment config
                const { deploymentConfig, complete } = req.body;
                updateQuery = `
                    UPDATE tools_v3 
                    SET deployment_config = $3,
                        wizard_step = GREATEST(wizard_step, 3),
                        wizard_complete = COALESCE($4, wizard_complete)
                    WHERE id = $1 AND user_id = $2
                    RETURNING *
                `;
                updateValues = [id, req.user.id, 
                    JSON.stringify(deploymentConfig || {}),
                    complete || false
                ];
                break;
        }

        const result = await pool.query(updateQuery, updateValues);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }

        const tool = result.rows[0];
        
        // Parse JSON fields safely - handle both string and object types from JSONB
        tool.concept_conversation = (tool.concept_conversation && typeof tool.concept_conversation === 'string' && tool.concept_conversation.trim()) 
            ? JSON.parse(tool.concept_conversation) 
            : (tool.concept_conversation || []);
        tool.fields = (tool.fields && typeof tool.fields === 'string' && tool.fields.trim()) 
            ? JSON.parse(tool.fields) 
            : (tool.fields || []);
        tool.deployment_config = (tool.deployment_config && typeof tool.deployment_config === 'string' && tool.deployment_config.trim()) 
            ? JSON.parse(tool.deployment_config) 
            : (tool.deployment_config || {});

        console.log(`✅ Updated v3 tool step ${stepNum}: ${tool.name}`);

        res.json({
            success: true,
            tool
        });

    } catch (error) {
        console.error(`Update step v3 error:`, error);
        res.status(500).json({ 
            error: 'Failed to update tool step' 
        });
    }
});

// =====================================================
// STEP 1: CONVERSATION WITH CLAUDE
// =====================================================

// POST /api/v3/tools/:id/chat - Chat with Claude for tool concept
router.post('/tools/:id/chat', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Message is required' 
            });
        }

        // Get current tool
        const toolResult = await pool.query(
            'SELECT * FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (toolResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }

        const tool = toolResult.rows[0];
        const conversation = (tool.concept_conversation && typeof tool.concept_conversation === 'string' && tool.concept_conversation.trim()) 
            ? JSON.parse(tool.concept_conversation) 
            : (tool.concept_conversation || []);

        console.log(`💬 V3 Chat for tool: ${tool.name}`);

        // Build context for Claude
        const systemPrompt = `You are a helpful AI assistant that helps users design AI tools.

Current tool: "${tool.name}"
Description: ${tool.description || 'Not set yet'}

You are helping the user refine their AI tool concept. This could be any type of tool - productivity apps, creative assistants, calculators, games, educational tools, health trackers, relationship counselors, alarm clocks, to-do lists, or anything else they envision.

Based on the conversation, you should:

1. Help clarify what the tool should do and how it should work
2. Suggest a clear, engaging tool name if needed  
3. Suggest input fields that would be useful for the tool's functionality
4. Generate a system prompt that defines the tool's behavior and personality

When suggesting fields, use this format and choose appropriate field types:
**Suggested Fields:**
- **Field Name** (text): Description or placeholder text
- **Multi-line Field** (textarea): For longer text inputs
- **Choice Field** (dropdown): Option1, Option2, Option3
- **Priority Field** (dropdown): Low, Medium, High
- **Date/Time Field** (text): For scheduling or timestamps
- **Category Field** (dropdown): Category1, Category2, Category3

Consider what inputs the tool needs to function effectively. For productivity tools, think about names, priorities, dates. For creative tools, think about topics, styles, lengths. For calculators, think about numbers and units. For games, think about difficulty levels and player names.

Keep responses conversational but helpful. Focus on understanding their vision and creating a tool that truly serves their needs.`;

        try {
            const userMessage = { role: 'user', content: message.trim() };
            const claudeResponse = await claudeService.chat(message, conversation);
            
            // Add messages to conversation
            conversation.push(userMessage);
            conversation.push({ role: 'assistant', content: claudeResponse });
            
            // Extract suggested fields and system prompt from response
            const suggestedFields = claudeService.extractSuggestedFields(claudeResponse);
            let extractedSystemPrompt = null;
            
            // Look for system prompt in Claude's response
            const systemPromptMatch = claudeResponse.match(/System prompt:?\s*["\`]([^"\`]+)["\`]/i);
            if (systemPromptMatch) {
                extractedSystemPrompt = systemPromptMatch[1].trim();
            }

            // Auto-update tool with suggested fields if we have them and it's the first interaction
            if (suggestedFields.length > 0 && conversation.length === 2) {
                console.log(`🔄 Auto-applying ${suggestedFields.length} suggested fields to tool`);
                
                // Update tool with suggested fields and move to step 2
                await pool.query(
                    `UPDATE tools_v3 SET 
                        fields = $1::jsonb,
                        system_prompt = $2,
                        wizard_step = 2,
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE id = $3 AND user_id = $4`,
                    [
                        JSON.stringify(suggestedFields),
                        extractedSystemPrompt || `You are ${tool.name}. ${claudeResponse.slice(0, 200)}...`,
                        id,
                        req.user.id
                    ]
                );
            }

            // Update tool with new conversation
            await pool.query(`
                UPDATE tools_v3 
                SET concept_conversation = $1,
                    system_prompt = COALESCE($2, system_prompt)
                WHERE id = $3
            `, [JSON.stringify(conversation), extractedSystemPrompt, id]);

            console.log(`✅ Claude V3 response with ${suggestedFields.length} fields`);

            res.json({
                success: true,
                response: claudeResponse,
                conversation: conversation,
                suggestedFields: suggestedFields,
                systemPrompt: extractedSystemPrompt
            });

        } catch (claudeError) {
            console.error('Claude API error:', claudeError.message);
            
            // Fallback response
            const fallbackResponse = `I understand you want to improve "${tool.name}". While I'm having trouble connecting to Claude right now, I can suggest some common field types that might work well for your tool. What specific functionality are you looking for?`;
            
            const userMessage = { role: 'user', content: message.trim() };
            const assistantMessage = { role: 'assistant', content: fallbackResponse };
            
            conversation.push(userMessage, assistantMessage);
            
            await pool.query(`
                UPDATE tools_v3 
                SET concept_conversation = $1
                WHERE id = $2
            `, [JSON.stringify(conversation), id]);
            
            res.json({
                success: true,
                response: fallbackResponse,
                conversation: conversation,
                suggestedFields: [],
                systemPrompt: null
            });
        }

    } catch (error) {
        console.error('Chat v3 error:', error);
        res.status(500).json({ 
            error: 'Failed to process chat message' 
        });
    }
});

// =====================================================
// STEP 3: DEPLOYMENT
// =====================================================

// POST /api/v3/tools/:id/deploy - Deploy the tool
router.post('/tools/:id/deploy', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Get tool with all data
        const toolResult = await pool.query(
            'SELECT * FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (toolResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }

        const tool = toolResult.rows[0];
        
        // Parse JSON fields safely - handle both string and object types from JSONB
        tool.concept_conversation = (tool.concept_conversation && typeof tool.concept_conversation === 'string' && tool.concept_conversation.trim()) 
            ? JSON.parse(tool.concept_conversation) 
            : (tool.concept_conversation || []);
        tool.fields = (tool.fields && typeof tool.fields === 'string' && tool.fields.trim()) 
            ? JSON.parse(tool.fields) 
            : (tool.fields || []);
        tool.deployment_config = (tool.deployment_config && typeof tool.deployment_config === 'string' && tool.deployment_config.trim()) 
            ? JSON.parse(tool.deployment_config) 
            : (tool.deployment_config || {});
        
        // Validate tool is ready for deployment
        if (!tool.subdomain) {
            return res.status(400).json({ 
                error: 'Tool must have a subdomain before deployment' 
            });
        }

        const fields = tool.fields;
        if (fields.length === 0) {
            return res.status(400).json({ 
                error: 'Tool must have at least one field before deployment' 
            });
        }

        // Generate tool content
        const toolContent = await toolGenerator.generateTool(
            {
                name: tool.name,
                description: tool.description,
                subdomain: tool.subdomain
            },
            {
                fields: fields,
                system_prompt: tool.system_prompt || `You are ${tool.name}, an AI assistant. Help users with their requests.`
            }
        );

        // Save tool files
        const toolPath = await toolGenerator.saveToolToFiles(tool.subdomain, toolContent);

        // Mark as deployed
        const deploymentUrl = `https://${tool.subdomain}.tool.prompt-machine.com`;
        
        await pool.query(`
            UPDATE tools_v3 
            SET deployed = true, 
                deployment_url = $1,
                last_deployed_at = NOW(),
                wizard_complete = true,
                wizard_step = 3
            WHERE id = $2
        `, [deploymentUrl, id]);

        console.log(`🚀 Deployed v3 tool: ${tool.name} to ${deploymentUrl}`);

        res.json({
            success: true,
            url: deploymentUrl,
            path: toolPath,
            message: 'Tool deployed successfully!'
        });

    } catch (error) {
        console.error('Deploy tool v3 error:', error);
        res.status(500).json({ 
            error: 'Failed to deploy tool' 
        });
    }
});

// GET /api/v3/tools/:id/status - Public endpoint to check tool status (no authentication required)
router.get('/tools/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get tool status without requiring authentication (public endpoint)
        const result = await pool.query(
            'SELECT name, subdomain, enabled, deployed FROM tools_v3 WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                enabled: false,
                message: 'Tool not found'
            });
        }
        
        const tool = result.rows[0];
        
        // Tool must be both deployed and enabled to be accessible
        const isAccessible = tool.deployed && tool.enabled;
        
        res.json({
            enabled: isAccessible,
            name: tool.name,
            message: !tool.deployed 
                ? 'Tool is not yet deployed' 
                : !tool.enabled 
                    ? 'Tool is temporarily disabled for maintenance'
                    : 'Tool is available'
        });
        
    } catch (error) {
        console.error('Tool status check error:', error);
        // On error, return disabled status for safety
        res.status(500).json({
            enabled: false,
            message: 'Unable to check tool status'
        });
    }
});

// PUT /api/v3/tools/:id/enable - Enable tool public access
router.put('/tools/:id/enable', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verify tool exists and belongs to user
        const toolCheck = await pool.query(
            'SELECT name, subdomain, deployed FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        
        if (toolCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }
        
        const tool = toolCheck.rows[0];
        
        // Check if tool is deployed (can't enable non-deployed tools)
        if (!tool.deployed) {
            return res.status(400).json({
                error: 'Cannot enable tool that has not been deployed',
                hint: 'Deploy the tool first, then enable public access'
            });
        }
        
        // Enable the tool
        const result = await pool.query(
            'UPDATE tools_v3 SET enabled = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING name, subdomain, enabled',
            [id, req.user.id]
        );
        
        const updatedTool = result.rows[0];
        console.log(`✅ Enabled public access for tool: ${updatedTool.name} (${updatedTool.subdomain})`);
        
        res.json({
            success: true,
            message: 'Tool enabled successfully',
            tool: {
                name: updatedTool.name,
                subdomain: updatedTool.subdomain,
                enabled: updatedTool.enabled,
                url: tool.deployed ? `https://${updatedTool.subdomain}.tool.prompt-machine.com` : null
            }
        });
        
    } catch (error) {
        console.error('Enable tool error:', error);
        res.status(500).json({ 
            error: 'Failed to enable tool' 
        });
    }
});

// PUT /api/v3/tools/:id/disable - Disable tool public access
router.put('/tools/:id/disable', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verify tool exists and belongs to user
        const toolCheck = await pool.query(
            'SELECT name, subdomain, deployed FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        
        if (toolCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }
        
        const tool = toolCheck.rows[0];
        
        // Disable the tool
        const result = await pool.query(
            'UPDATE tools_v3 SET enabled = false, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING name, subdomain, enabled',
            [id, req.user.id]
        );
        
        const updatedTool = result.rows[0];
        console.log(`🚫 Disabled public access for tool: ${updatedTool.name} (${updatedTool.subdomain})`);
        
        res.json({
            success: true,
            message: 'Tool disabled successfully',
            tool: {
                name: updatedTool.name,
                subdomain: updatedTool.subdomain,
                enabled: updatedTool.enabled,
                status: 'Tool is no longer publicly accessible'
            }
        });
        
    } catch (error) {
        console.error('Disable tool error:', error);
        res.status(500).json({ 
            error: 'Failed to disable tool' 
        });
    }
});

// PUT /api/v3/tools/:id/toggle - Toggle tool public access
router.put('/tools/:id/toggle', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get current tool status
        const toolCheck = await pool.query(
            'SELECT name, subdomain, deployed, enabled FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        
        if (toolCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }
        
        const tool = toolCheck.rows[0];
        
        // Check if tool is deployed (can't enable non-deployed tools)
        if (!tool.deployed && !tool.enabled) {
            return res.status(400).json({
                error: 'Cannot enable tool that has not been deployed',
                hint: 'Deploy the tool first, then enable public access'
            });
        }
        
        // Toggle the enabled status
        const newEnabledStatus = !tool.enabled;
        const result = await pool.query(
            'UPDATE tools_v3 SET enabled = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING name, subdomain, enabled',
            [newEnabledStatus, id, req.user.id]
        );
        
        const updatedTool = result.rows[0];
        const action = updatedTool.enabled ? 'enabled' : 'disabled';
        const emoji = updatedTool.enabled ? '✅' : '🚫';
        
        console.log(`${emoji} ${action.toUpperCase()} public access for tool: ${updatedTool.name} (${updatedTool.subdomain})`);
        
        res.json({
            success: true,
            message: `Tool ${action} successfully`,
            tool: {
                name: updatedTool.name,
                subdomain: updatedTool.subdomain,
                enabled: updatedTool.enabled,
                status: updatedTool.enabled ? 'Tool is publicly accessible' : 'Tool is no longer publicly accessible',
                url: updatedTool.enabled && tool.deployed ? `https://${updatedTool.subdomain}.tool.prompt-machine.com` : null
            }
        });
        
    } catch (error) {
        console.error('Toggle tool error:', error);
        res.status(500).json({ 
            error: 'Failed to toggle tool status' 
        });
    }
});

// DELETE /api/v3/tools/:id - Delete tool with comprehensive cleanup
router.delete('/tools/:id', verifyAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // First get tool details for cleanup
        const toolResult = await pool.query(
            'SELECT name, subdomain FROM tools_v3 WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        
        if (toolResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Tool not found' 
            });
        }
        
        const tool = toolResult.rows[0];
        const cleanupResults = {
            database: false,
            advertising: false,
            files: false,
            nginx: false,
            ssl: false
        };
        
        console.log(`🗑️ Starting comprehensive deletion for tool: ${tool.name} (${tool.subdomain})`);
        
        // 1. Delete from database (this will cascade to tool_advertising due to foreign key)
        try {
            await pool.query('BEGIN');
            
            // Delete main tool record (advertising data will be deleted via CASCADE)
            const deleteResult = await pool.query(
                'DELETE FROM tools_v3 WHERE id = $1 AND user_id = $2 RETURNING name, subdomain',
                [id, req.user.id]
            );
            
            if (deleteResult.rows.length > 0) {
                cleanupResults.database = true;
                cleanupResults.advertising = true; // Handled by CASCADE
            }
            
            await pool.query('COMMIT');
            console.log(`✅ Database cleanup complete`);
            
        } catch (dbError) {
            await pool.query('ROLLBACK');
            console.error(`❌ Database cleanup failed:`, dbError);
            throw new Error('Database deletion failed');
        }
        
        // 2. Remove deployed tool files
        if (tool.subdomain) {
            try {
                const toolDir = path.join('/home/ubuntu/prompt-machine/deployed-tools', tool.subdomain);
                
                // Check if directory exists before attempting deletion
                try {
                    await fs.access(toolDir);
                    await fs.rm(toolDir, { recursive: true, force: true });
                    cleanupResults.files = true;
                    console.log(`✅ Removed deployed tool directory: ${toolDir}`);
                } catch (accessError) {
                    // Directory doesn't exist, which is fine
                    cleanupResults.files = true;
                    console.log(`ℹ️ No deployed files to remove for subdomain: ${tool.subdomain}`);
                }
            } catch (fileError) {
                console.error(`❌ File cleanup failed for ${tool.subdomain}:`, fileError);
                // Don't fail the entire operation for file cleanup errors
            }
        } else {
            cleanupResults.files = true; // No subdomain means no files to clean
        }
        
        // 3. Remove Nginx configuration
        if (tool.subdomain) {
            try {
                const nginxAvailable = `/etc/nginx/sites-available/${tool.subdomain}.tool.prompt-machine.com`;
                const nginxEnabled = `/etc/nginx/sites-enabled/${tool.subdomain}.tool.prompt-machine.com`;
                
                // Remove from sites-available
                try {
                    await fs.unlink(nginxAvailable);
                    console.log(`✅ Removed Nginx config: ${nginxAvailable}`);
                } catch (e) {
                    console.log(`ℹ️ Nginx available config not found: ${nginxAvailable}`);
                }
                
                // Remove from sites-enabled  
                try {
                    await fs.unlink(nginxEnabled);
                    console.log(`✅ Removed Nginx enabled config: ${nginxEnabled}`);
                } catch (e) {
                    console.log(`ℹ️ Nginx enabled config not found: ${nginxEnabled}`);
                }
                
                cleanupResults.nginx = true;
            } catch (nginxError) {
                console.error(`❌ Nginx cleanup failed for ${tool.subdomain}:`, nginxError);
                // Don't fail the entire operation for nginx cleanup errors
            }
        } else {
            cleanupResults.nginx = true; // No subdomain means no nginx config
        }
        
        // 4. SSL Certificate cleanup (optional - certificates will expire automatically)
        if (tool.subdomain) {
            try {
                const sslDir = `/etc/letsencrypt/live/${tool.subdomain}.tool.prompt-machine.com`;
                
                try {
                    await fs.access(sslDir);
                    // Note: We don't delete SSL certs directly as they may be managed by certbot
                    // In production, you might want to run: certbot delete --cert-name subdomain.tool.prompt-machine.com
                    console.log(`ℹ️ SSL certificates exist at ${sslDir} - will expire automatically`);
                    cleanupResults.ssl = true;
                } catch (accessError) {
                    // SSL directory doesn't exist
                    cleanupResults.ssl = true;
                    console.log(`ℹ️ No SSL certificates found for subdomain: ${tool.subdomain}`);
                }
            } catch (sslError) {
                console.error(`❌ SSL cleanup check failed for ${tool.subdomain}:`, sslError);
                cleanupResults.ssl = true; // Don't fail for SSL issues
            }
        } else {
            cleanupResults.ssl = true; // No subdomain means no SSL to clean
        }
        
        // Calculate cleanup success rate
        const successfulCleanups = Object.values(cleanupResults).filter(result => result === true).length;
        const totalCleanups = Object.keys(cleanupResults).length;
        const cleanupRate = ((successfulCleanups / totalCleanups) * 100).toFixed(1);
        
        console.log(`🏁 Comprehensive deletion complete: ${successfulCleanups}/${totalCleanups} components (${cleanupRate}%)`);
        console.log('Cleanup Results:', cleanupResults);
        
        res.json({
            success: true,
            message: 'Tool deleted successfully',
            cleanup: {
                tool: tool.name,
                subdomain: tool.subdomain,
                results: cleanupResults,
                summary: `${successfulCleanups}/${totalCleanups} components cleaned (${cleanupRate}%)`
            }
        });

    } catch (error) {
        console.error('Delete tool v3 error:', error);
        res.status(500).json({ 
            error: 'Failed to delete tool' 
        });
    }
});

module.exports = router;