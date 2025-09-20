// ========================================
// PROMPT ENGINEER v2.0.0rc - Universal Tool Creator API
// ========================================

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const verifyAuth = require('../middleware/auth');
const { validateInput } = require('../middleware/validation');
const UniversalGenerator = require('../services/universalGenerator');
const CalculationEngine = require('../services/calculationEngine');
const PermissionManager = require('../services/permissionManager');
const FieldRecommendationService = require('../services/fieldRecommendationService');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ========================================
// UNIVERSAL TOOL CREATION ENDPOINTS
// ========================================

/**
 * POST /api/v2/prompt-engineer/analyze-request
 * Analyzes user's tool request and returns AI suggestions
 */
router.post('/analyze-request', verifyAuth, async (req, res) => {
    try {
        const { description, toolType, targetAudience, complexity } = req.body;
        const userId = req.user.userId;

        // Log AI generation request
        await pool.query(
            `INSERT INTO ai_generation_logs (user_id, generation_type, prompt_used, created_at)
             VALUES ($1, 'tool_analysis', $2, NOW())`,
            [userId, description]
        );

        // Use AI to analyze the request
        const generator = new UniversalGenerator();
        const analysis = await generator.analyzeToolRequest({
            description,
            toolType: toolType || 'auto-detect',
            targetAudience,
            complexity: complexity || 'auto'
        });

        // Get template suggestions
        const templates = await pool.query(
            `SELECT * FROM tool_templates 
             WHERE category = $1 OR $2 = 'auto-detect'
             ORDER BY complexity_level ASC`,
            [analysis.suggestedCategory, toolType]
        );

        res.json({
            success: true,
            data: {
                analysis,
                suggestedTemplates: templates.rows,
                estimatedComplexity: analysis.complexity,
                fieldSuggestions: analysis.suggestedFields,
                calculationType: analysis.calculationType
            }
        });

    } catch (error) {
        console.error('Tool analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze tool request'
        });
    }
});

/**
 * POST /api/v2/prompt-engineer/create-project
 * Creates a new project with AI-powered configuration
 */
router.post('/create-project', verifyAuth, validateInput('createProject'), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            name,
            description,
            toolType,
            aiRole,
            aiPersona,
            systemPrompt,
            templateId,
            enableCalculations,
            accessLevel
        } = req.body;
        
        const userId = req.user.userId;
        const projectId = uuidv4();
        const subdomain = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Check subdomain availability
        const subdomainCheck = await client.query(
            'SELECT id FROM projects_v6 WHERE subdomain = $1',
            [subdomain]
        );

        if (subdomainCheck.rows.length > 0) {
            throw new Error('Subdomain already exists');
        }

        // Create the project
        const projectResult = await client.query(
            `INSERT INTO projects_v6 (
                id, user_id, name, description, tool_type,
                ai_role, ai_persona_description, system_prompt,
                template_id, calculation_enabled, access_level,
                subdomain, version, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
            RETURNING *`,
            [
                projectId, userId, name, description, toolType,
                aiRole, aiPersona, systemPrompt,
                templateId, enableCalculations, accessLevel,
                subdomain, '2.0.0'
            ]
        );

        // If template is provided, generate initial structure
        if (templateId) {
            const template = await client.query(
                'SELECT * FROM tool_templates WHERE id = $1',
                [templateId]
            );

            if (template.rows.length > 0) {
                const generator = new UniversalGenerator();
                const structure = await generator.generateToolStructure({
                    template: template.rows[0],
                    projectConfig: projectResult.rows[0]
                });

                // Create steps and fields based on AI generation
                for (const step of structure.steps) {
                    const stepId = uuidv4();
                    
                    await client.query(
                        `INSERT INTO project_steps_v6 (
                            id, project_id, name, description,
                            step_order, page_title, page_subtitle,
                            completion_required, progress_weight
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [
                            stepId, projectId, step.name, step.description,
                            step.order, step.title, step.subtitle,
                            step.required, step.weight
                        ]
                    );

                    // Create fields for this step
                    for (const field of step.fields) {
                        const fieldId = uuidv4();
                        
                        await client.query(
                            `INSERT INTO project_fields_v6 (
                                id, step_id, name, label, field_type,
                                placeholder, description, is_required,
                                field_order, weight_in_calculation,
                                ai_generated, required_package_id,
                                help_text, validation_rules
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                            [
                                fieldId, stepId, field.name, field.label,
                                field.type, field.placeholder, field.description,
                                field.required, field.order, field.weight,
                                true, field.packageId, field.helpText,
                                JSON.stringify(field.validation)
                            ]
                        );

                        // Create choices if applicable
                        if (field.choices && field.choices.length > 0) {
                            for (const choice of field.choices) {
                                await client.query(
                                    `INSERT INTO project_choices_v6 (
                                        id, field_id, choice_text, choice_value,
                                        choice_order, probability_weight,
                                        outcome_contribution, explanation_text
                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                                    [
                                        uuidv4(), fieldId, choice.text, choice.value,
                                        choice.order, choice.weight,
                                        JSON.stringify(choice.outcomes),
                                        choice.explanation
                                    ]
                                );
                            }
                        }

                        // Set field permissions if premium
                        if (field.isPremium) {
                            const premiumPackage = await client.query(
                                'SELECT id FROM packages WHERE name = $1',
                                ['premium']
                            );

                            if (premiumPackage.rows.length > 0) {
                                await client.query(
                                    `INSERT INTO field_permissions (
                                        field_id, package_id, access_level,
                                        upgrade_prompt
                                    ) VALUES ($1, $2, $3, $4)`,
                                    [
                                        fieldId, premiumPackage.rows[0].id,
                                        'premium',
                                        'Unlock this advanced feature with a premium subscription'
                                    ]
                                );
                            }
                        }
                    }
                }

                // Create calculation rules if enabled
                if (enableCalculations) {
                    const calculationEngine = new CalculationEngine();
                    const rules = await calculationEngine.generateRules({
                        projectId,
                        toolType,
                        fields: structure.fields
                    });

                    await client.query(
                        `INSERT INTO calculation_rules (
                            id, project_id, rule_name, rule_type,
                            base_score, score_ranges, factor_weights,
                            outcome_mapping
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            uuidv4(), projectId, rules.name, rules.type,
                            rules.baseScore, JSON.stringify(rules.ranges),
                            JSON.stringify(rules.weights),
                            JSON.stringify(rules.outcomes)
                        ]
                    );
                }
            }
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            data: {
                project: projectResult.rows[0],
                message: 'Project created successfully with AI-generated structure'
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Project creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create project'
        });
    } finally {
        client.release();
    }
});

/**
 * GET /api/v2/prompt-engineer/projects/:projectId/field-permissions
 * Get field permissions for a project
 */
router.get('/projects/:projectId/field-permissions', verifyAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.userId;

        // Verify ownership
        const ownership = await pool.query(
            'SELECT * FROM projects_v6 WHERE id = $1 AND user_id = $2',
            [projectId, userId]
        );

        if (ownership.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Get all fields with permissions
        const fields = await pool.query(
            `SELECT 
                pf.*,
                fp.package_id,
                fp.access_level,
                fp.upgrade_prompt,
                p.name as package_name,
                p.display_name as package_display_name
             FROM project_fields_v6 pf
             JOIN project_steps_v6 ps ON pf.step_id = ps.id
             LEFT JOIN field_permissions fp ON pf.id = fp.field_id
             LEFT JOIN packages p ON fp.package_id = p.id
             WHERE ps.project_id = $1
             ORDER BY ps.step_order, pf.field_order`,
            [projectId]
        );

        res.json({
            success: true,
            data: fields.rows
        });

    } catch (error) {
        console.error('Field permissions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve field permissions'
        });
    }
});

/**
 * PUT /api/v2/prompt-engineer/fields/:fieldId/permissions
 * Update field permission settings
 */
router.put('/fields/:fieldId/permissions', verifyAuth, async (req, res) => {
    try {
        const { fieldId } = req.params;
        const { packageId, accessLevel, upgradePrompt } = req.body;
        const userId = req.user.userId;

        // Verify ownership through field -> step -> project chain
        const ownership = await pool.query(
            `SELECT p.user_id 
             FROM project_fields_v6 pf
             JOIN project_steps_v6 ps ON pf.step_id = ps.id
             JOIN projects_v6 p ON ps.project_id = p.id
             WHERE pf.id = $1`,
            [fieldId]
        );

        if (ownership.rows.length === 0 || ownership.rows[0].user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Update or insert permission
        const result = await pool.query(
            `INSERT INTO field_permissions (
                id, field_id, package_id, access_level, upgrade_prompt
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (field_id, package_id) 
            DO UPDATE SET 
                access_level = EXCLUDED.access_level,
                upgrade_prompt = EXCLUDED.upgrade_prompt
            RETURNING *`,
            [uuidv4(), fieldId, packageId, accessLevel, upgradePrompt]
        );

        // Update field premium status
        await pool.query(
            'UPDATE project_fields_v6 SET is_premium = $1, required_package_id = $2 WHERE id = $3',
            [accessLevel !== 'free', packageId, fieldId]
        );

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Permission update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update field permissions'
        });
    }
});

/**
 * POST /api/v2/prompt-engineer/projects/:projectId/generate-fields
 * Generate AI-powered field recommendations
 */
router.post('/projects/:projectId/generate-fields', verifyAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { stepId, context, count } = req.body;
        const userId = req.user.userId;

        // Verify ownership
        const project = await pool.query(
            'SELECT * FROM projects_v6 WHERE id = $1 AND user_id = $2',
            [projectId, userId]
        );

        if (project.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Generate field recommendations
        const generator = new UniversalGenerator();
        const recommendations = await generator.generateFieldRecommendations({
            project: project.rows[0],
            stepId,
            context,
            requestedCount: count || 5
        });

        // Log AI generation
        await pool.query(
            `INSERT INTO ai_generation_logs (
                user_id, project_id, generation_type,
                prompt_used, response_metadata, success
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                userId, projectId, 'field',
                context, JSON.stringify(recommendations),
                true
            ]
        );

        res.json({
            success: true,
            data: {
                recommendations,
                message: `Generated ${recommendations.length} field recommendations`
            }
        });

    } catch (error) {
        console.error('Field generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate field recommendations'
        });
    }
});

/**
 * POST /api/v2/prompt-engineer/projects/:projectId/calculate
 * Run calculations for assessment tools
 */
router.post('/projects/:projectId/calculate', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { responses, userPackageId } = req.body;

        // Get project and calculation rules
        const project = await pool.query(
            `SELECT p.*, cr.* 
             FROM projects_v6 p
             LEFT JOIN calculation_rules cr ON p.calculation_rule_id = cr.id
             WHERE p.id = $1`,
            [projectId]
        );

        if (project.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Initialize calculation engine
        const calculationEngine = new CalculationEngine();
        const permissionManager = new PermissionManager();

        // Filter responses based on user permissions
        const accessibleResponses = await permissionManager.filterResponsesByPermission({
            responses,
            userPackageId,
            projectId
        });

        // Perform calculation
        const result = await calculationEngine.calculate({
            project: project.rows[0],
            responses: accessibleResponses,
            includeUpgradePrompts: !userPackageId || userPackageId === 'free'
        });

        // Log analytics
        await pool.query(
            `INSERT INTO tool_analytics_v2 (
                project_id, session_id, fields_completed,
                calculation_result, upgrade_prompts_shown,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                projectId,
                req.session?.id || uuidv4(),
                JSON.stringify(accessibleResponses),
                JSON.stringify(result),
                result.upgradePrompts?.length || 0
            ]
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Calculation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate results'
        });
    }
});

/**
 * GET /api/v2/prompt-engineer/templates
 * Get available tool templates
 */
router.get('/templates', verifyAuth, async (req, res) => {
    try {
        const { category, complexity } = req.query;
        
        let query = 'SELECT * FROM tool_templates WHERE 1=1';
        const params = [];
        
        if (category) {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }
        
        if (complexity) {
            params.push(complexity);
            query += ` AND complexity_level <= $${params.length}`;
        }
        
        query += ' ORDER BY category, complexity_level';
        
        const templates = await pool.query(query, params);
        
        res.json({
            success: true,
            data: templates.rows
        });
        
    } catch (error) {
        console.error('Templates retrieval error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve templates'
        });
    }
});

/**
 * POST /api/v2/prompt-engineer/projects/:projectId/deploy
 * Deploy project with enhanced features
 */
router.post('/projects/:projectId/deploy', verifyAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.userId;

        // Verify ownership and get project details
        const project = await pool.query(
            `SELECT p.*, 
                    COUNT(DISTINCT ps.id) as step_count,
                    COUNT(DISTINCT pf.id) as field_count
             FROM projects_v6 p
             LEFT JOIN project_steps_v6 ps ON p.id = ps.project_id
             LEFT JOIN project_fields_v6 pf ON ps.id = pf.step_id
             WHERE p.id = $1 AND p.user_id = $2
             GROUP BY p.id`,
            [projectId, userId]
        );

        if (project.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const projectData = project.rows[0];

        // Generate deployment files
        const generator = new UniversalGenerator();
        const deploymentFiles = await generator.generateDeploymentFiles({
            project: projectData,
            includeCalculations: projectData.calculation_enabled,
            includePermissions: true,
            version: '2.0.0'
        });

        // Update project deployment status
        await pool.query(
            `UPDATE projects_v6 
             SET deployed = true, 
                 enabled = true,
                 is_published = true,
                 published_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [projectId]
        );

        res.json({
            success: true,
            data: {
                subdomain: projectData.subdomain,
                url: `https://${projectData.subdomain}.tool.prompt-machine.com`,
                files: deploymentFiles,
                message: 'Project deployed successfully'
            }
        });

    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to deploy project'
        });
    }
});

/**
 * GET /api/v2/prompt-engineer/projects/:projectId/analytics
 * Get enhanced analytics for a project
 */
router.get('/projects/:projectId/analytics', verifyAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { startDate, endDate } = req.query;
        const userId = req.user.userId;

        // Verify ownership
        const ownership = await pool.query(
            'SELECT * FROM projects_v6 WHERE id = $1 AND user_id = $2',
            [projectId, userId]
        );

        if (ownership.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Get analytics data
        let analyticsQuery = `
            SELECT 
                COUNT(DISTINCT session_id) as total_sessions,
                COUNT(DISTINCT user_id) as unique_users,
                AVG(time_spent_seconds) as avg_time_spent,
                SUM(upgrade_prompts_shown) as total_upgrade_prompts,
                COUNT(CASE WHEN upgrade_clicked = true THEN 1 END) as upgrade_conversions,
                COUNT(*) as total_submissions,
                DATE(created_at) as date
            FROM tool_analytics_v2
            WHERE project_id = $1
        `;

        const params = [projectId];

        if (startDate) {
            params.push(startDate);
            analyticsQuery += ` AND created_at >= $${params.length}`;
        }

        if (endDate) {
            params.push(endDate);
            analyticsQuery += ` AND created_at <= $${params.length}`;
        }

        analyticsQuery += ' GROUP BY DATE(created_at) ORDER BY date DESC';

        const analytics = await pool.query(analyticsQuery, params);

        // Get field-level analytics
        const fieldAnalytics = await pool.query(
            `SELECT 
                pf.name as field_name,
                pf.label as field_label,
                COUNT(*) as times_completed,
                AVG((ta.fields_completed->pf.id->>'value')::numeric) as avg_value
             FROM project_fields_v6 pf
             JOIN project_steps_v6 ps ON pf.step_id = ps.id
             LEFT JOIN tool_analytics_v2 ta ON ps.project_id = ta.project_id
             WHERE ps.project_id = $1
             GROUP BY pf.id, pf.name, pf.label
             ORDER BY times_completed DESC`,
            [projectId]
        );

        res.json({
            success: true,
            data: {
                summary: analytics.rows,
                fieldMetrics: fieldAnalytics.rows,
                conversionRate: analytics.rows.length > 0 
                    ? (analytics.rows[0].upgrade_conversions / analytics.rows[0].total_upgrade_prompts * 100).toFixed(2)
                    : 0
            }
        });

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve analytics'
        });
    }
});

// ========================================
// BACKWARD COMPATIBILITY ENDPOINTS
// ========================================

/**
 * GET /api/v2/prompt-engineer/projects
 * List all projects (backward compatible with v6)
 */
router.get('/projects', verifyAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const projects = await pool.query(
            `SELECT p.*, 
                    COUNT(DISTINCT ps.id) as step_count,
                    COUNT(DISTINCT pf.id) as field_count,
                    tt.name as template_name,
                    tt.category as template_category
             FROM projects_v6 p
             LEFT JOIN project_steps_v6 ps ON p.id = ps.project_id
             LEFT JOIN project_fields_v6 pf ON ps.id = pf.step_id
             LEFT JOIN tool_templates tt ON p.template_id = tt.id
             WHERE p.user_id = $1
             GROUP BY p.id, tt.name, tt.category
             ORDER BY p.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: projects.rows
        });

    } catch (error) {
        console.error('Projects retrieval error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve projects'
        });
    }
});

/**
 * DELETE /api/v2/prompt-engineer/projects/:projectId
 * Delete a project (backward compatible)
 */
router.delete('/projects/:projectId', verifyAuth, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.userId;

        const result = await pool.query(
            'DELETE FROM projects_v6 WHERE id = $1 AND user_id = $2 RETURNING *',
            [projectId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found or access denied'
            });
        }

        res.json({
            success: true,
            message: 'Project deleted successfully'
        });

    } catch (error) {
        console.error('Project deletion error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete project'
        });
    }
});

module.exports = router;
