const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const toolGenerator = require('../services/toolGenerator');
const claudeService = require('../services/claude');

const router = express.Router();

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

// =====================================================
// PROMPT ENGINEER V4 - AI-GUIDED TOOL CREATION
// =====================================================

// GET /api/v4/start - Initialize new prompt engineering session
router.get('/start', authenticateToken, async (req, res) => {
    try {
        console.log('🚀 Starting Prompt Engineer v4 session for user:', req.user.id);
        
        // Create new session
        const sessionResult = await pool.query(
            'INSERT INTO prompt_engineering_sessions_v4 (user_id, session_stage, created_at) VALUES ($1, $2, NOW()) RETURNING id',
            [req.user.id, 'expert_selection']
        );
        
        const sessionId = sessionResult.rows[0].id;
        
        // Return greeting message
        const aiGreeting = {
            message: `🎉 **Welcome to Prompt Engineer v4!** 
            
I'm your AI assistant for creating custom tools. Together we'll:

1. **Choose your expert type** - I'll become the specialist you need
2. **Define your tool's purpose** - What should it help users accomplish?  
3. **Design the perfect input fields** - I'll suggest the best form fields
4. **Customize and refine** - We'll polish it until it's exactly right
5. **Deploy instantly** - Your tool will be live on a custom subdomain

**Let's start! What kind of expert should I become today?**`,
            session_id: sessionId,
            stage: 'expert_selection',
            options: [
                'Story Writer & Creative Fiction Expert',
                'Business & Marketing Consultant', 
                'Health & Wellness Coach',
                'Educational Content Creator',
                'Technical Writing Specialist',
                'Custom Expert (I\'ll describe my own)'
            ]
        };

        res.json({
            success: true,
            session_id: sessionId,
            ai_response: aiGreeting,
            current_stage: 'expert_selection'
        });

    } catch (error) {
        console.error('Error starting Prompt Engineer v4 session:', error);
        res.status(500).json({ error: 'Failed to start session' });
    }
});

// POST /api/v4/chat - Handle conversation with AI assistant
router.post('/chat', authenticateToken, async (req, res) => {
    try {
        const { session_id, message, stage, expert_type } = req.body;
        
        console.log('💬 Prompt Engineer v4 chat:', { session_id, stage, expert_type });

        // Verify session ownership
        const sessionResult = await pool.query(
            'SELECT * FROM prompt_engineering_sessions_v4 WHERE id = $1 AND user_id = $2',
            [session_id, req.user.id]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionResult.rows[0];
        let aiResponse;
        let nextStage = stage;

        // Handle different conversation stages
        switch (stage) {
            case 'expert_selection':
                aiResponse = await handleExpertSelection(session_id, message, expert_type);
                nextStage = 'tool_purpose';
                break;
            
            case 'tool_purpose':
                aiResponse = await handleToolPurpose(session_id, message, req.user.id);
                nextStage = 'field_recommendations';
                break;
                
            default:
                // Simple echo response for now
                aiResponse = {
                    message: `I understand you said: "${message}". This is a basic response while we work on the full V4 system.`,
                    stage: stage
                };
                break;
        }

        // Update session
        await pool.query(
            'UPDATE prompt_engineering_sessions_v4 SET session_stage = $1, updated_at = NOW() WHERE id = $2',
            [nextStage, session_id]
        );

        // Save conversation turn
        await pool.query(`
            INSERT INTO prompt_engineering_conversations_v4 
            (session_id, user_message, ai_response, stage, created_at)
            VALUES ($1, $2, $3, $4, NOW())
        `, [session_id, message, JSON.stringify(aiResponse), stage]);

        res.json({
            success: true,
            session_id,
            ai_response: aiResponse,
            current_stage: nextStage
        });

    } catch (error) {
        console.error('Error in Prompt Engineer v4 chat:', error);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

// Helper functions
async function handleExpertSelection(sessionId, message, expertType) {
    const expertPersonas = {
        'Story Writer & Creative Fiction Expert': {
            persona: 'story_writer',
            greeting: `Perfect! I'm now your **Story Writer & Creative Fiction Expert**. 

I specialize in:
• **Personalized story generation** - Users input preferences, I craft custom stories
• **Story idea generators** - Help users overcome writer's block with tailored prompts  
• **Character development tools** - Create complex, realistic characters
• **Plot structure assistants** - Guide users through compelling story arcs

**What's your vision? Should this tool help users:**
1. **Generate complete custom stories** based on their preferences?
2. **Get personalized story ideas and writing prompts** to spark creativity?
3. **Develop rich characters** with backstories and personalities?

*The more specific you are, the better tool we can create together!*`
        }
    };

    const selectedExpert = expertPersonas[expertType] || {
        persona: 'custom_expert',
        greeting: `Great! I'll become the expert you described: "${message}"

Now that I understand my role, let's dive into creating your tool. What specific problem should this tool solve for your users? What kind of output or assistance should it provide?

Please describe the purpose and goals of the tool we're building together.`
    };

    // Update session with AI persona
    await pool.query(
        'UPDATE prompt_engineering_sessions_v4 SET ai_persona = $1 WHERE id = $2',
        [selectedExpert.persona, sessionId]
    );

    return {
        message: selectedExpert.greeting,
        stage: 'tool_purpose',
        expert_type: expertType
    };
}

async function handleToolPurpose(sessionId, message, userId) {
    // Create a detailed prompt that includes the system behavior we want
    const enhancedMessage = `I want to create a tool with this purpose: "${message}"

Please help me design this tool by suggesting 3-4 specific input fields that would help users customize their experience. Act as an expert prompt engineer and respond enthusiastically. Keep it conversational and ask what I think about your suggestions.`;

    const aiResponse = await claudeService.chat(enhancedMessage, [], userId);

    return {
        message: aiResponse,
        stage: 'field_recommendations',
        purpose: message
    };
}

// GET /api/v4/tools - Get user's V4 tools
router.get('/tools', authenticateToken, async (req, res) => {
    try {
        console.log('📋 Fetching V4 tools for user:', req.user.id);
        
        const result = await pool.query(`
            SELECT id, name, description, subdomain, fields, system_prompt, 
                deployed, enabled, prompt_engineer_version,
                created_at, updated_at
            FROM tools_v4 
            WHERE user_id = $1 
            ORDER BY created_at DESC
        `, [req.user.id]);

        const tools = result.rows.map(tool => ({
            ...tool,
            fields_count: tool.fields ? tool.fields.length : 0
        }));

        res.json({
            success: true,
            tools: tools
        });

    } catch (error) {
        console.error('Error fetching V4 tools:', error);
        res.status(500).json({ error: 'Failed to fetch tools' });
    }
});

module.exports = router;