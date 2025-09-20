// ========================================
// DEPLOYMENT SERVICE
// Subdomain deployment, SSL, and CDN management
// ========================================

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');

const execPromise = util.promisify(exec);

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

class DeploymentService {
    constructor() {
        this.nginxConfigPath = '/etc/nginx/sites-available';
        this.nginxEnabledPath = '/etc/nginx/sites-enabled';
        this.deploymentPath = '/var/www/tools';
        this.sslCertPath = '/etc/letsencrypt/live';
    }

    /**
     * Deploy tool to subdomain
     */
    async deployTool(projectId, userId, deploymentType = 'production') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get project details
            const projectResult = await client.query(
                `SELECT p.*, pv.configuration 
                 FROM projects_v6 p
                 LEFT JOIN tool_versions pv ON p.id = pv.project_id AND pv.is_published = true
                 WHERE p.id = $1`,
                [projectId]
            );

            if (projectResult.rows.length === 0) {
                throw new Error('Project not found');
            }

            const project = projectResult.rows[0];

            // Generate subdomain if not exists
            let subdomain = project.subdomain;
            if (!subdomain) {
                subdomain = await this.generateSubdomain(project.name);
                await client.query(
                    'UPDATE projects_v6 SET subdomain = $1 WHERE id = $2',
                    [subdomain, projectId]
                );
            }

            // Check if subdomain is available
            const existingDeployment = await client.query(
                'SELECT id FROM tool_deployments WHERE subdomain = $1 AND project_id != $2',
                [subdomain, projectId]
            );

            if (existingDeployment.rows.length > 0) {
                throw new Error('Subdomain already in use');
            }

            // Generate version number
            const versionResult = await client.query(
                'SELECT COUNT(*) + 1 as version FROM tool_deployments WHERE project_id = $1',
                [projectId]
            );
            const version = `1.0.${versionResult.rows[0].version}`;

            // Create deployment record
            const deploymentResult = await client.query(
                `INSERT INTO tool_deployments (
                    project_id, version, subdomain, deployment_type,
                    ssl_status, health_check_url, deployed_by, deployment_log
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id`,
                [
                    projectId,
                    version,
                    subdomain,
                    deploymentType,
                    'pending',
                    `https://${subdomain}.tool.prompt-machine.ca/health`,
                    userId,
                    JSON.stringify({ status: 'initializing', timestamp: new Date() })
                ]
            );

            const deploymentId = deploymentResult.rows[0].id;

            // Create deployment files
            await this.createDeploymentFiles(project, subdomain, version);

            // Setup Nginx configuration
            const nginxConfig = await this.createNginxConfig(subdomain, project.id);
            
            // Save Nginx config to database
            await client.query(
                'UPDATE tool_deployments SET nginx_config = $1 WHERE id = $2',
                [nginxConfig, deploymentId]
            );

            // Enable Nginx site
            await this.enableNginxSite(subdomain);

            // Setup SSL certificate
            if (deploymentType === 'production') {
                await this.setupSSL(subdomain, deploymentId);
            }

            // Update deployment status
            await client.query(
                `UPDATE tool_deployments 
                 SET health_status = 'healthy',
                     ssl_status = $1,
                     deployment_log = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [
                    deploymentType === 'production' ? 'active' : 'not_required',
                    JSON.stringify({ 
                        status: 'deployed', 
                        timestamp: new Date(),
                        url: `https://${subdomain}.tool.prompt-machine.ca`
                    }),
                    deploymentId
                ]
            );

            // Update project deployment status
            await client.query(
                'UPDATE projects_v6 SET deployed = true, updated_at = NOW() WHERE id = $1',
                [projectId]
            );

            await client.query('COMMIT');

            return {
                success: true,
                deploymentId,
                url: `https://${subdomain}.tool.prompt-machine.ca`,
                version,
                subdomain
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Generate unique subdomain
     */
    async generateSubdomain(projectName) {
        // Create base subdomain from project name
        let baseSubdomain = projectName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 30);

        // Check if subdomain is available
        let subdomain = baseSubdomain;
        let counter = 1;
        
        while (true) {
            const result = await pool.query(
                'SELECT id FROM tool_deployments WHERE subdomain = $1',
                [subdomain]
            );

            if (result.rows.length === 0) {
                break;
            }

            subdomain = `${baseSubdomain}-${counter}`;
            counter++;
        }

        return subdomain;
    }

    /**
     * Create deployment files
     */
    async createDeploymentFiles(project, subdomain, version) {
        const deployPath = path.join(this.deploymentPath, subdomain);

        // Create directory
        await fs.mkdir(deployPath, { recursive: true });

        // Create index.html
        const indexHtml = this.generateToolHTML(project);
        await fs.writeFile(path.join(deployPath, 'index.html'), indexHtml);

        // Create tool.js
        const toolJs = this.generateToolJS(project);
        await fs.writeFile(path.join(deployPath, 'tool.js'), toolJs);

        // Create config.json
        const config = {
            projectId: project.id,
            version,
            apiEndpoint: process.env.API_URL || 'https://api.prompt-machine.ca',
            features: project.features || {},
            analytics: {
                enabled: true,
                trackingId: project.analytics_id
            }
        };
        await fs.writeFile(path.join(deployPath, 'config.json'), JSON.stringify(config, null, 2));

        // Copy static assets
        await this.copyStaticAssets(deployPath);
    }

    /**
     * Generate tool HTML
     */
    generateToolHTML(project) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name} | Prompt Machine</title>
    <meta name="description" content="${project.description || 'AI-powered tool created with Prompt Machine'}">
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link rel="icon" type="image/png" href="/favicon.png">
    ${project.custom_css ? `<style>${project.custom_css}</style>` : ''}
</head>
<body class="bg-gray-50">
    <div id="app" class="min-h-screen">
        <!-- Loading state -->
        <div id="loading" class="flex items-center justify-center min-h-screen">
            <div class="text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p class="mt-4 text-gray-600">Loading ${project.name}...</p>
            </div>
        </div>
        
        <!-- Tool container -->
        <div id="tool-container" class="hidden">
            <nav class="bg-white shadow-sm">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between h-16">
                        <div class="flex items-center">
                            <h1 class="text-xl font-semibold">${project.name}</h1>
                        </div>
                        <div class="flex items-center space-x-4">
                            <button id="share-btn" class="text-gray-500 hover:text-gray-700">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.032-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 3.12-9.032 7.326m0 0A9.001 9.001 0 0012 21c4.474 0 8.268-3.12 9.032-7.326"></path>
                                </svg>
                            </button>
                            <button id="reset-btn" class="text-gray-500 hover:text-gray-700">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>
            
            <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <div id="tool-content">
                        <!-- Dynamic content will be loaded here -->
                    </div>
                </div>
            </main>
        </div>
    </div>
    
    <script src="/config.json"></script>
    <script src="/tool.js"></script>
    ${project.custom_js ? `<script>${project.custom_js}</script>` : ''}
</body>
</html>`;
    }

    /**
     * Generate tool JavaScript
     */
    generateToolJS(project) {
        return `
// Tool initialization
(function() {
    const API_ENDPOINT = window.CONFIG?.apiEndpoint || 'https://api.prompt-machine.ca';
    const PROJECT_ID = '${project.id}';
    
    class PromptMachineTool {
        constructor() {
            this.projectId = PROJECT_ID;
            this.fields = ${JSON.stringify(project.fields || [])};
            this.currentStep = 0;
            this.responses = {};
            this.init();
        }
        
        init() {
            // Hide loading, show tool
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('tool-container').classList.remove('hidden');
            
            // Render initial content
            this.render();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Track page view
            this.trackEvent('page_view');
        }
        
        render() {
            const container = document.getElementById('tool-content');
            container.innerHTML = this.generateFormHTML();
            this.attachFieldListeners();
        }
        
        generateFormHTML() {
            let html = '<form id="tool-form" class="space-y-6">';
            
            this.fields.forEach((field, index) => {
                html += this.generateFieldHTML(field, index);
            });
            
            html += \`
                <div class="flex justify-end space-x-4 pt-6">
                    <button type="button" id="back-btn" class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 \${this.currentStep === 0 ? 'hidden' : ''}">
                        Back
                    </button>
                    <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                        \${this.currentStep === this.fields.length - 1 ? 'Generate' : 'Next'}
                    </button>
                </div>
            \`;
            
            html += '</form>';
            return html;
        }
        
        generateFieldHTML(field, index) {
            let html = \`<div class="field-container \${index !== this.currentStep ? 'hidden' : ''}" data-field-id="\${field.id}">\`;
            
            html += \`<label class="block text-sm font-medium text-gray-700 mb-2">\${field.label}\`;
            if (field.required) {
                html += '<span class="text-red-500 ml-1">*</span>';
            }
            html += '</label>';
            
            if (field.description) {
                html += \`<p class="text-sm text-gray-500 mb-2">\${field.description}</p>\`;
            }
            
            switch (field.type) {
                case 'text':
                    html += \`<input type="text" name="\${field.id}" class="w-full border-gray-300 rounded-md" \${field.required ? 'required' : ''}>\`;
                    break;
                case 'textarea':
                    html += \`<textarea name="\${field.id}" rows="4" class="w-full border-gray-300 rounded-md" \${field.required ? 'required' : ''}></textarea>\`;
                    break;
                case 'select':
                    html += \`<select name="\${field.id}" class="w-full border-gray-300 rounded-md" \${field.required ? 'required' : ''}>\`;
                    html += '<option value="">Choose...</option>';
                    field.options?.forEach(option => {
                        html += \`<option value="\${option.value}">\${option.label}</option>\`;
                    });
                    html += '</select>';
                    break;
                case 'radio':
                    field.options?.forEach(option => {
                        html += \`
                            <label class="flex items-center space-x-2 mb-2">
                                <input type="radio" name="\${field.id}" value="\${option.value}" class="text-indigo-600" \${field.required ? 'required' : ''}>
                                <span>\${option.label}</span>
                            </label>
                        \`;
                    });
                    break;
                case 'checkbox':
                    field.options?.forEach(option => {
                        html += \`
                            <label class="flex items-center space-x-2 mb-2">
                                <input type="checkbox" name="\${field.id}[]" value="\${option.value}" class="text-indigo-600">
                                <span>\${option.label}</span>
                            </label>
                        \`;
                    });
                    break;
            }
            
            html += '</div>';
            return html;
        }
        
        setupEventListeners() {
            // Form submission
            document.getElementById('tool-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmit();
            });
            
            // Back button
            document.getElementById('back-btn')?.addEventListener('click', () => {
                this.previousStep();
            });
            
            // Reset button
            document.getElementById('reset-btn').addEventListener('click', () => {
                this.reset();
            });
            
            // Share button
            document.getElementById('share-btn').addEventListener('click', () => {
                this.share();
            });
        }
        
        attachFieldListeners() {
            // Add change listeners to track responses
            this.fields.forEach(field => {
                const elements = document.querySelectorAll(\`[name="\${field.id}"]\`);
                elements.forEach(element => {
                    element.addEventListener('change', (e) => {
                        this.responses[field.id] = e.target.value;
                    });
                });
            });
        }
        
        async handleSubmit() {
            if (this.currentStep < this.fields.length - 1) {
                this.nextStep();
            } else {
                await this.generateResult();
            }
        }
        
        nextStep() {
            // Validate current step
            const currentField = this.fields[this.currentStep];
            if (currentField.required && !this.responses[currentField.id]) {
                alert('Please fill in the required field');
                return;
            }
            
            // Move to next step
            this.currentStep++;
            this.render();
            this.trackEvent('step_completed', { step: this.currentStep });
        }
        
        previousStep() {
            if (this.currentStep > 0) {
                this.currentStep--;
                this.render();
            }
        }
        
        async generateResult() {
            // Show loading state
            const container = document.getElementById('tool-content');
            container.innerHTML = \`
                <div class="text-center py-12">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p class="mt-4 text-gray-600">Generating your result...</p>
                </div>
            \`;
            
            try {
                // Call API to generate result
                const response = await fetch(\`\${API_ENDPOINT}/api/tools/generate\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        projectId: this.projectId,
                        responses: this.responses
                    })
                });
                
                const result = await response.json();
                
                // Display result
                this.displayResult(result);
                
                // Track conversion
                this.trackEvent('conversion', { success: true });
                
            } catch (error) {
                console.error('Generation error:', error);
                container.innerHTML = \`
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p class="text-red-800">An error occurred. Please try again.</p>
                    </div>
                \`;
                this.trackEvent('error', { message: error.message });
            }
        }
        
        displayResult(result) {
            const container = document.getElementById('tool-content');
            container.innerHTML = \`
                <div class="prose max-w-none">
                    <h2 class="text-2xl font-bold mb-4">Your Result</h2>
                    <div class="bg-gray-50 rounded-lg p-6">
                        \${result.content}
                    </div>
                    <div class="mt-6 flex space-x-4">
                        <button onclick="window.tool.reset()" class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                            Try Again
                        </button>
                        <button onclick="window.tool.share()" class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                            Share Result
                        </button>
                    </div>
                </div>
            \`;
        }
        
        reset() {
            this.currentStep = 0;
            this.responses = {};
            this.render();
            this.trackEvent('reset');
        }
        
        share() {
            const url = window.location.href;
            if (navigator.share) {
                navigator.share({
                    title: '${project.name}',
                    text: 'Check out this AI-powered tool!',
                    url: url
                });
            } else {
                // Copy to clipboard
                navigator.clipboard.writeText(url);
                alert('Link copied to clipboard!');
            }
            this.trackEvent('share');
        }
        
        trackEvent(eventType, data = {}) {
            // Send analytics event
            fetch(\`\${API_ENDPOINT}/api/analytics/event\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId: this.projectId,
                    eventType,
                    ...data
                })
            }).catch(console.error);
        }
    }
    
    // Initialize tool when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.tool = new PromptMachineTool();
        });
    } else {
        window.tool = new PromptMachineTool();
    }
})();
        `;
    }

    /**
     * Create Nginx configuration
     */
    async createNginxConfig(subdomain, projectId) {
        const config = `
server {
    listen 80;
    listen [::]:80;
    server_name ${subdomain}.tool.prompt-machine.ca;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${subdomain}.tool.prompt-machine.ca;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${subdomain}.tool.prompt-machine.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${subdomain}.tool.prompt-machine.ca/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Root directory
    root /var/www/tools/${subdomain};
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml;

    # Cache static assets
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Add project ID header
        proxy_set_header X-Project-ID ${projectId};
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy";
        add_header Content-Type text/plain;
    }

    # Main application
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
    
    location = /404.html {
        internal;
    }
    
    location = /50x.html {
        internal;
    }

    # Logging
    access_log /var/log/nginx/${subdomain}.access.log;
    error_log /var/log/nginx/${subdomain}.error.log;
}
        `;

        // Write config to file
        const configPath = path.join(this.nginxConfigPath, `${subdomain}.conf`);
        await fs.writeFile(configPath, config);

        return config;
    }

    /**
     * Enable Nginx site
     */
    async enableNginxSite(subdomain) {
        const availablePath = path.join(this.nginxConfigPath, `${subdomain}.conf`);
        const enabledPath = path.join(this.nginxEnabledPath, `${subdomain}.conf`);

        // Create symbolic link
        await execPromise(`ln -sf ${availablePath} ${enabledPath}`);

        // Test Nginx configuration
        const { stdout, stderr } = await execPromise('nginx -t');
        if (stderr && !stderr.includes('test is successful')) {
            throw new Error(`Nginx configuration test failed: ${stderr}`);
        }

        // Reload Nginx
        await execPromise('systemctl reload nginx');
    }

    /**
     * Setup SSL certificate
     */
    async setupSSL(subdomain, deploymentId) {
        try {
            // Use Certbot to obtain certificate
            const domain = `${subdomain}.tool.prompt-machine.ca`;
            const email = process.env.SSL_EMAIL || 'ssl@prompt-machine.ca';

            const command = `certbot certonly --nginx -d ${domain} --non-interactive --agree-tos --email ${email} --redirect --keep-until-expiring`;
            
            const { stdout, stderr } = await execPromise(command);

            // Update SSL status in database
            await pool.query(
                'UPDATE tool_deployments SET ssl_status = $1, ssl_certificate_id = $2 WHERE id = $3',
                ['active', domain, deploymentId]
            );

            return { success: true, domain };

        } catch (error) {
            // Update SSL status to error
            await pool.query(
                'UPDATE tool_deployments SET ssl_status = $1 WHERE id = $2',
                ['error', deploymentId]
            );

            throw error;
        }
    }

    /**
     * Copy static assets
     */
    async copyStaticAssets(deployPath) {
        const staticPath = path.join(__dirname, '../../static');
        
        // Copy favicon
        const faviconSource = path.join(staticPath, 'favicon.png');
        const faviconDest = path.join(deployPath, 'favicon.png');
        
        try {
            await fs.copyFile(faviconSource, faviconDest);
        } catch (error) {
            // Create default favicon if not exists
            console.log('Using default favicon');
        }
    }

    /**
     * Rollback deployment
     */
    async rollbackDeployment(deploymentId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get deployment details
            const deploymentResult = await client.query(
                'SELECT * FROM tool_deployments WHERE id = $1',
                [deploymentId]
            );

            if (deploymentResult.rows.length === 0) {
                throw new Error('Deployment not found');
            }

            const deployment = deploymentResult.rows[0];

            // Get previous version
            const previousResult = await client.query(
                `SELECT * FROM tool_deployments 
                 WHERE project_id = $1 AND id != $2 
                 ORDER BY created_at DESC LIMIT 1`,
                [deployment.project_id, deploymentId]
            );

            if (previousResult.rows.length === 0) {
                throw new Error('No previous version found');
            }

            const previousDeployment = previousResult.rows[0];

            // Restore previous deployment files
            const currentPath = path.join(this.deploymentPath, deployment.subdomain);
            const backupPath = `${currentPath}.backup`;
            
            // Backup current deployment
            await execPromise(`mv ${currentPath} ${backupPath}`);
            
            // Restore previous version
            const previousPath = path.join(this.deploymentPath, previousDeployment.subdomain);
            await execPromise(`cp -r ${previousPath} ${currentPath}`);

            // Update database
            await client.query(
                'UPDATE tool_deployments SET rollback_version = $1 WHERE id = $2',
                [deployment.version, previousDeployment.id]
            );

            await client.query('COMMIT');
            
            return { 
                success: true, 
                rolledBackTo: previousDeployment.version 
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get deployment statistics
     */
    async getDeploymentStats() {
        const query = `
            SELECT 
                COUNT(*) as total_deployments,
                COUNT(DISTINCT project_id) as deployed_tools,
                COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy_deployments,
                COUNT(*) FILTER (WHERE ssl_status = 'active') as ssl_enabled,
                COUNT(*) FILTER (WHERE deployment_type = 'production') as production_deployments,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as recent_deployments
            FROM tool_deployments
        `;

        const result = await pool.query(query);
        return result.rows[0];
    }

    /**
     * Health check for deployed tools
     */
    async healthCheck(deploymentId) {
        const deployment = await pool.query(
            'SELECT health_check_url FROM tool_deployments WHERE id = $1',
            [deploymentId]
        );

        if (deployment.rows.length === 0) {
            throw new Error('Deployment not found');
        }

        const url = deployment.rows[0].health_check_url;
        
        try {
            const response = await fetch(url);
            const healthy = response.ok;

            await pool.query(
                `UPDATE tool_deployments 
                 SET health_status = $1, last_health_check = NOW() 
                 WHERE id = $2`,
                [healthy ? 'healthy' : 'unhealthy', deploymentId]
            );

            return { healthy, url };

        } catch (error) {
            await pool.query(
                `UPDATE tool_deployments 
                 SET health_status = 'error', last_health_check = NOW() 
                 WHERE id = $1`,
                [deploymentId]
            );

            return { healthy: false, error: error.message };
        }
    }
}

module.exports = new DeploymentService();
