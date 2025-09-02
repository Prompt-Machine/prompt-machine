const express = require('express');
const { Pool } = require('pg');
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

// Helper function to clean AI JSON responses
function cleanAIResponse(response) {
    let cleanResponse = response.trim();
    
    // Remove markdown code blocks if present
    if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    
    return cleanResponse;
}

// =====================================================
// PROJECT MANAGEMENT ENDPOINTS
// =====================================================

/**
 * GET /api/v6/projects
 * Get all projects for the user
 */
router.get('/projects', async (req, res) => {
    try {
        const userId = req.body.userId || 'e88dad2e-5b81-4a6b-8d42-4b65611428ac'; // Default for testing
        
        const query = `
            SELECT 
                p.*,
                COUNT(DISTINCT ps.id) as step_count,
                COUNT(DISTINCT pf.id) as field_count
            FROM projects_v6 p
            LEFT JOIN project_steps_v6 ps ON p.id = ps.project_id
            LEFT JOIN project_fields_v6 pf ON ps.id = pf.step_id
            WHERE p.user_id = $1
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        `;
        
        const result = await pool.query(query, [userId]);
        
        res.json({
            success: true,
            projects: result.rows
        });
        
    } catch (error) {
        console.error('Error loading projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load projects'
        });
    }
});

/**
 * POST /api/v6/projects
 * Create new project with AI assistance
 */
router.post('/projects', async (req, res) => {
    try {
        const { userId, projectIdea, expertType, projectName, manualProject, projectDescription, aiRole, steps, finalizeProject, generatedSteps, refinementAnswers } = req.body;
        const user_id = userId || 'e88dad2e-5b81-4a6b-8d42-4b65611428ac';
        
        // Manual project creation for testing
        if (manualProject) {
            console.log('🧪 Creating manual test project...');
            
            const subdomain = `test-project-${Date.now().toString().slice(-6)}`;
            
            const projectQuery = `
                INSERT INTO projects_v6 
                (user_id, name, description, ai_role, subdomain)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            
            const projectResult = await pool.query(projectQuery, [
                user_id, projectName, projectDescription, aiRole, subdomain
            ]);
            
            const project = projectResult.rows[0];
            console.log('✅ Manual project created:', project.name);
            
            return res.json({
                success: true,
                project: project,
                message: 'Manual test project created'
            });
        }
        
        // New refinement-based project creation
        if (finalizeProject) {
            console.log('🎯 Finalizing refined project...');
            
            // Use the generated steps from refinement process
            const projectStructure = {
                project_name: projectName || generatedSteps[0]?.project_name || 'AI Tool',
                project_description: generatedSteps.project_description || 'AI-generated tool',
                ai_persona_description: generatedSteps.ai_persona_description || `${expertType} with specialized knowledge`,
                system_prompt: generatedSteps.system_prompt || `You are a ${expertType} AI assistant.`,
                header_title: generatedSteps.header_title || projectName || 'AI Tool',
                header_subtitle: generatedSteps.header_subtitle || 'Get professional results with AI',
                steps: generatedSteps || []
            };
            
            // Create project with refined structure
            return await createProjectWithStructure(user_id, projectStructure, expertType, res, pool);
        }
        
        if (!projectIdea || !expertType) {
            return res.status(400).json({
                success: false,
                error: 'Project idea and expert type are required'
            });
        }
        
        console.log(`🚀 Creating new v6 project: ${expertType} - ${projectIdea}`);
        
        // Get AI to suggest project structure - simplified for reliability  
        const structurePrompt = `Create a multi-step form for: "${projectIdea}" (Expert: ${expertType})
${projectName ? `Use this project name: "${projectName}"` : 'Suggest a good project name (max 3 words)'}

Respond with JSON only - no other text:
{
  ${!projectName ? '"project_name": "Name (max 3 words)",' : ''}
  "project_description": "Brief description",
  "ai_persona_description": "Expert persona description",
  "system_prompt": "AI system prompt",
  "header_title": "Page title",
  "header_subtitle": "Page subtitle",
  "steps": [
    {
      "name": "Step 1",
      "page_title": "Step title",
      "fields": [
        {"name": "field1", "label": "Label", "type": "text", "required": true},
        {"name": "field2", "label": "Label 2", "type": "select", "required": false}
      ]
    }
  ]
}

Make 2-3 steps with 2-3 fields each. Use field types: text, textarea, select. Keep everything concise.`;

        // Get AI suggestion
        const aiResponse = await claude.generateResponse(structurePrompt, 'claude-3-5-sonnet-20241022');
        
        let projectStructure;
        try {
            console.log('📋 AI Response received:', aiResponse.substring(0, 500) + '...');
            
            // Extract JSON from AI response
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                console.log('📋 Extracted JSON:', jsonMatch[0].substring(0, 200) + '...');
                projectStructure = JSON.parse(jsonMatch[0]);
                console.log('✅ Successfully parsed project structure:', Object.keys(projectStructure));
            } else {
                console.error('❌ No JSON found in AI response:', aiResponse);
                throw new Error('No JSON found in AI response');
            }
        } catch (parseError) {
            console.error('❌ Error parsing AI response:', parseError);
            console.error('❌ Full AI response:', aiResponse);
            return res.status(500).json({
                success: false,
                error: 'Failed to generate project structure'
            });
        }
        
        // Generate clean, SEO-friendly subdomain from project name (no numbers)
        const generateSubdomain = (projectName) => {
            return projectName
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '') // Remove special characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-') // Replace multiple hyphens with single
                .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
                .slice(0, 50); // Allow longer names for better SEO
        };
        
        // Check if subdomain is already taken
        const checkSubdomainAvailable = async (subdomain) => {
            const result = await pool.query(
                'SELECT id FROM projects_v6 WHERE subdomain = $1 AND deployed = true',
                [subdomain]
            );
            return result.rows.length === 0;
        };
        
        // Create project first to get ID, then update with proper subdomain
        const projectQuery = `
            INSERT INTO projects_v6 
            (user_id, name, description, ai_role, ai_persona_description, system_prompt, 
             subdomain, header_title, header_subtitle)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        
        const projectResult = await pool.query(projectQuery, [
            user_id,
            projectName || projectStructure.project_name, // Use provided name or AI-generated one
            projectStructure.project_description,
            expertType,
            projectStructure.ai_persona_description,
            projectStructure.system_prompt,
            null, // subdomain will be set after we have the project ID
            projectStructure.header_title,
            projectStructure.header_subtitle
        ]);
        
        const project = projectResult.rows[0];
        
        // Generate and check subdomain availability
        const baseSubdomain = generateSubdomain(project.name);
        const isAvailable = await checkSubdomainAvailable(baseSubdomain);
        
        if (!isAvailable) {
            // Delete the created project since subdomain is taken
            await pool.query('DELETE FROM projects_v6 WHERE id = $1', [project.id]);
            return res.status(409).json({
                success: false,
                error: `Subdomain '${baseSubdomain}' is already taken. Please choose a different project name.`,
                suggested_names: [
                    `${project.name} Pro`,
                    `${project.name} Plus`,
                    `${project.name} Advanced`,
                    `My ${project.name}`,
                    `Custom ${project.name}`
                ]
            });
        }
        
        // Update subdomain
        await pool.query('UPDATE projects_v6 SET subdomain = $1 WHERE id = $2', [baseSubdomain, project.id]);
        
        console.log(`📋 Creating ${projectStructure.steps.length} steps...`);
        
        // Create steps and fields
        for (let stepIndex = 0; stepIndex < projectStructure.steps.length; stepIndex++) {
            const stepData = projectStructure.steps[stepIndex];
            console.log(`📋 Creating step ${stepIndex + 1}: ${stepData.name}`);
            
            // Create step
            const stepQuery = `
                INSERT INTO project_steps_v6 
                (project_id, name, description, step_order, page_title, page_subtitle)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            
            const stepResult = await pool.query(stepQuery, [
                project.id,
                stepData.name,
                stepData.description,
                stepIndex + 1,
                stepData.page_title,
                stepData.page_subtitle
            ]);
            
            const step = stepResult.rows[0];
            
            console.log(`📋 Created step: ${step.name} (${step.id})`);
            
            // Create fields for this step
            console.log(`📋 Creating ${stepData.fields.length} fields for step: ${stepData.name}`);
            for (let fieldIndex = 0; fieldIndex < stepData.fields.length; fieldIndex++) {
                const fieldData = stepData.fields[fieldIndex];
                console.log(`📋 Creating field ${fieldIndex + 1}: ${fieldData.name} (${fieldData.type})`);
                
                const fieldQuery = `
                    INSERT INTO project_fields_v6 
                    (step_id, name, label, field_type, placeholder, description, is_required, field_order)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                `;
                
                await pool.query(fieldQuery, [
                    step.id,
                    fieldData.name,
                    fieldData.label,
                    fieldData.type,
                    fieldData.placeholder || null,
                    fieldData.description || null,
                    fieldData.required || false,
                    fieldIndex + 1
                ]);
            }
        }
        
        console.log(`✅ Created project: ${project.name} (${project.id})`);
        
        res.json({
            success: true,
            project: project,
            message: 'Project created successfully with AI-generated structure'
        });
        
    } catch (error) {
        console.error('❌ Error creating project:', error.message);
        console.error('❌ Full error details:', error);
        res.status(500).json({
            success: false,
            error: `Failed to create project: ${error.message}`
        });
    }
});

/**
 * GET /api/v6/projects/:projectId
 * Get detailed project with steps and fields
 */
router.get('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        // Get project
        const projectQuery = 'SELECT * FROM projects_v6 WHERE id = $1';
        const projectResult = await pool.query(projectQuery, [projectId]);
        
        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        const project = projectResult.rows[0];
        
        // Get steps
        const stepsQuery = `
            SELECT * FROM project_steps_v6 
            WHERE project_id = $1 
            ORDER BY step_order ASC
        `;
        const stepsResult = await pool.query(stepsQuery, [projectId]);
        
        // Get fields for each step
        for (let step of stepsResult.rows) {
            const fieldsQuery = `
                SELECT * FROM project_fields_v6 
                WHERE step_id = $1 
                ORDER BY field_order ASC
            `;
            const fieldsResult = await pool.query(fieldsQuery, [step.id]);
            
            // Get choices for each field
            for (let field of fieldsResult.rows) {
                if (['select', 'radio', 'checkbox'].includes(field.field_type)) {
                    const choicesQuery = `
                        SELECT * FROM project_choices_v6 
                        WHERE field_id = $1 
                        ORDER BY choice_order ASC
                    `;
                    const choicesResult = await pool.query(choicesQuery, [field.id]);
                    field.choices = choicesResult.rows;
                } else {
                    field.choices = [];
                }
            }
            
            step.fields = fieldsResult.rows;
        }
        
        project.steps = stepsResult.rows;
        
        res.json({
            success: true,
            project: project
        });
        
    } catch (error) {
        console.error('Error getting project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get project details'
        });
    }
});

/**
 * PUT /api/v6/projects/:projectId
 * Update project details
 */
router.put('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { name, description, ai_role, header_title, header_subtitle, updateSubdomain } = req.body;
        
        // Get current project to check if name changed
        const currentProject = await pool.query('SELECT name, subdomain FROM projects_v6 WHERE id = $1', [projectId]);
        if (currentProject.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        let subdomain = currentProject.rows[0].subdomain;
        
        // Update subdomain if name changed and updateSubdomain is true
        if (updateSubdomain && name && name !== currentProject.rows[0].name) {
            const newSubdomain = name
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '') // Remove special characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-') // Replace multiple hyphens with single
                .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
                .slice(0, 50); // Allow longer names for better SEO
                
            // Check if new subdomain is available (excluding current project)
            const subdomainCheck = await pool.query(
                'SELECT id FROM projects_v6 WHERE subdomain = $1 AND id != $2 AND deployed = true',
                [newSubdomain, projectId]
            );
            
            if (subdomainCheck.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: `Subdomain '${newSubdomain}' is already taken. Please choose a different project name.`,
                    suggested_names: [
                        `${name} Pro`,
                        `${name} Plus`, 
                        `${name} Advanced`,
                        `My ${name}`,
                        `Custom ${name}`
                    ]
                });
            }
            
            subdomain = newSubdomain;
        }
        
        const query = `
            UPDATE projects_v6 
            SET name = COALESCE($1, name), 
                description = COALESCE($2, description), 
                ai_role = COALESCE($3, ai_role), 
                header_title = COALESCE($4, header_title), 
                header_subtitle = COALESCE($5, header_subtitle), 
                subdomain = $6, 
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            name, description, ai_role, header_title, header_subtitle, subdomain, projectId
        ]);
        
        res.json({
            success: true,
            project: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update project'
        });
    }
});

/**
 * DELETE /api/v6/projects/:projectId
 * Delete project and all related data (including deployed tool files)
 */
router.delete('/projects/:projectId', async (req, res) => {
    const toolGeneratorV6 = require('../services/toolGeneratorV6');
    
    try {
        const { projectId } = req.params;
        
        // Get project info before deletion (need subdomain for cleanup)
        const projectResult = await pool.query('SELECT subdomain FROM projects_v6 WHERE id = $1', [projectId]);
        
        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        const project = projectResult.rows[0];
        
        // Delete from database first
        const result = await pool.query('DELETE FROM projects_v6 WHERE id = $1 RETURNING *', [projectId]);
        
        // Clean up deployed tool files if subdomain exists
        if (project.subdomain) {
            console.log(`🗑️ Cleaning up deployed tool files for: ${project.subdomain}`);
            const cleanupSuccess = await toolGeneratorV6.removeDeployedTool(project.subdomain);
            
            if (!cleanupSuccess) {
                console.warn(`⚠️ Failed to clean up deployed files for ${project.subdomain}, but project was deleted from database`);
            }
        }
        
        res.json({
            success: true,
            message: 'Project and deployed files deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete project'
        });
    }
});

/**
 * PUT /api/v6/projects/:projectId/toggle-enabled
 * Enable or disable a project (keeps all data but toggles accessibility)
 */
router.put('/projects/:projectId/toggle-enabled', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        // Get current enabled status
        const currentResult = await pool.query('SELECT enabled FROM projects_v6 WHERE id = $1', [projectId]);
        
        if (currentResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        const currentEnabled = currentResult.rows[0].enabled;
        const newEnabled = !currentEnabled;
        
        // Update enabled status
        const result = await pool.query(
            'UPDATE projects_v6 SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING name, enabled', 
            [newEnabled, projectId]
        );
        
        const project = result.rows[0];
        const status = newEnabled ? 'enabled' : 'disabled';
        
        console.log(`🔄 Project "${project.name}" ${status}`);
        
        res.json({
            success: true,
            message: `Project ${status} successfully`,
            enabled: newEnabled
        });
        
    } catch (error) {
        console.error('Error toggling project enabled status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle project status'
        });
    }
});

/**
 * POST /api/v6/projects/:projectId/deploy
 * Deploy project as public tool
 */
router.post('/projects/:projectId/deploy', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        console.log(`🚀 Deploying v6 project: ${projectId}`);

        // Get project with all its data
        const projectResult = await pool.query(`
            SELECT 
                p.id, p.name, p.description, p.ai_role, p.ai_persona_description, p.system_prompt,
                p.subdomain, p.deployed, p.enabled, p.monetization_enabled
            FROM projects_v6 p 
            WHERE p.id = $1
        `, [projectId]);

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = projectResult.rows[0];

        // Get all steps for this project
        const stepsResult = await pool.query(`
            SELECT id, name, description, step_order
            FROM project_steps_v6 
            WHERE project_id = $1 
            ORDER BY step_order ASC
        `, [projectId]);

        const steps = stepsResult.rows;

        // Get all fields and choices for each step
        for (let step of steps) {
            const fieldsResult = await pool.query(`
                SELECT id, name, label, field_type, placeholder, description, is_required, field_order
                FROM project_fields_v6 
                WHERE step_id = $1 
                ORDER BY field_order ASC
            `, [step.id]);

            step.fields = fieldsResult.rows.map(field => ({
                ...field,
                type: field.field_type,
                required: field.is_required
            }));

            // Get choices for select/radio fields
            for (let field of step.fields) {
                if (['select', 'radio', 'checkbox'].includes(field.type)) {
                    const choicesResult = await pool.query(`
                        SELECT id, value, label, choice_order
                        FROM project_choices_v6 
                        WHERE field_id = $1 
                        ORDER BY choice_order ASC
                    `, [field.id]);
                    field.choices = choicesResult.rows;
                }
            }
        }

        // Generate the public tool
        const toolGenerator = require('../services/toolGeneratorV6');
        const deploymentResult = await toolGenerator.deployProject({
            ...project,
            steps
        });

        // Update deployment status
        await pool.query(`
            UPDATE projects_v6 
            SET deployed = true, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        `, [projectId]);

        console.log(`✅ v6 project deployed successfully: ${deploymentResult.url}`);

        res.json({
            success: true,
            project: {
                id: project.id,
                name: project.name,
                description: project.description
            },
            deployment: deploymentResult
        });

    } catch (error) {
        console.error('Deploy v6 project error:', error);
        res.status(500).json({ error: 'Failed to deploy project', details: error.message });
    }
});

// =====================================================
// REFINEMENT ENDPOINTS FOR NEW CREATION FLOW
// =====================================================

/**
 * POST /api/v6/projects/refinement-questions
 * Generate AI questions to refine project requirements
 */
router.post('/projects/refinement-questions', async (req, res) => {
    try {
        const { projectIdea, expertType } = req.body;
        
        if (!projectIdea || !expertType) {
            return res.status(400).json({
                success: false,
                error: 'Project idea and expert type are required'
            });
        }
        
        console.log(`🤔 Generating refinement questions for: ${expertType} - ${projectIdea}`);
        
        // Generate refinement questions with AI
        const questionsPrompt = `You are helping create a multi-step AI tool. Generate 3-5 thoughtful questions to help refine the project requirements.

Project: "${projectIdea}"
Expert Type: "${expertType}"

Generate questions that will help create better, more specific form fields for the end users. Focus on:
- Target audience details
- Specific use cases
- Required information from users
- Desired outcomes
- Any special considerations

Respond with JSON only:
{
  "questions": [
    {
      "question": "Question text here?",
      "placeholder": "Suggested placeholder text...",
      "required": false
    }
  ]
}`;

        const aiResponse = await claude.generateResponse(questionsPrompt);

        const questionsData = JSON.parse(cleanAIResponse(aiResponse));
        
        console.log(`✅ Generated ${questionsData.questions.length} refinement questions`);
        
        res.json({
            success: true,
            questions: questionsData.questions
        });
        
    } catch (error) {
        console.error('Error generating refinement questions:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to generate refinement questions' 
        });
    }
});

/**
 * POST /api/v6/projects/more-questions  
 * Generate additional refinement questions based on current answers
 */
router.post('/projects/more-questions', async (req, res) => {
    try {
        const { projectIdea, expertType, refinementAnswers } = req.body;
        
        console.log(`🤔 Generating additional questions with ${refinementAnswers.length} previous answers`);
        
        // Generate more targeted questions based on previous answers
        const moreQuestionsPrompt = `Based on the previous answers, generate 2-3 more specific questions to further refine the project.

Project: "${projectIdea}"
Expert Type: "${expertType}"

Previous Q&A:
${refinementAnswers.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}

Generate follow-up questions that dig deeper into the specific needs. Respond with JSON only:
{
  "questions": [
    {
      "question": "More specific question based on answers?",
      "placeholder": "Suggested placeholder...",
      "required": false
    }
  ]
}`;

        const aiResponse = await claude.generateResponse(moreQuestionsPrompt);

        const questionsData = JSON.parse(cleanAIResponse(aiResponse));
        
        console.log(`✅ Generated ${questionsData.questions.length} additional questions`);
        
        res.json({
            success: true,
            questions: questionsData.questions
        });
        
    } catch (error) {
        console.error('Error generating more questions:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to generate additional questions' 
        });
    }
});

/**
 * POST /api/v6/projects/generate-fields
 * Generate form fields based on project info and refinement answers
 */
router.post('/projects/generate-fields', async (req, res) => {
    try {
        const { projectIdea, expertType, projectName, refinementAnswers } = req.body;
        
        console.log(`🛠️ Generating fields for: ${expertType} - ${projectIdea}`);
        
        // Enhanced AI prompt with refinement context
        const fieldsPrompt = `Create a multi-step form with detailed fields based on the refined requirements.

Project: "${projectIdea}"
Expert Type: "${expertType}"
${projectName ? `Project Name: "${projectName}"` : ''}

User Requirements from Refinement:
${refinementAnswers.map(qa => `${qa.question}: ${qa.answer}`).join('\n')}

Create 2-4 steps with appropriate form fields. For select/checkbox/radio fields, include specific options that make sense for the context.

IMPORTANT: 
- The system_prompt should be the actual AI instructions for the end-user tool (NOT instructions for building tools). The AI should act as the specified expert type and perform the requested task for end users.
- DO NOT create any submit button fields. The form will have its own "Generate with AI" button automatically.
- Only create input fields (text, textarea, select, radio, checkbox) that collect information from users.

Respond with JSON only:
{
  "project_name": "${projectName || 'Generated Name (max 3 words)'}",
  "project_description": "Brief description", 
  "ai_persona_description": "Expert persona based on requirements",
  "system_prompt": "You are a ${expertType}. Based on the user's form input, ${projectIdea.toLowerCase().replace('create a tool that', '').replace('create', '').replace('tool that', '').trim()}. Be specific, helpful, and perform the actual task rather than giving advice about tools.",
  "header_title": "Page title",
  "header_subtitle": "Page subtitle", 
  "steps": [
    {
      "name": "Step Name",
      "page_title": "Step title",
      "page_subtitle": "Step subtitle",
      "fields": [
        {
          "name": "field_name",
          "label": "Field Label", 
          "type": "text|textarea|select|checkbox|radio|number|email",
          "placeholder": "Placeholder text",
          "description": "Help text",
          "required": true,
          "options": ["Option 1", "Option 2"] // Only for select/checkbox/radio
        }
      ]
    }
  ]
}`;

        const aiResponse = await claude.generateResponse(fieldsPrompt);

        const projectStructure = JSON.parse(cleanAIResponse(aiResponse));
        
        console.log(`✅ Generated project structure with ${projectStructure.steps.length} steps`);
        
        res.json({
            success: true,
            steps: projectStructure.steps,
            projectStructure: projectStructure
        });
        
    } catch (error) {
        console.error('Error generating fields:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to generate fields' 
        });
    }
});

/**
 * GET /api/v6/advertising/settings
 * Get global advertising settings for current user
 */
router.get('/advertising/settings', async (req, res) => {
    try {
        // Get user from auth middleware (you'll need to implement this)
        const user_id = 'e88dad2e-5b81-4a6b-8d42-4b65611428ac'; // TODO: Get from auth
        
        const result = await pool.query(
            'SELECT * FROM advertising_settings WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
            [user_id]
        );

        if (result.rows.length === 0) {
            // Return default settings if none exist
            res.json({
                success: true,
                settings: {
                    google_ads_enabled: false,
                    google_ads_client: '',
                    google_ads_slot: '',
                    google_analytics_enabled: false,
                    google_analytics_id: '',
                    custom_head_code: '',
                    custom_body_code: '',
                    ad_placement_header: false,
                    ad_placement_sidebar: true,
                    ad_placement_footer: false
                }
            });
        } else {
            res.json({
                success: true,
                settings: result.rows[0]
            });
        }
    } catch (error) {
        console.error('Error getting advertising settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get advertising settings'
        });
    }
});

/**
 * PUT /api/v6/advertising/settings
 * Update global advertising settings
 */
router.put('/advertising/settings', async (req, res) => {
    try {
        const user_id = 'e88dad2e-5b81-4a6b-8d42-4b65611428ac'; // TODO: Get from auth
        const {
            google_ads_enabled,
            google_ads_client,
            google_ads_slot,
            google_analytics_enabled,
            google_analytics_id,
            custom_head_code,
            custom_body_code,
            ad_placement_header,
            ad_placement_sidebar,
            ad_placement_footer
        } = req.body;

        console.log(`💰 Updating global advertising settings for user: ${user_id}`);

        // Insert or update settings
        const result = await pool.query(`
            INSERT INTO advertising_settings 
            (user_id, google_ads_enabled, google_ads_client, google_ads_slot, 
             google_analytics_enabled, google_analytics_id, custom_head_code, 
             custom_body_code, ad_placement_header, ad_placement_sidebar, ad_placement_footer)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (user_id) DO UPDATE SET
                google_ads_enabled = EXCLUDED.google_ads_enabled,
                google_ads_client = EXCLUDED.google_ads_client,
                google_ads_slot = EXCLUDED.google_ads_slot,
                google_analytics_enabled = EXCLUDED.google_analytics_enabled,
                google_analytics_id = EXCLUDED.google_analytics_id,
                custom_head_code = EXCLUDED.custom_head_code,
                custom_body_code = EXCLUDED.custom_body_code,
                ad_placement_header = EXCLUDED.ad_placement_header,
                ad_placement_sidebar = EXCLUDED.ad_placement_sidebar,
                ad_placement_footer = EXCLUDED.ad_placement_footer,
                updated_at = NOW()
            RETURNING *
        `, [
            user_id,
            google_ads_enabled || false,
            google_ads_client || null,
            google_ads_slot || null,
            google_analytics_enabled || false,
            google_analytics_id || null,
            custom_head_code || null,
            custom_body_code || null,
            ad_placement_header || false,
            ad_placement_sidebar || true,
            ad_placement_footer || false
        ]);

        res.json({
            success: true,
            settings: result.rows[0],
            message: 'Global advertising settings updated successfully'
        });

    } catch (error) {
        console.error('Error updating advertising settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update advertising settings'
        });
    }
});

/**
 * PUT /api/v6/projects/:projectId/advertising
 * Toggle advertising on/off for a specific project
 */
router.put('/projects/:projectId/advertising', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { advertising_enabled } = req.body;

        console.log(`📱 Toggling advertising for project ${projectId}: ${advertising_enabled}`);

        const result = await pool.query(
            'UPDATE projects_v6 SET advertising_enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING name, advertising_enabled',
            [advertising_enabled, projectId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        res.json({
            success: true,
            project: result.rows[0],
            message: `Advertising ${advertising_enabled ? 'enabled' : 'disabled'} for project`
        });

    } catch (error) {
        console.error('Error toggling project advertising:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle project advertising'
        });
    }
});

// =====================================================
// STEP MANAGEMENT ENDPOINTS
// =====================================================

/**
 * POST /api/v6/projects/:projectId/steps
 * Add new step to project
 */
router.post('/projects/:projectId/steps', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { name, description, page_title, page_subtitle } = req.body;
        
        // Get current max order
        const maxOrderResult = await pool.query(`
            SELECT COALESCE(MAX(step_order), 0) as max_order 
            FROM project_steps_v6 
            WHERE project_id = $1
        `, [projectId]);
        
        const nextOrder = maxOrderResult.rows[0].max_order + 1;
        
        const query = `
            INSERT INTO project_steps_v6 
            (project_id, name, description, step_order, page_title, page_subtitle)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            projectId, name, description, nextOrder, page_title, page_subtitle
        ]);
        
        res.json({
            success: true,
            step: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error creating step:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create step'
        });
    }
});

/**
 * PUT /api/v6/steps/:stepId
 * Update step details
 */
router.put('/steps/:stepId', async (req, res) => {
    try {
        const { stepId } = req.params;
        const { name, description, page_title, page_subtitle } = req.body;
        
        const query = `
            UPDATE project_steps_v6 
            SET name = $1, description = $2, page_title = $3, page_subtitle = $4, updated_at = NOW()
            WHERE id = $5
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            name, description, page_title, page_subtitle, stepId
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Step not found'
            });
        }
        
        res.json({
            success: true,
            step: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error updating step:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update step'
        });
    }
});

/**
 * DELETE /api/v6/steps/:stepId
 * Delete step and reorder remaining steps
 */
router.delete('/steps/:stepId', async (req, res) => {
    try {
        const { stepId } = req.params;
        
        // Get step details before deletion
        const stepResult = await pool.query('SELECT * FROM project_steps_v6 WHERE id = $1', [stepId]);
        
        if (stepResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Step not found'
            });
        }
        
        const step = stepResult.rows[0];
        
        // Delete step (cascade will handle fields and choices)
        await pool.query('DELETE FROM project_steps_v6 WHERE id = $1', [stepId]);
        
        // Reorder remaining steps
        await pool.query(`
            UPDATE project_steps_v6 
            SET step_order = step_order - 1
            WHERE project_id = $1 AND step_order > $2
        `, [step.project_id, step.step_order]);
        
        res.json({
            success: true,
            message: 'Step deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting step:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete step'
        });
    }
});

// =====================================================
// FIELD MANAGEMENT ENDPOINTS
// =====================================================

/**
 * POST /api/v6/steps/:stepId/fields
 * Add new field to step
 */
router.post('/steps/:stepId/fields', async (req, res) => {
    try {
        const { stepId } = req.params;
        const { name, label, field_type, placeholder, description, is_required } = req.body;
        
        // Get current max order for this step
        const maxOrderResult = await pool.query(`
            SELECT COALESCE(MAX(field_order), 0) as max_order 
            FROM project_fields_v6 
            WHERE step_id = $1
        `, [stepId]);
        
        const nextOrder = maxOrderResult.rows[0].max_order + 1;
        
        const query = `
            INSERT INTO project_fields_v6 
            (step_id, name, label, field_type, placeholder, description, is_required, field_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            stepId, name, label, field_type, placeholder, description, is_required, nextOrder
        ]);
        
        res.json({
            success: true,
            field: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error creating field:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create field'
        });
    }
});

/**
 * PUT /api/v6/fields/:fieldId
 * Update field details
 */
router.put('/fields/:fieldId', async (req, res) => {
    try {
        const { fieldId } = req.params;
        const { name, label, field_type, placeholder, description, is_required } = req.body;
        
        const query = `
            UPDATE project_fields_v6 
            SET name = $1, label = $2, field_type = $3, placeholder = $4, 
                description = $5, is_required = $6, updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            name, label, field_type, placeholder, description, is_required, fieldId
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Field not found'
            });
        }
        
        res.json({
            success: true,
            field: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error updating field:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update field'
        });
    }
});

/**
 * DELETE /api/v6/fields/:fieldId
 * Delete field and reorder remaining fields
 */
router.delete('/fields/:fieldId', async (req, res) => {
    try {
        const { fieldId } = req.params;
        
        // Get field details before deletion
        const fieldResult = await pool.query('SELECT * FROM project_fields_v6 WHERE id = $1', [fieldId]);
        
        if (fieldResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Field not found'
            });
        }
        
        const field = fieldResult.rows[0];
        
        // Delete field (cascade will handle choices)
        await pool.query('DELETE FROM project_fields_v6 WHERE id = $1', [fieldId]);
        
        // Reorder remaining fields
        await pool.query(`
            UPDATE project_fields_v6 
            SET field_order = field_order - 1
            WHERE step_id = $1 AND field_order > $2
        `, [field.step_id, field.field_order]);
        
        res.json({
            success: true,
            message: 'Field deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting field:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete field'
        });
    }
});

// =====================================================
// CHOICE MANAGEMENT ENDPOINTS
// =====================================================

/**
 * POST /api/v6/fields/:fieldId/choices
 * Add choice to select/radio/checkbox field
 */
router.post('/fields/:fieldId/choices', async (req, res) => {
    try {
        const { fieldId } = req.params;
        const { label, value, is_default } = req.body;
        
        // Get current max order for this field
        const maxOrderResult = await pool.query(`
            SELECT COALESCE(MAX(choice_order), 0) as max_order 
            FROM project_choices_v6 
            WHERE field_id = $1
        `, [fieldId]);
        
        const nextOrder = maxOrderResult.rows[0].max_order + 1;
        
        const query = `
            INSERT INTO project_choices_v6 
            (field_id, label, value, choice_order, is_default)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            fieldId, label, value, nextOrder, is_default
        ]);
        
        res.json({
            success: true,
            choice: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error creating choice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create choice'
        });
    }
});

/**
 * PUT /api/v6/choices/:choiceId
 * Update choice details
 */
router.put('/choices/:choiceId', async (req, res) => {
    try {
        const { choiceId } = req.params;
        const { label, value, is_default } = req.body;
        
        const query = `
            UPDATE project_choices_v6 
            SET label = $1, value = $2, is_default = $3
            WHERE id = $4
            RETURNING *
        `;
        
        const result = await pool.query(query, [label, value, is_default, choiceId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Choice not found'
            });
        }
        
        res.json({
            success: true,
            choice: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error updating choice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update choice'
        });
    }
});

/**
 * DELETE /api/v6/choices/:choiceId
 * Delete choice and reorder remaining choices
 */
router.delete('/choices/:choiceId', async (req, res) => {
    try {
        const { choiceId } = req.params;
        
        // Get choice details before deletion
        const choiceResult = await pool.query('SELECT * FROM project_choices_v6 WHERE id = $1', [choiceId]);
        
        if (choiceResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Choice not found'
            });
        }
        
        const choice = choiceResult.rows[0];
        
        // Delete choice
        await pool.query('DELETE FROM project_choices_v6 WHERE id = $1', [choiceId]);
        
        // Reorder remaining choices
        await pool.query(`
            UPDATE project_choices_v6 
            SET choice_order = choice_order - 1
            WHERE field_id = $1 AND choice_order > $2
        `, [choice.field_id, choice.choice_order]);
        
        res.json({
            success: true,
            message: 'Choice deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting choice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete choice'
        });
    }
});

// =====================================================
// PUBLIC TOOL ENDPOINTS (for deployed tools)
// =====================================================

/**
 * GET /api/v6/public/:subdomain
 * Get public project data for end users
 */
router.get('/public/:subdomain', async (req, res) => {
    try {
        const { subdomain } = req.params;
        
        const query = `
            SELECT 
                p.*,
                jsonb_agg(
                    jsonb_build_object(
                        'id', ps.id,
                        'name', ps.name,
                        'description', ps.description,
                        'step_order', ps.step_order,
                        'page_title', ps.page_title,
                        'page_subtitle', ps.page_subtitle,
                        'instructions', ps.instructions,
                        'fields', ps.fields
                    ) ORDER BY ps.step_order
                ) as steps
            FROM projects_v6 p
            LEFT JOIN (
                SELECT 
                    ps.*,
                    jsonb_agg(
                        jsonb_build_object(
                            'id', pf.id,
                            'name', pf.name,
                            'label', pf.label,
                            'field_type', pf.field_type,
                            'placeholder', pf.placeholder,
                            'description', pf.description,
                            'is_required', pf.is_required,
                            'field_order', pf.field_order,
                            'choices', pf.choices
                        ) ORDER BY pf.field_order
                    ) as fields
                FROM project_steps_v6 ps
                LEFT JOIN (
                    SELECT 
                        pf.*,
                        CASE 
                            WHEN pf.field_type IN ('select', 'radio', 'checkbox') THEN
                                COALESCE(
                                    jsonb_agg(
                                        jsonb_build_object(
                                            'id', pc.id,
                                            'label', pc.label,
                                            'value', pc.value,
                                            'choice_order', pc.choice_order,
                                            'is_default', pc.is_default
                                        ) ORDER BY pc.choice_order
                                    ) FILTER (WHERE pc.id IS NOT NULL),
                                    '[]'::jsonb
                                )
                            ELSE '[]'::jsonb
                        END as choices
                    FROM project_fields_v6 pf
                    LEFT JOIN project_choices_v6 pc ON pf.id = pc.field_id
                    GROUP BY pf.id
                ) pf ON ps.id = pf.step_id
                GROUP BY ps.id
            ) ps ON p.id = ps.project_id
            WHERE p.subdomain = $1 AND p.deployed = true AND p.enabled = true
            GROUP BY p.id
        `;
        
        const result = await pool.query(query, [subdomain]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Tool not found or not deployed'
            });
        }
        
        res.json({
            success: true,
            project: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error getting public project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load tool'
        });
    }
});

/**
 * POST /api/v6/public/:subdomain/submit
 * Process form submission from end user
 */
router.post('/public/:subdomain/submit', async (req, res) => {
    try {
        const { subdomain } = req.params;
        const { responses } = req.body;
        
        // Get project
        const projectQuery = `
            SELECT * FROM projects_v6 
            WHERE subdomain = $1 AND deployed = true AND enabled = true
        `;
        const projectResult = await pool.query(projectQuery, [subdomain]);
        
        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Tool not found'
            });
        }
        
        const project = projectResult.rows[0];
        
        // Create session
        const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const sessionQuery = `
            INSERT INTO project_sessions_v6 (project_id, session_token, user_ip)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const sessionResult = await pool.query(sessionQuery, [
            project.id, sessionToken, req.ip
        ]);
        const session = sessionResult.rows[0];
        
        // Save responses
        for (const response of responses) {
            await pool.query(`
                INSERT INTO project_responses_v6 (session_id, step_id, field_id, field_value)
                VALUES ($1, $2, $3, $4)
            `, [session.id, response.step_id, response.field_id, response.field_value]);
        }
        
        // Prepare AI prompt
        let aiPrompt = project.system_prompt + '\n\nUser Information:\n';
        for (const response of responses) {
            aiPrompt += `${response.field_name}: ${response.field_value}\n`;
        }
        
        // Get AI response
        const aiResponse = await claude.generateResponse(aiPrompt, 'claude-3-5-sonnet-20241022');
        
        // Save AI response
        await pool.query(`
            UPDATE project_sessions_v6 
            SET ai_response = $1, ai_response_generated_at = NOW(), completed_at = NOW()
            WHERE id = $2
        `, [aiResponse, session.id]);
        
        console.log(`✅ Processed submission for ${project.name}: ${session.session_token}`);
        
        res.json({
            success: true,
            response: aiResponse,
            session_id: session.id
        });
        
    } catch (error) {
        console.error('Error processing submission:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process submission'
        });
    }
});

// =====================================================
// ADVANCED PROJECT MANAGEMENT ENDPOINTS
// =====================================================

/**
 * POST /api/v6/projects/:projectId/clone
 * Clone a project with all steps and fields
 */
router.post('/projects/:projectId/clone', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { newName } = req.body;
        
        // Get original project with all data
        const originalProjectQuery = await pool.query(`
            SELECT * FROM projects_v6 WHERE id = $1
        `, [projectId]);
        
        if (originalProjectQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        const original = originalProjectQuery.rows[0];
        // Generate clean subdomain for cloned project
        const generateClonedSubdomain = (originalName, newName, projectId) => {
            const baseName = (newName || originalName).replace(' (Copy)', '');
            return baseName
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, '-')
                .slice(0, 30) + '-copy-' + projectId.split('-')[0];
        };
        const name = newName || `${original.name} (Copy)`;
        
        // Create cloned project
        const projectQuery = `
            INSERT INTO projects_v6 
            (user_id, name, description, ai_role, ai_persona_description, system_prompt, 
             subdomain, header_title, header_subtitle, deployed, enabled)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
            RETURNING *
        `;
        
        const newProject = await pool.query(projectQuery, [
            original.user_id, name, original.description, original.ai_role,
            original.ai_persona_description, original.system_prompt, null,
            original.header_title, original.header_subtitle, original.enabled
        ]);
        
        const project = newProject.rows[0];
        
        // Generate and update subdomain after project creation
        const subdomain = generateClonedSubdomain(original.name, name, project.id);
        await pool.query('UPDATE projects_v6 SET subdomain = $1 WHERE id = $2', [subdomain, project.id]);
        
        // Clone steps and fields
        const stepsQuery = await pool.query(`
            SELECT * FROM project_steps_v6 WHERE project_id = $1 ORDER BY step_order
        `, [projectId]);
        
        for (const step of stepsQuery.rows) {
            const newStepQuery = await pool.query(`
                INSERT INTO project_steps_v6 
                (project_id, name, description, step_order, page_title, page_subtitle)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [project.id, step.name, step.description, step.step_order, step.page_title, step.page_subtitle]);
            
            const newStep = newStepQuery.rows[0];
            
            // Clone fields
            const fieldsQuery = await pool.query(`
                SELECT * FROM project_fields_v6 WHERE step_id = $1 ORDER BY field_order
            `, [step.id]);
            
            for (const field of fieldsQuery.rows) {
                const newFieldQuery = await pool.query(`
                    INSERT INTO project_fields_v6 
                    (step_id, name, label, field_type, placeholder, description, is_required, field_order)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                `, [newStep.id, field.name, field.label, field.field_type, 
                    field.placeholder, field.description, field.is_required, field.field_order]);
                
                const newField = newFieldQuery.rows[0];
                
                // Clone choices if any
                const choicesQuery = await pool.query(`
                    SELECT * FROM project_choices_v6 WHERE field_id = $1 ORDER BY choice_order
                `, [field.id]);
                
                for (const choice of choicesQuery.rows) {
                    await pool.query(`
                        INSERT INTO project_choices_v6 
                        (field_id, label, value, choice_order, is_default)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [newField.id, choice.label, choice.value, choice.choice_order, choice.is_default]);
                }
            }
        }
        
        console.log(`📋 Cloned project: ${name} (${project.id})`);
        
        res.json({
            success: true,
            project: project,
            message: 'Project cloned successfully'
        });
        
    } catch (error) {
        console.error('Error cloning project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clone project'
        });
    }
});

/**
 * PUT /api/v6/projects/:projectId/reorder-steps
 * Reorder steps in a project
 */
router.put('/projects/:projectId/reorder-steps', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { stepIds } = req.body; // Array of step IDs in desired order
        
        if (!Array.isArray(stepIds)) {
            return res.status(400).json({
                success: false,
                error: 'stepIds must be an array'
            });
        }
        
        // Update step orders
        for (let i = 0; i < stepIds.length; i++) {
            await pool.query(`
                UPDATE project_steps_v6 
                SET step_order = $1 
                WHERE id = $2 AND project_id = $3
            `, [i + 1, stepIds[i], projectId]);
        }
        
        res.json({
            success: true,
            message: 'Steps reordered successfully'
        });
        
    } catch (error) {
        console.error('Error reordering steps:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reorder steps'
        });
    }
});

/**
 * PUT /api/v6/steps/:stepId/reorder-fields
 * Reorder fields in a step
 */
router.put('/steps/:stepId/reorder-fields', async (req, res) => {
    try {
        const { stepId } = req.params;
        const { fieldIds } = req.body; // Array of field IDs in desired order
        
        if (!Array.isArray(fieldIds)) {
            return res.status(400).json({
                success: false,
                error: 'fieldIds must be an array'
            });
        }
        
        // Update field orders
        for (let i = 0; i < fieldIds.length; i++) {
            await pool.query(`
                UPDATE project_fields_v6 
                SET field_order = $1 
                WHERE id = $2 AND step_id = $3
            `, [i + 1, fieldIds[i], stepId]);
        }
        
        res.json({
            success: true,
            message: 'Fields reordered successfully'
        });
        
    } catch (error) {
        console.error('Error reordering fields:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reorder fields'
        });
    }
});

/**
 * GET /api/v6/projects/:projectId/export
 * Export project configuration as JSON
 */
router.get('/projects/:projectId/export', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        // Get complete project data
        const projectQuery = await pool.query(`
            SELECT * FROM projects_v6 WHERE id = $1
        `, [projectId]);
        
        if (projectQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        const project = projectQuery.rows[0];
        
        // Get steps with fields and choices
        const stepsQuery = await pool.query(`
            SELECT * FROM project_steps_v6 WHERE project_id = $1 ORDER BY step_order
        `, [projectId]);
        
        const steps = [];
        for (const step of stepsQuery.rows) {
            const fieldsQuery = await pool.query(`
                SELECT * FROM project_fields_v6 WHERE step_id = $1 ORDER BY field_order
            `, [step.id]);
            
            const fields = [];
            for (const field of fieldsQuery.rows) {
                const choicesQuery = await pool.query(`
                    SELECT * FROM project_choices_v6 WHERE field_id = $1 ORDER BY choice_order
                `, [field.id]);
                
                fields.push({
                    ...field,
                    choices: choicesQuery.rows
                });
            }
            
            steps.push({
                ...step,
                fields: fields
            });
        }
        
        const exportData = {
            ...project,
            steps: steps,
            export_date: new Date().toISOString(),
            version: '6.0'
        };
        
        res.json({
            success: true,
            export: exportData
        });
        
    } catch (error) {
        console.error('Error exporting project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export project'
        });
    }
});

/**
 * GET /api/v6/projects/:projectId/analytics
 * Get analytics for project responses
 */
router.get('/projects/:projectId/analytics', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        // Get response statistics
        const totalSessionsQuery = await pool.query(`
            SELECT COUNT(*) as total_sessions FROM project_sessions_v6 WHERE project_id = $1
        `, [projectId]);
        
        const completedSessionsQuery = await pool.query(`
            SELECT COUNT(*) as completed_sessions FROM project_sessions_v6 
            WHERE project_id = $1 AND completed_at IS NOT NULL
        `, [projectId]);
        
        const recentSessionsQuery = await pool.query(`
            SELECT COUNT(*) as recent_sessions FROM project_sessions_v6 
            WHERE project_id = $1 AND started_at > NOW() - INTERVAL '7 days'
        `, [projectId]);
        
        // Get field response counts
        const fieldResponsesQuery = await pool.query(`
            SELECT 
                pf.name, pf.label, COUNT(pr.id) as response_count
            FROM project_fields_v6 pf
            JOIN project_steps_v6 ps ON pf.step_id = ps.id
            LEFT JOIN project_responses_v6 pr ON pf.id = pr.field_id
            WHERE ps.project_id = $1
            GROUP BY pf.id, pf.name, pf.label
            ORDER BY response_count DESC
        `, [projectId]);
        
        const analytics = {
            total_sessions: parseInt(totalSessionsQuery.rows[0].total_sessions),
            completed_sessions: parseInt(completedSessionsQuery.rows[0].completed_sessions),
            recent_sessions: parseInt(recentSessionsQuery.rows[0].recent_sessions),
            completion_rate: totalSessionsQuery.rows[0].total_sessions > 0 
                ? (completedSessionsQuery.rows[0].completed_sessions / totalSessionsQuery.rows[0].total_sessions * 100).toFixed(2)
                : 0,
            field_responses: fieldResponsesQuery.rows
        };
        
        res.json({
            success: true,
            analytics: analytics
        });
        
    } catch (error) {
        console.error('Error getting analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get analytics'
        });
    }
});

/**
 * GET /api/v6/projects/:projectId/responses
 * Get all responses for a project
 */
router.get('/projects/:projectId/responses', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        const query = `
            SELECT 
                ps.id as session_id,
                ps.started_at,
                ps.completed_at,
                ps.ai_response,
                jsonb_agg(
                    jsonb_build_object(
                        'field_name', pf.name,
                        'field_label', pf.label,
                        'field_value', pr.field_value
                    )
                ) as responses
            FROM project_sessions_v6 ps
            LEFT JOIN project_responses_v6 pr ON ps.id = pr.session_id
            LEFT JOIN project_fields_v6 pf ON pr.field_id = pf.id
            WHERE ps.project_id = $1
            GROUP BY ps.id
            ORDER BY ps.started_at DESC
            LIMIT $2 OFFSET $3
        `;
        
        const result = await pool.query(query, [projectId, limit, offset]);
        
        res.json({
            success: true,
            responses: result.rows
        });
        
    } catch (error) {
        console.error('Error getting responses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get responses'
        });
    }
});

// =====================================================
// PUBLIC TOOL API ENDPOINTS
// =====================================================

/**
 * POST /api/v6/tools/generate
 * Generate AI response for deployed v6 tools
 */
router.post('/tools/generate', async (req, res) => {
    try {
        const { project_id, project_name, system_prompt, form_data, steps_completed } = req.body;
        
        console.log(`🤖 Generating AI response for v6 tool: ${project_name}`);
        
        // Validate required fields
        if (!project_id || !form_data || !system_prompt) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: project_id, form_data, system_prompt'
            });
        }

        // Build user prompt from form data
        let userPrompt = `Please process the following information:\n\n`;
        
        Object.entries(form_data).forEach(([key, value]) => {
            if (value && value.toString().trim()) {
                const fieldLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                userPrompt += `${fieldLabel}: ${value}\n`;
            }
        });
        
        userPrompt += `\nPlease provide a comprehensive response based on the information above.`;

        // Generate AI response using Claude service
        const claude = require('../services/claude');
        
        // Build the complete prompt with system instructions
        const fullPrompt = `${system_prompt}\n\n${userPrompt}`;
        
        const aiResponse = await claude.chat(fullPrompt, [], null);

        // Generate unique session token
        const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create session record
        const sessionResult = await pool.query(`
            INSERT INTO project_sessions_v6 (project_id, session_token, started_at, completed_at, ai_response)
            VALUES ($1, $2, NOW(), NOW(), $3)
            RETURNING id
        `, [project_id, sessionToken, aiResponse]);

        const sessionId = sessionResult.rows[0].id;

        // Save individual field responses
        for (const [fieldKey, fieldValue] of Object.entries(form_data)) {
            if (fieldValue && fieldValue.toString().trim()) {
                // Try to find the field by name (approximate match) and get both field_id and step_id
                const fieldResult = await pool.query(`
                    SELECT pf.id, pf.step_id FROM project_fields_v6 pf
                    JOIN project_steps_v6 ps ON pf.step_id = ps.id
                    WHERE ps.project_id = $1 AND (
                        LOWER(pf.name) LIKE LOWER($2) OR 
                        LOWER(REPLACE(pf.name, ' ', '_')) = LOWER($2) OR
                        LOWER(REPLACE(pf.name, ' ', '')) = LOWER(REPLACE($2, '_', ''))
                    )
                    LIMIT 1
                `, [project_id, fieldKey]);

                if (fieldResult.rows.length > 0) {
                    await pool.query(`
                        INSERT INTO project_responses_v6 (session_id, step_id, field_id, field_value)
                        VALUES ($1, $2, $3, $4)
                    `, [sessionId, fieldResult.rows[0].step_id, fieldResult.rows[0].id, fieldValue.toString()]);
                }
            }
        }

        console.log(`✅ AI response generated successfully for session: ${sessionId}`);

        res.json({
            success: true,
            result: aiResponse,
            session_id: sessionId
        });

    } catch (error) {
        console.error('Tool generation error:', error);
        res.status(500).json({
            success: false,
            error: 'AI generation failed',
            details: error.message
        });
    }
});

/**
 * POST /api/v6/tools/track-usage
 * Track usage statistics for deployed v6 tools
 */
router.post('/tools/track-usage', async (req, res) => {
    try {
        const { project_id, project_name, steps_completed, form_data, timestamp } = req.body;
        
        // Simple usage tracking - could be expanded with more detailed analytics
        console.log(`📊 Usage tracked for v6 tool: ${project_name} (${steps_completed} steps completed)`);
        
        // In a production system, you might want to:
        // 1. Store usage metrics in a separate analytics table
        // 2. Aggregate data for reporting
        // 3. Track user sessions, geographic data, etc.
        
        res.json({
            success: true,
            message: 'Usage tracked successfully'
        });

    } catch (error) {
        console.error('Usage tracking error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track usage'
        });
    }
});

// Export router
// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Create project with complete structure (used by both old and new flows)
 */
async function createProjectWithStructure(user_id, projectStructure, expertType, res, pool) {
    try {
        // Generate clean subdomain
        const generateSubdomain = (projectName) => {
            return projectName
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '') // Remove special characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-') // Replace multiple hyphens with single
                .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
                .slice(0, 50); // Allow longer names for better SEO
        };
        
        // Check if subdomain is already taken
        const checkSubdomainAvailable = async (subdomain) => {
            const result = await pool.query(
                'SELECT id FROM projects_v6 WHERE subdomain = $1 AND deployed = true',
                [subdomain]
            );
            return result.rows.length === 0;
        };

        // Create project first to get ID, then update with proper subdomain
        const projectQuery = `
            INSERT INTO projects_v6 
            (user_id, name, description, ai_role, ai_persona_description, system_prompt, 
             subdomain, header_title, header_subtitle)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        
        const projectResult = await pool.query(projectQuery, [
            user_id,
            projectStructure.project_name,
            projectStructure.project_description,
            expertType,
            projectStructure.ai_persona_description,
            projectStructure.system_prompt,
            null, // subdomain will be set after validation
            projectStructure.header_title,
            projectStructure.header_subtitle
        ]);
        
        const project = projectResult.rows[0];
        
        // Generate and check subdomain availability
        const baseSubdomain = generateSubdomain(project.name);
        const isAvailable = await checkSubdomainAvailable(baseSubdomain);
        
        if (!isAvailable) {
            // Delete the created project since subdomain is taken
            await pool.query('DELETE FROM projects_v6 WHERE id = $1', [project.id]);
            return res.status(409).json({
                success: false,
                error: `Subdomain '${baseSubdomain}' is already taken. Please choose a different project name.`,
                suggested_names: [
                    `${project.name} Pro`,
                    `${project.name} Plus`,
                    `${project.name} Advanced`,
                    `My ${project.name}`,
                    `Custom ${project.name}`
                ]
            });
        }
        
        // Update subdomain
        await pool.query('UPDATE projects_v6 SET subdomain = $1 WHERE id = $2', [baseSubdomain, project.id]);
        project.subdomain = baseSubdomain;

        console.log(`📋 Creating ${projectStructure.steps.length} steps...`);
        
        // Create steps and fields
        for (let stepIndex = 0; stepIndex < projectStructure.steps.length; stepIndex++) {
            const stepData = projectStructure.steps[stepIndex];
            console.log(`📋 Creating step ${stepIndex + 1}: ${stepData.name}`);
            
            // Create step
            const stepQuery = `
                INSERT INTO project_steps_v6 
                (project_id, name, description, step_order, page_title, page_subtitle)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            
            const stepResult = await pool.query(stepQuery, [
                project.id,
                stepData.name,
                stepData.description || stepData.page_subtitle || '',
                stepIndex + 1,
                stepData.page_title || stepData.name,
                stepData.page_subtitle || ''
            ]);
            
            const step = stepResult.rows[0];
            
            console.log(`📋 Created step: ${step.name} (${step.id})`);
            
            // Create fields for this step
            console.log(`📋 Creating ${stepData.fields?.length || 0} fields for step: ${stepData.name}`);
            for (let fieldIndex = 0; fieldIndex < (stepData.fields?.length || 0); fieldIndex++) {
                const fieldData = stepData.fields[fieldIndex];
                console.log(`📋 Creating field ${fieldIndex + 1}: ${fieldData.name} (${fieldData.type})`);
                
                const fieldQuery = `
                    INSERT INTO project_fields_v6 
                    (step_id, name, label, field_type, placeholder, description, is_required, field_order)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                `;
                
                const fieldResult = await pool.query(fieldQuery, [
                    step.id,
                    fieldData.name,
                    fieldData.label,
                    fieldData.type,
                    fieldData.placeholder || null,
                    fieldData.description || null,
                    fieldData.required || false,
                    fieldIndex + 1
                ]);
                
                const field = fieldResult.rows[0];
                
                // Create choices for select/checkbox/radio fields
                if (['select', 'checkbox', 'radio'].includes(fieldData.type) && fieldData.options) {
                    console.log(`📋 Creating ${fieldData.options.length} choices for field: ${fieldData.name}`);
                    for (let choiceIndex = 0; choiceIndex < fieldData.options.length; choiceIndex++) {
                        const choiceValue = fieldData.options[choiceIndex];
                        
                        const choiceQuery = `
                            INSERT INTO project_choices_v6 
                            (field_id, value, label, choice_order)
                            VALUES ($1, $2, $3, $4)
                        `;
                        
                        await pool.query(choiceQuery, [
                            field.id,
                            choiceValue,
                            choiceValue,
                            choiceIndex + 1
                        ]);
                    }
                }
            }
        }
        
        console.log(`✅ Created project: ${project.name} (${project.id})`);
        
        res.json({
            success: true,
            project: project,
            message: 'Project created successfully with refined structure'
        });
        
    } catch (error) {
        console.error('Error creating project with structure:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create project structure'
        });
    }
}

module.exports = router;