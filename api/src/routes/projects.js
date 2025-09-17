const express = require('express');
const { Pool } = require('pg');
const { verifyAuth } = require('../middleware/auth');

const router = express.Router();

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Helper function to generate URL-friendly slug from project name
function generateSlug(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

// GET /api/projects/user-tools - Get user's tools with analytics
router.get('/user-tools', verifyAuth, async (req, res) => {
    try {
        // Get user's projects from projects_v6 table
        const projectsResult = await pool.query(`
            SELECT 
                p.id,
                p.name,
                p.description,
                p.subdomain,
                p.deployed,
                p.enabled,
                p.created_at,
                p.updated_at
            FROM projects_v6 p
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
        `, [req.user.id]);

        const projects = projectsResult.rows;

        // Get analytics data for each project
        const projectsWithAnalytics = await Promise.all(
            projects.map(async (project) => {
                try {
                    const analyticsResult = await pool.query(`
                        SELECT 
                            COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
                            COUNT(CASE WHEN event_type = 'form_complete' THEN 1 END) as completions,
                            COUNT(DISTINCT session_id) as unique_sessions
                        FROM tool_analytics_v6 
                        WHERE project_id = $1
                    `, [project.id]);

                    const analytics = analyticsResult.rows[0] || {
                        views: 0,
                        completions: 0,
                        unique_sessions: 0
                    };

                    return {
                        ...project,
                        analytics: {
                            views: parseInt(analytics.views) || 0,
                            completions: parseInt(analytics.completions) || 0,
                            uniqueSessions: parseInt(analytics.unique_sessions) || 0
                        }
                    };
                } catch (analyticsError) {
                    console.error(`Analytics error for project ${project.id}:`, analyticsError);
                    return {
                        ...project,
                        analytics: { views: 0, completions: 0, uniqueSessions: 0 }
                    };
                }
            })
        );

        res.json({
            success: true,
            tools: projectsWithAnalytics
        });

    } catch (error) {
        console.error('Get user tools error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to retrieve user tools' 
        });
    }
});

// GET /api/projects - List all projects for authenticated user
router.get('/', verifyAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                p.id, 
                p.name, 
                p.slug, 
                p.created_at,
                COUNT(pr.id) as prompt_count,
                CASE WHEN pr.id IS NOT NULL THEN true ELSE false END as has_prompt
             FROM projects p 
             LEFT JOIN prompts pr ON p.id = pr.project_id AND pr.is_active = true
             WHERE p.user_id = $1 
             GROUP BY p.id, p.name, p.slug, p.created_at, pr.id
             ORDER BY p.created_at DESC`,
            [req.user.id]
        );

        res.json({
            projects: result.rows.map(project => ({
                id: project.id,
                name: project.name,
                slug: project.slug,
                created_at: project.created_at,
                prompt_count: parseInt(project.prompt_count),
                has_prompt: project.has_prompt,
                is_deployed: false, // Will implement deployment tracking later
                usage_count: 0 // Will implement usage tracking later
            }))
        });

    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve projects' 
        });
    }
});

// POST /api/projects - Create new project
router.post('/', verifyAuth, async (req, res) => {
    try {
        const { name, description } = req.body;

        // Validate input
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Project name is required' 
            });
        }

        if (name.length > 255) {
            return res.status(400).json({ 
                error: 'Project name must be less than 255 characters' 
            });
        }

        // Generate unique slug
        let baseSlug = generateSlug(name);
        let slug = baseSlug;
        let counter = 1;

        // Check if slug exists and make it unique
        while (true) {
            const slugCheck = await pool.query(
                'SELECT id FROM projects WHERE slug = $1',
                [slug]
            );

            if (slugCheck.rows.length === 0) {
                break; // Slug is unique
            }

            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        // Insert new project
        const result = await pool.query(
            `INSERT INTO projects (user_id, name, slug) 
             VALUES ($1, $2, $3) 
             RETURNING id, name, slug, created_at`,
            [req.user.id, name.trim(), slug]
        );

        const newProject = result.rows[0];

        res.status(201).json({
            project: {
                id: newProject.id,
                user_id: req.user.id,
                name: newProject.name,
                slug: newProject.slug,
                created_at: newProject.created_at,
                prompt_count: 0,
                has_prompt: false,
                is_deployed: false,
                usage_count: 0
            }
        });

    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ 
            error: 'Failed to create project' 
        });
    }
});

// GET /api/projects/:id - Get single project
router.get('/:id', verifyAuth, async (req, res) => {
    try {
        const projectId = req.params.id;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        const result = await pool.query(
            `SELECT 
                p.id, 
                p.user_id,
                p.name, 
                p.slug, 
                p.subdomain,
                p.created_at,
                pr.id as prompt_id,
                pr.system_prompt,
                pr.fields,
                pr.is_active as prompt_active
             FROM projects p 
             LEFT JOIN prompts pr ON p.id = pr.project_id AND pr.is_active = true
             WHERE p.id = $1 AND p.user_id = $2`,
            [projectId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Project not found' 
            });
        }

        const project = result.rows[0];

        res.json({
            project: {
                id: project.id,
                user_id: project.user_id,
                name: project.name,
                slug: project.slug,
                subdomain: project.subdomain,
                created_at: project.created_at,
                prompt: project.prompt_id ? {
                    id: project.prompt_id,
                    system_prompt: project.system_prompt,
                    fields: project.fields,
                    is_active: project.prompt_active
                } : null,
                is_deployed: false, // Will implement later
                usage_count: 0 // Will implement later
            }
        });

    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve project' 
        });
    }
});

// PUT /api/projects/:id - Update project
router.put('/:id', verifyAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const { name, subdomain } = req.body;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        // Validate input
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Project name is required' 
            });
        }

        if (name.length > 255) {
            return res.status(400).json({ 
                error: 'Project name must be less than 255 characters' 
            });
        }

        // Validate subdomain if provided
        if (subdomain) {
            if (typeof subdomain !== 'string' || subdomain.trim().length === 0) {
                return res.status(400).json({ 
                    error: 'Invalid subdomain format' 
                });
            }

            if (subdomain.length > 100) {
                return res.status(400).json({ 
                    error: 'Subdomain must be less than 100 characters' 
                });
            }

            // Check subdomain format (alphanumeric and hyphens only)
            const subdomainRegex = /^[a-zA-Z0-9-]+$/;
            if (!subdomainRegex.test(subdomain)) {
                return res.status(400).json({ 
                    error: 'Subdomain can only contain letters, numbers, and hyphens' 
                });
            }

            // Check if subdomain is already taken
            const subdomainCheck = await pool.query(
                'SELECT id FROM projects WHERE subdomain = $1 AND id != $2',
                [subdomain.toLowerCase(), projectId]
            );

            if (subdomainCheck.rows.length > 0) {
                return res.status(400).json({ 
                    error: 'Subdomain is already taken' 
                });
            }
        }

        // Check if project exists and belongs to user
        const existsResult = await pool.query(
            'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
            [projectId, req.user.id]
        );

        if (existsResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Project not found' 
            });
        }

        // Update project
        const updateFields = ['name = $1'];
        const updateValues = [name.trim()];
        let paramCount = 2;

        if (subdomain !== undefined) {
            updateFields.push(`subdomain = $${paramCount}`);
            updateValues.push(subdomain ? subdomain.toLowerCase() : null);
            paramCount++;
        }

        const result = await pool.query(
            `UPDATE projects 
             SET ${updateFields.join(', ')} 
             WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
             RETURNING id, name, slug, subdomain, created_at`,
            [...updateValues, projectId, req.user.id]
        );

        res.json({
            project: result.rows[0]
        });

    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ 
            error: 'Failed to update project' 
        });
    }
});

// DELETE /api/projects/:id - Delete project
router.delete('/:id', verifyAuth, async (req, res) => {
    try {
        const projectId = req.params.id;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        // Check if project exists and belongs to user
        const existsResult = await pool.query(
            'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
            [projectId, req.user.id]
        );

        if (existsResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Project not found' 
            });
        }

        // Delete related conversations first
        await pool.query(
            'DELETE FROM conversations WHERE project_id = $1',
            [projectId]
        );

        // Delete related prompts
        await pool.query(
            'DELETE FROM prompts WHERE project_id = $1',
            [projectId]
        );

        // Delete related deployments if any
        await pool.query(
            'DELETE FROM deployments WHERE project_id = $1',
            [projectId]
        );

        // Now delete the project
        await pool.query(
            'DELETE FROM projects WHERE id = $1 AND user_id = $2',
            [projectId, req.user.id]
        );

        res.json({
            message: 'Project deleted successfully'
        });

    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({ 
            error: 'Failed to delete project' 
        });
    }
});

// GET /api/projects/check-subdomain/:subdomain - Check if subdomain is available
router.get('/check-subdomain/:subdomain', verifyAuth, async (req, res) => {
    try {
        const { subdomain } = req.params;
        
        // Validate subdomain format
        if (!subdomain || subdomain.trim().length === 0) {
            return res.status(400).json({ 
                available: false,
                error: 'Subdomain is required' 
            });
        }

        if (subdomain.length > 100) {
            return res.status(400).json({ 
                available: false,
                error: 'Subdomain must be less than 100 characters' 
            });
        }

        // Check subdomain format (alphanumeric and hyphens only)
        const subdomainRegex = /^[a-zA-Z0-9-]+$/;
        if (!subdomainRegex.test(subdomain)) {
            return res.status(400).json({ 
                available: false,
                error: 'Subdomain can only contain letters, numbers, and hyphens' 
            });
        }

        // Check if subdomain is already taken
        const subdomainCheck = await pool.query(
            'SELECT id, name, user_id FROM projects WHERE subdomain = $1',
            [subdomain.toLowerCase()]
        );

        const isAvailable = subdomainCheck.rows.length === 0;
        const isOwnedByUser = subdomainCheck.rows.length > 0 && 
                             subdomainCheck.rows[0].user_id === req.user.id;

        res.json({
            available: isAvailable,
            owned_by_user: isOwnedByUser,
            subdomain: subdomain.toLowerCase(),
            suggestions: isAvailable ? [] : generateSubdomainSuggestions(subdomain)
        });

    } catch (error) {
        console.error('Check subdomain error:', error);
        res.status(500).json({ 
            available: false,
            error: 'Failed to check subdomain availability' 
        });
    }
});

// Helper function to generate subdomain suggestions
function generateSubdomainSuggestions(baseSubdomain) {
    const suggestions = [];
    
    // Add numbered variations
    for (let i = 2; i <= 5; i++) {
        suggestions.push(`${baseSubdomain}${i}`);
    }
    
    // Add common suffixes
    const suffixes = ['tool', 'ai', 'app', 'pro', 'plus'];
    suffixes.forEach(suffix => {
        if (!baseSubdomain.includes(suffix)) {
            suggestions.push(`${baseSubdomain}-${suffix}`);
        }
    });
    
    return suggestions.slice(0, 5); // Return max 5 suggestions
}

module.exports = router;