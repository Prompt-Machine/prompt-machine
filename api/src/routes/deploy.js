const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const deploymentService = require('../services/deploy');
const claudeService = require('../services/claude');

const router = express.Router();

// Ensure deployment tables exist on module load
deploymentService.ensureDeploymentTables().catch(err => {
    console.error('Failed to ensure deployment tables:', err);
});

// POST /api/deploy/:projectId - Deploy a project as an AI tool
router.post('/:projectId', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.projectId;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        console.log(`🚀 Deploy request received for project: ${projectId}`);

        // Deploy the project
        const result = await deploymentService.deployProject(projectId, req.user.id);

        res.json({
            success: true,
            message: 'Project deployed successfully!',
            project: result.project,
            deployment: result.deployment,
            url: result.deployment.url,
            files: result.files_generated
        });

    } catch (error) {
        console.error('Deploy project error:', error);
        
        if (error.message.includes('not found') || error.message.includes('access denied')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('No active prompt')) {
            res.status(400).json({ 
                error: 'Cannot deploy: No active prompt found for this project. Please create a prompt using the prompt builder first.' 
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to deploy project',
                details: error.message
            });
        }
    }
});

// DELETE /api/deploy/:projectId - Undeploy a project
router.delete('/:projectId', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.projectId;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        console.log(`🗑️ Undeploy request received for project: ${projectId}`);

        // Undeploy the project
        const result = await deploymentService.undeployProject(projectId, req.user.id);

        res.json({
            success: true,
            message: result.message,
            project: result.project
        });

    } catch (error) {
        console.error('Undeploy project error:', error);
        
        if (error.message.includes('not found') || error.message.includes('not deployed')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ 
                error: 'Failed to undeploy project',
                details: error.message
            });
        }
    }
});

// GET /api/deploy/:projectId/status - Get deployment status for a project
router.get('/:projectId/status', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.projectId;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        // Get deployment status
        const status = await deploymentService.getDeploymentStatus(projectId, req.user.id);

        res.json(status);

    } catch (error) {
        console.error('Get deployment status error:', error);
        
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ 
                error: 'Failed to get deployment status' 
            });
        }
    }
});

// GET /api/deploy/list - List all deployments for authenticated user
router.get('/list', authenticateToken, async (req, res) => {
    try {
        const deployments = await deploymentService.getUserDeployments(req.user.id);

        res.json({
            deployments,
            total: deployments.length
        });

    } catch (error) {
        console.error('List deployments error:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve deployments' 
        });
    }
});


module.exports = router;