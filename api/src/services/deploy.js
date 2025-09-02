const { Pool } = require('pg');
const toolGenerator = require('./toolGenerator');
const fs = require('fs').promises;
const path = require('path');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

/**
 * Deployment Service
 * Handles deployment of AI tools to the file system and URL routing
 */
class DeploymentService {
    constructor() {
        this.deployedToolsPath = path.join(process.cwd(), '..', 'deployed-tools');
        this.baseUrl = process.env.APP_URL || 'https://app.prompt-machine.com';
    }

    /**
     * Deploy a project as an AI tool
     * @param {string} projectId - Project UUID
     * @param {string} userId - User UUID for verification
     * @returns {Object} - Deployment result with URL and metadata
     */
    async deployProject(projectId, userId) {
        try {
            console.log(`🚀 Starting deployment for project: ${projectId}`);

            // Get project details and verify ownership
            const projectResult = await pool.query(
                'SELECT id, name, slug, subdomain, user_id FROM projects WHERE id = $1 AND user_id = $2',
                [projectId, userId]
            );

            if (projectResult.rows.length === 0) {
                throw new Error('Project not found or access denied');
            }

            const project = projectResult.rows[0];
            console.log(`📋 Found project: ${project.name} (${project.slug})`);

            // Get active prompt for the project
            const promptResult = await pool.query(
                'SELECT id, system_prompt, fields FROM prompts WHERE project_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
                [projectId]
            );

            if (promptResult.rows.length === 0) {
                throw new Error('No active prompt found for this project. Please create a prompt first using the prompt builder.');
            }

            const prompt = promptResult.rows[0];
            console.log(`💭 Found active prompt for project`);

            // Generate tool files
            console.log(`🛠️ Generating tool files...`);
            const toolContent = toolGenerator.generateTool(project, prompt);

            // Save tool to file system  
            const deploymentSlug = project.subdomain || project.slug;
            const toolPath = await toolGenerator.saveToolToFiles(deploymentSlug, toolContent);
            console.log(`💾 Tool files saved to: ${toolPath}`);

            // Update project deployment status in database
            await pool.query(
                'UPDATE projects SET is_deployed = true, deployed_at = CURRENT_TIMESTAMP WHERE id = $1',
                [projectId]
            );

            // Create deployment record (for tracking)
            const deploymentResult = await pool.query(
                `INSERT INTO deployments (project_id, slug, deployed_path, deployed_url, status) 
                 VALUES ($1, $2, $3, $4, 'active') 
                 RETURNING id, deployed_url, created_at`,
                [
                    projectId, 
                    deploymentSlug, 
                    toolPath,
                    `https://${deploymentSlug}.tool.prompt-machine.com`
                ]
            );

            const deployment = deploymentResult.rows[0];

            console.log(`✅ Deployment completed successfully!`);

            return {
                success: true,
                project: {
                    id: project.id,
                    name: project.name,
                    slug: project.slug
                },
                deployment: {
                    id: deployment.id,
                    url: deployment.deployed_url,
                    path: toolPath,
                    deployed_at: deployment.created_at
                },
                prompt: {
                    system_prompt: prompt.system_prompt,
                    fields: prompt.fields
                },
                files_generated: [
                    'index.html',
                    'style.css', 
                    'app.js'
                ]
            };

        } catch (error) {
            console.error('❌ Deployment failed:', error.message);
            
            // Log deployment failure
            try {
                await pool.query(
                    `INSERT INTO deployment_logs (project_id, action, status, error_message) 
                     VALUES ($1, 'deploy', 'failed', $2)`,
                    [projectId, error.message]
                );
            } catch (logError) {
                console.error('Failed to log deployment error:', logError.message);
            }

            throw error;
        }
    }

    /**
     * Get deployment status for a project
     * @param {string} projectId - Project UUID
     * @param {string} userId - User UUID for verification
     * @returns {Object} - Deployment status and details
     */
    async getDeploymentStatus(projectId, userId) {
        try {
            const result = await pool.query(
                `SELECT 
                    p.id, p.name, p.slug, p.is_deployed, p.deployed_at,
                    d.id as deployment_id, d.deployed_url, d.status,
                    pr.id as prompt_id
                 FROM projects p
                 LEFT JOIN deployments d ON p.id = d.project_id AND d.status = 'active'
                 LEFT JOIN prompts pr ON p.id = pr.project_id AND pr.is_active = true
                 WHERE p.id = $1 AND p.user_id = $2`,
                [projectId, userId]
            );

            if (result.rows.length === 0) {
                throw new Error('Project not found');
            }

            const project = result.rows[0];

            return {
                project: {
                    id: project.id,
                    name: project.name,
                    slug: project.slug,
                    is_deployed: project.is_deployed,
                    deployed_at: project.deployed_at
                },
                deployment: project.deployment_id ? {
                    id: project.deployment_id,
                    url: project.deployed_url,
                    status: project.status
                } : null,
                has_prompt: !!project.prompt_id,
                ready_to_deploy: !!project.prompt_id && !project.is_deployed
            };

        } catch (error) {
            console.error('Get deployment status error:', error);
            throw error;
        }
    }

    /**
     * Undeploy a project (remove from file system)
     * @param {string} projectId - Project UUID
     * @param {string} userId - User UUID for verification
     * @returns {Object} - Undeployment result
     */
    async undeployProject(projectId, userId) {
        try {
            console.log(`🗑️ Starting undeployment for project: ${projectId}`);

            // Get project and verify ownership
            const projectResult = await pool.query(
                'SELECT id, name, slug FROM projects WHERE id = $1 AND user_id = $2 AND is_deployed = true',
                [projectId, userId]
            );

            if (projectResult.rows.length === 0) {
                throw new Error('Project not found or not deployed');
            }

            const project = projectResult.rows[0];
            const toolPath = path.join(this.deployedToolsPath, project.slug);

            // Remove tool files from file system
            try {
                await fs.rm(toolPath, { recursive: true, force: true });
                console.log(`🗂️ Removed tool files from: ${toolPath}`);
            } catch (fsError) {
                console.warn(`Warning: Could not remove files at ${toolPath}:`, fsError.message);
            }

            // Update database
            await pool.query(
                'UPDATE projects SET is_deployed = false, deployed_at = NULL WHERE id = $1',
                [projectId]
            );

            await pool.query(
                'UPDATE deployments SET status = \'inactive\', updated_at = CURRENT_TIMESTAMP WHERE project_id = $1 AND status = \'active\'',
                [projectId]
            );

            console.log(`✅ Undeployment completed successfully`);

            return {
                success: true,
                project: {
                    id: project.id,
                    name: project.name,
                    slug: project.slug
                },
                message: 'Project undeployed successfully'
            };

        } catch (error) {
            console.error('❌ Undeployment failed:', error.message);
            throw error;
        }
    }

    /**
     * List all deployments for a user
     * @param {string} userId - User UUID
     * @returns {Array} - List of user's deployments
     */
    async getUserDeployments(userId) {
        try {
            const result = await pool.query(
                `SELECT 
                    p.id, p.name, p.slug, p.is_deployed, p.deployed_at,
                    d.deployed_url, d.status,
                    COUNT(ul.id) as usage_count
                 FROM projects p
                 LEFT JOIN deployments d ON p.id = d.project_id AND d.status = 'active'
                 LEFT JOIN usage_logs ul ON p.id = ul.project_id
                 WHERE p.user_id = $1 AND p.is_deployed = true
                 GROUP BY p.id, p.name, p.slug, p.is_deployed, p.deployed_at, d.deployed_url, d.status
                 ORDER BY p.deployed_at DESC`,
                [userId]
            );

            return result.rows.map(row => ({
                project: {
                    id: row.id,
                    name: row.name,
                    slug: row.slug,
                    deployed_at: row.deployed_at
                },
                deployment: {
                    url: row.deployed_url,
                    status: row.status
                },
                usage: {
                    total_uses: parseInt(row.usage_count) || 0
                }
            }));

        } catch (error) {
            console.error('Get user deployments error:', error);
            throw error;
        }
    }

    /**
     * Check if deployed tool files exist
     * @param {string} projectSlug - Project slug
     * @returns {boolean} - Whether tool files exist
     */
    async toolFilesExist(projectSlug) {
        try {
            const toolPath = path.join(this.deployedToolsPath, projectSlug);
            const indexPath = path.join(toolPath, 'index.html');
            
            await fs.access(indexPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Create deployments table if it doesn't exist
     * This is a helper method for MVP setup
     */
    async ensureDeploymentTables() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS deployments (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                    slug VARCHAR(255) NOT NULL,
                    deployed_path TEXT,
                    deployed_url TEXT,
                    status VARCHAR(20) DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON deployments(project_id);
                CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS deployment_logs (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                    action VARCHAR(50),
                    status VARCHAR(20),
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Add deployment columns to projects table if they don't exist
            await pool.query(`
                ALTER TABLE projects 
                ADD COLUMN IF NOT EXISTS is_deployed BOOLEAN DEFAULT false,
                ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMP;
            `);

            console.log('✅ Deployment tables ensured');

        } catch (error) {
            console.error('Error ensuring deployment tables:', error);
            throw error;
        }
    }
}

module.exports = new DeploymentService();