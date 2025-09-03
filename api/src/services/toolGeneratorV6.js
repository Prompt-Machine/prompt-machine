const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
    user: 'promptmachine_userbeta',
    host: 'sql.prompt-machine.com',
    database: 'promptmachine_dbbeta',
    password: '94oE1q7K',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

/**
 * Tool Generator Service V6
 * Generates HTML/CSS/JS for v6 multi-step projects deployed as public tools
 */
class ToolGeneratorV6 {
    constructor() {
        this.toolsDir = path.join(process.cwd(), '../deployed-tools');
    }

    /**
     * Deploy a v6 project as a public tool
     * @param {Object} project - Project with steps data
     * @returns {Object} - Deployment result
     */
    async deployProject(project) {
        try {
            console.log(`🛠️ Generating v6 tool for: ${project.name}`);

            // Use project's clean subdomain
            const slug = project.subdomain;
            
            // Generate tool content
            const toolContent = await this.generateMultiStepTool(project);
            
            // Save to file system
            const toolPath = await this.saveToolToFiles(slug, toolContent);
            
            const deploymentUrl = `https://${slug}.tool.prompt-machine.com`;
            
            console.log(`✅ v6 Tool deployed: ${deploymentUrl}`);
            
            return {
                success: true,
                url: deploymentUrl,
                path: toolPath,
                slug: slug
            };
            
        } catch (error) {
            console.error('v6 Deployment failed:', error);
            throw error;
        }
    }

    /**
     * Remove deployed project files
     * @param {Object} project - Project details
     */
    async undeployProject(project) {
        try {
            const slug = project.subdomain;
            const toolPath = path.join(this.toolsDir, slug);
            
            await fs.rm(toolPath, { recursive: true, force: true });
            console.log(`🗂️ Removed v6 tool files: ${toolPath}`);
            
        } catch (error) {
            console.warn('Warning: Could not remove v6 tool files:', error.message);
        }
    }

    /**
     * Generate deployment slug from project name and ID
     * @param {string} name - Project name
     * @param {string} id - Project ID
     * @returns {string} - URL-friendly slug
     */
    generateSlug(name, id) {
        const nameSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 30);
        
        const shortId = id.split('-')[0];
        return `${nameSlug}-${shortId}`;
    }

    /**
     * Generate complete multi-step tool HTML, CSS, JS
     * @param {Object} project - Project with steps
     * @returns {Promise<Object>} - Generated content
     */
    async generateMultiStepTool(project) {
        const html = await this.generateHTML(project);
        const css = this.generateCSS();
        const js = this.generateJavaScript(project);
        
        return { html, css, js };
    }

    /**
     * Generate HTML for multi-step tool
     * @param {Object} project - Project with steps data
     * @returns {Promise<string>} - Complete HTML document
     */
    async generateHTML(project) {
        const slug = project.subdomain;
        const stepsHTML = this.generateStepsHTML(project.steps);
        
        // Get advertising codes
        const headAdCode = await this.generateMonetizationCode(project, 'head');
        const bodyAdCode = await this.generateMonetizationCode(project, 'body');
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name} - Free AI-Powered Multi-Step Tool | Prompt Machine v1.0.0-rc</title>
    <meta name="description" content="${project.description || `Use ${project.name} to get professional results with AI. Free multi-step tool, no registration required.`}">
    <meta name="keywords" content="AI tool, ${project.name}, free AI, multi-step tool, artificial intelligence">
    <meta name="author" content="Prompt Machine">
    <meta name="robots" content="index, follow">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="${project.name} - Free AI Multi-Step Tool">
    <meta property="og:description" content="${project.description || `Professional ${project.name} tool powered by AI. Free to use, no registration required.`}">
    <meta property="og:url" content="https://${slug}.tool.prompt-machine.com">
    <meta property="og:site_name" content="Prompt Machine Tools">
    
    <!-- Canonical URL -->
    <link rel="canonical" href="https://${slug}.tool.prompt-machine.com">
    
    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Font Awesome -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <link rel="stylesheet" href="style.css">
    
    <!-- Structured Data -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "${project.name}",
        "description": "${project.description || `Professional ${project.name} tool powered by AI`}",
        "url": "https://${slug}.tool.prompt-machine.com",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Browser",
        "author": {
            "@type": "Organization",
            "name": "Prompt Machine",
            "url": "https://prompt-machine.com"
        },
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock"
        }
    }
    </script>
    
    ${headAdCode}
</head>
<body class="bg-gray-50 min-h-screen">
    
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
        <div class="container mx-auto px-4 py-6">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900">${project.name}</h1>
                    <p class="text-gray-600 mt-1">Multi-Step AI Tool • Powered by Advanced AI</p>
                </div>
                <div class="text-sm text-gray-500">
                    Free • No Registration Required
                </div>
            </div>
        </div>
    </header>

    <main class="container mx-auto px-4 py-8">
        <div class="max-w-4xl mx-auto">
            
            <!-- Hero Section -->
            <div class="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-8 mb-8 shadow-xl">
                <div class="text-center">
                    <h2 class="text-4xl md:text-5xl font-bold mb-4">${project.name}</h2>
                    <p class="text-xl mb-6 text-blue-100">${project.description || `Professional ${project.name} tool with step-by-step guidance`}</p>
                    <div class="flex justify-center items-center space-x-4 text-blue-100">
                        <span class="flex items-center">
                            <i class="fas fa-check-circle mr-2"></i> 
                            ${project.steps.length} Step Process
                        </span>
                        <span class="flex items-center">
                            <i class="fas fa-robot mr-2"></i> 
                            AI-Powered
                        </span>
                        <span class="flex items-center">
                            <i class="fas fa-free-code-camp mr-2"></i> 
                            100% Free
                        </span>
                    </div>
                </div>
            </div>

            <!-- Progress Bar -->
            <div class="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-800">Progress</h3>
                    <span id="progress-text" class="text-sm text-gray-600">Step 1 of ${project.steps.length}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div id="progress-bar" class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: ${100 / project.steps.length}%"></div>
                </div>
            </div>

            <!-- Multi-Step Form Container -->
            <div class="bg-white rounded-lg shadow-lg">
                <form id="multiStepForm">
                    ${stepsHTML}
                </form>
            </div>

            <!-- Navigation -->
            <div class="flex justify-between mt-6">
                <button type="button" id="prevBtn" class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 hidden">
                    <i class="fas fa-arrow-left mr-2"></i>
                    Previous
                </button>
                <button type="button" id="nextBtn" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 ml-auto">
                    Next
                    <i class="fas fa-arrow-right ml-2"></i>
                </button>
                <button type="submit" id="submitBtn" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 ml-auto hidden">
                    <i class="fas fa-magic mr-2"></i>
                    Generate with AI
                </button>
            </div>

            <!-- Loading State -->
            <div id="loadingSection" class="bg-white rounded-lg shadow-lg p-8 mt-6 hidden">
                <div class="text-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <h3 class="text-xl font-semibold text-gray-800 mb-2">AI is Working...</h3>
                    <p class="text-gray-600">Processing your information and generating results</p>
                </div>
            </div>

            <!-- Results Section -->
            <div id="resultsSection" class="bg-white rounded-lg shadow-lg p-8 mt-6 hidden">
                <h3 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                    <i class="fas fa-sparkles text-yellow-500 mr-3"></i>
                    AI Generated Results
                </h3>
                <div id="aiResults" class="prose prose-lg max-w-none">
                    <!-- AI results will be displayed here -->
                </div>
                <div class="mt-6 flex space-x-4">
                    <button onclick="copyResults()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        <i class="fas fa-copy mr-2"></i>
                        Copy Results
                    </button>
                    <button onclick="startOver()" class="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                        <i class="fas fa-redo mr-2"></i>
                        Start Over
                    </button>
                </div>
            </div>

            <!-- Footer Info -->
            <div class="bg-gray-50 rounded-lg p-6 mt-8">
                <h3 class="font-semibold text-gray-800 mb-4 text-center">About This Tool</h3>
                <div class="grid md:grid-cols-3 gap-6 text-center">
                    <div>
                        <div class="text-2xl mb-2">🚀</div>
                        <h4 class="font-medium text-gray-800">Professional Results</h4>
                        <p class="text-sm text-gray-600">Get high-quality, AI-generated content tailored to your needs</p>
                    </div>
                    <div>
                        <div class="text-2xl mb-2">⚡</div>
                        <h4 class="font-medium text-gray-800">Step-by-Step Process</h4>
                        <p class="text-sm text-gray-600">Guided ${project.steps.length}-step workflow for optimal results</p>
                    </div>
                    <div>
                        <div class="text-2xl mb-2">🆓</div>
                        <h4 class="font-medium text-gray-800">Completely Free</h4>
                        <p class="text-sm text-gray-600">No registration, no hidden costs, unlimited usage</p>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <!-- Footer -->
    <footer class="bg-gray-800 text-white mt-16 py-8">
        <div class="container mx-auto px-4 text-center">
            <div class="flex flex-col md:flex-row justify-between items-center">
                <div class="mb-4 md:mb-0">
                    <p class="text-gray-300">Powered by <a href="https://prompt-machine.com" class="text-blue-400 hover:text-blue-300">Prompt Machine v1.0.0-rc</a></p>
                    <p class="text-gray-400 text-sm mt-1">Built with Prompt Engineer V6 • Advanced AI Technology • Free Forever</p>
                </div>
                <div class="text-sm text-gray-400">
                    Copyright © 2025 <a href="https://llnet.ca" target="_blank" class="text-blue-400 hover:text-blue-300">LLnet Inc</a> & 
                    <a href="https://claude.ai/code" target="_blank" class="text-blue-400 hover:text-blue-300">Anthropic Claude Code</a>
                </div>
            </div>
        </div>
    </footer>

    <script src="app.js"></script>
    
    ${bodyAdCode}
</body>
</html>`;
    }

    /**
     * Generate HTML for all steps
     * @param {Array} steps - Project steps with fields
     * @returns {string} - Steps HTML
     */
    generateStepsHTML(steps) {
        return steps.map((step, index) => {
            const fieldsHTML = this.generateStepFieldsHTML(step.fields || []);
            
            return `
                <div class="step" id="step-${index}" ${index === 0 ? '' : 'style="display: none;"'}>
                    <div class="p-8">
                        <div class="text-center mb-8">
                            <div class="bg-blue-100 text-blue-800 rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                                ${index + 1}
                            </div>
                            <h2 class="text-2xl font-bold text-gray-800 mb-2">${step.name}</h2>
                            ${step.description ? `<p class="text-gray-600">${step.description}</p>` : ''}
                        </div>
                        
                        <div class="max-w-2xl mx-auto space-y-6">
                            ${fieldsHTML}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Generate HTML for step fields
     * @param {Array} fields - Step fields
     * @returns {string} - Fields HTML
     */
    generateStepFieldsHTML(fields) {
        return fields.map(field => {
            const fieldId = this.sanitizeFieldName(field.name);
            const required = field.required ? 'required' : '';
            
            switch (field.type) {
                case 'text':
                    return `
                        <div class="field-group">
                            <label for="${fieldId}" class="block text-sm font-medium text-gray-700 mb-2">
                                ${field.label || field.name}
                                ${field.required ? '<span class="text-red-500">*</span>' : ''}
                            </label>
                            <input type="text" 
                                   id="${fieldId}" 
                                   name="${fieldId}" 
                                   placeholder="${field.placeholder || ''}" 
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                   ${required}>
                            ${field.description ? `<p class="text-sm text-gray-500 mt-1">${field.description}</p>` : ''}
                        </div>
                    `;
                
                case 'textarea':
                    return `
                        <div class="field-group">
                            <label for="${fieldId}" class="block text-sm font-medium text-gray-700 mb-2">
                                ${field.label || field.name}
                                ${field.required ? '<span class="text-red-500">*</span>' : ''}
                            </label>
                            <textarea id="${fieldId}" 
                                      name="${fieldId}" 
                                      rows="4" 
                                      placeholder="${field.placeholder || ''}"
                                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      ${required}></textarea>
                            ${field.description ? `<p class="text-sm text-gray-500 mt-1">${field.description}</p>` : ''}
                        </div>
                    `;
                
                case 'select':
                    const options = (field.choices || []).map(choice => 
                        `<option value="${choice.value}">${choice.label}</option>`
                    ).join('');
                    
                    return `
                        <div class="field-group">
                            <label for="${fieldId}" class="block text-sm font-medium text-gray-700 mb-2">
                                ${field.label || field.name}
                                ${field.required ? '<span class="text-red-500">*</span>' : ''}
                            </label>
                            <select id="${fieldId}" 
                                    name="${fieldId}" 
                                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    ${required}>
                                <option value="">Choose ${field.label || field.name}...</option>
                                ${options}
                            </select>
                            ${field.description ? `<p class="text-sm text-gray-500 mt-1">${field.description}</p>` : ''}
                        </div>
                    `;
                
                case 'radio':
                    const radioOptions = (field.choices || []).map((choice, idx) => `
                        <label class="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="radio" 
                                   id="${fieldId}_${idx}" 
                                   name="${fieldId}" 
                                   value="${choice.value}"
                                   class="text-blue-600 focus:ring-blue-500"
                                   ${required && idx === 0 ? required : ''}>
                            <span class="text-sm text-gray-700">${choice.label}</span>
                        </label>
                    `).join('');
                    
                    return `
                        <div class="field-group">
                            <label class="block text-sm font-medium text-gray-700 mb-3">
                                ${field.label || field.name}
                                ${field.required ? '<span class="text-red-500">*</span>' : ''}
                            </label>
                            <div class="space-y-2">
                                ${radioOptions}
                            </div>
                            ${field.description ? `<p class="text-sm text-gray-500 mt-2">${field.description}</p>` : ''}
                        </div>
                    `;
                
                case 'checkbox':
                    const checkboxOptions = (field.choices || []).map((choice, idx) => `
                        <label class="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" 
                                   id="${fieldId}_${idx}" 
                                   name="${fieldId}" 
                                   value="${choice.value}"
                                   class="text-blue-600 focus:ring-blue-500 rounded">
                            <span class="text-sm text-gray-700">${choice.label}</span>
                        </label>
                    `).join('');
                    
                    return `
                        <div class="field-group">
                            <label class="block text-sm font-medium text-gray-700 mb-3">
                                ${field.label || field.name}
                                ${field.required ? '<span class="text-red-500">*</span>' : ''}
                            </label>
                            <div class="space-y-2">
                                ${checkboxOptions}
                            </div>
                            ${field.description ? `<p class="text-sm text-gray-500 mt-2">${field.description}</p>` : ''}
                        </div>
                    `;
                
                default:
                    return `
                        <div class="field-group">
                            <label for="${fieldId}" class="block text-sm font-medium text-gray-700 mb-2">
                                ${field.label || field.name}
                                ${field.required ? '<span class="text-red-500">*</span>' : ''}
                            </label>
                            <input type="text" 
                                   id="${fieldId}" 
                                   name="${fieldId}" 
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                   ${required}>
                        </div>
                    `;
            }
        }).join('');
    }

    /**
     * Generate CSS styles
     * @returns {string} - CSS content
     */
    generateCSS() {
        return `/* Multi-Step Tool V6 Custom Styles */

.field-group {
    margin-bottom: 1.5rem;
}

.field-group label {
    font-weight: 600;
    color: #374151;
}

.step {
    min-height: 400px;
}

/* Loading Animation */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Custom Focus States */
.field-group input:focus,
.field-group textarea:focus,
.field-group select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Radio and Checkbox Styling */
input[type="radio"]:checked {
    background-color: #3b82f6;
    border-color: #3b82f6;
}

input[type="checkbox"]:checked {
    background-color: #3b82f6;
    border-color: #3b82f6;
}

/* Step Transitions */
.step {
    opacity: 1;
    transition: opacity 0.3s ease-in-out;
}

.step.fade-out {
    opacity: 0;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
    .container {
        padding-left: 1rem;
        padding-right: 1rem;
    }
    
    .grid {
        grid-template-columns: 1fr;
    }
}`;
    }

    /**
     * Generate JavaScript functionality
     * @param {Object} project - Project with steps
     * @returns {string} - JavaScript content
     */
    generateJavaScript(project) {
        return `// Multi-Step Tool V6 JavaScript

class MultiStepTool {
    constructor() {
        this.currentStep = 0;
        this.totalSteps = ${project.steps.length};
        this.projectId = '${project.id}';
        this.projectName = '${project.name}';
        this.systemPrompt = \`${project.system_prompt ? project.system_prompt : `You are ${project.ai_role || 'an AI assistant'}. ${project.ai_persona_description || ''}`}\`.replace(/\\n/g, ' ');
        this.sessionId = this.generateSessionId();
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateProgress();
        this.updateButtons();
        
        // Track tool view
        this.trackEvent('view', { initialLoad: true });
    }
    
    setupEventListeners() {
        const nextBtn = document.getElementById('nextBtn');
        const prevBtn = document.getElementById('prevBtn');
        const submitBtn = document.getElementById('submitBtn');
        const form = document.getElementById('multiStepForm');
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextStep());
        }
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevStep());
        }
        
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.generateAIResponse());
        }
        
        // Prevent form submission
        if (form) {
            form.addEventListener('submit', (e) => e.preventDefault());
        }
    }
    
    nextStep() {
        if (!this.validateCurrentStep()) {
            return;
        }
        
        if (this.currentStep < this.totalSteps - 1) {
            this.hideStep(this.currentStep);
            this.currentStep++;
            this.showStep(this.currentStep);
            this.updateProgress();
            this.updateButtons();
        }
    }
    
    prevStep() {
        if (this.currentStep > 0) {
            this.hideStep(this.currentStep);
            this.currentStep--;
            this.showStep(this.currentStep);
            this.updateProgress();
            this.updateButtons();
        }
    }
    
    hideStep(stepIndex) {
        const step = document.getElementById(\`step-\${stepIndex}\`);
        if (step) {
            step.style.display = 'none';
        }
    }
    
    showStep(stepIndex) {
        const step = document.getElementById(\`step-\${stepIndex}\`);
        if (step) {
            step.style.display = 'block';
        }
    }
    
    updateProgress() {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        
        const percentage = ((this.currentStep + 1) / this.totalSteps) * 100;
        
        if (progressBar) {
            progressBar.style.width = percentage + '%';
        }
        
        if (progressText) {
            progressText.textContent = \`Step \${this.currentStep + 1} of \${this.totalSteps}\`;
        }
    }
    
    updateButtons() {
        const nextBtn = document.getElementById('nextBtn');
        const prevBtn = document.getElementById('prevBtn');
        const submitBtn = document.getElementById('submitBtn');
        
        // Show/hide previous button
        if (prevBtn) {
            if (this.currentStep === 0) {
                prevBtn.classList.add('hidden');
            } else {
                prevBtn.classList.remove('hidden');
            }
        }
        
        // Show/hide next vs submit button
        if (this.currentStep === this.totalSteps - 1) {
            if (nextBtn) nextBtn.classList.add('hidden');
            if (submitBtn) submitBtn.classList.remove('hidden');
        } else {
            if (nextBtn) nextBtn.classList.remove('hidden');
            if (submitBtn) submitBtn.classList.add('hidden');
        }
    }
    
    validateCurrentStep() {
        const step = document.getElementById(\`step-\${this.currentStep}\`);
        if (!step) return true;
        
        const requiredFields = step.querySelectorAll('input[required], textarea[required], select[required]');
        let isValid = true;
        
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                field.classList.add('border-red-500');
                isValid = false;
            } else {
                field.classList.remove('border-red-500');
            }
        });
        
        if (!isValid) {
            this.showError('Please fill in all required fields before continuing.');
        } else {
            this.hideError();
        }
        
        return isValid;
    }
    
    collectFormData() {
        const formData = {};
        const form = document.getElementById('multiStepForm');
        
        if (form) {
            const formElements = new FormData(form);
            
            for (let [name, value] of formElements.entries()) {
                if (formData[name]) {
                    // Handle multiple values (checkboxes)
                    if (Array.isArray(formData[name])) {
                        formData[name].push(value);
                    } else {
                        formData[name] = [formData[name], value];
                    }
                } else {
                    formData[name] = value;
                }
            }
        }
        
        return formData;
    }
    
    async generateAIResponse() {
        if (!this.validateCurrentStep()) {
            return;
        }
        
        const formData = this.collectFormData();
        
        // Show loading state
        this.showLoading();
        
        try {
            // Track submission event
            this.trackEvent('submit', { formData, stepCount: this.totalSteps });
            
            const startTime = Date.now();
            const response = await fetch('https://api.prompt-machine.com/api/v6/tools/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    project_id: this.projectId,
                    project_name: this.projectName,
                    system_prompt: this.systemPrompt,
                    form_data: formData,
                    steps_completed: this.totalSteps,
                    session_id: this.sessionId
                })
            });
            
            const responseTime = Date.now() - startTime;
            const data = await response.json();
            
            if (response.ok && data.success) {
                this.showResults(data.result || data.output || 'AI processing completed successfully!');
                this.trackEvent('complete', { formData, responseTime });
                this.trackUsage(formData);
            } else {
                throw new Error(data.error || 'Failed to generate AI response');
            }
            
        } catch (error) {
            console.error('AI Generation Error:', error);
            this.trackEvent('error', { 
                errorMessage: error.message, 
                formData: formData 
            });
            this.showError('Sorry, the AI is currently unavailable. Please try again in a moment.');
        } finally {
            this.hideLoading();
        }
    }
    
    showLoading() {
        const loadingSection = document.getElementById('loadingSection');
        if (loadingSection) {
            loadingSection.classList.remove('hidden');
        }
        
        // Scroll to loading section
        loadingSection?.scrollIntoView({ behavior: 'smooth' });
    }
    
    hideLoading() {
        const loadingSection = document.getElementById('loadingSection');
        if (loadingSection) {
            loadingSection.classList.add('hidden');
        }
    }
    
    showResults(results) {
        const resultsSection = document.getElementById('resultsSection');
        const aiResults = document.getElementById('aiResults');
        
        if (aiResults) {
            aiResults.innerHTML = \`<div class="whitespace-pre-wrap">\${this.escapeHtml(results)}</div>\`;
        }
        
        if (resultsSection) {
            resultsSection.classList.remove('hidden');
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    showError(message) {
        let errorDiv = document.getElementById('errorMessage');
        
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'errorMessage';
            errorDiv.className = 'mt-4 p-4 bg-red-100 text-red-700 rounded-lg border border-red-200';
            
            const step = document.getElementById(\`step-\${this.currentStep}\`);
            if (step) {
                step.appendChild(errorDiv);
            }
        }
        
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
    
    hideError() {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    }
    
    async trackUsage(formData) {
        try {
            await fetch('https://api.prompt-machine.com/api/v6/tools/track-usage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    project_id: this.projectId,
                    project_name: this.projectName,
                    steps_completed: this.totalSteps,
                    form_data: formData,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (error) {
            console.log('Usage tracking failed:', error.message);
        }
    }
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    async trackEvent(eventType, data = {}) {
        try {
            await fetch('https://api.prompt-machine.com/api/analytics/track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId: this.projectId,
                    eventType: eventType,
                    sessionId: this.sessionId,
                    sessionData: {
                        projectName: this.projectName,
                        currentStep: this.currentStep,
                        totalSteps: this.totalSteps,
                        userAgent: navigator.userAgent,
                        timestamp: new Date().toISOString()
                    },
                    stepData: data,
                    responseTime: data.responseTime
                })
            });
        } catch (error) {
            console.log('Analytics tracking failed:', error.message);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Utility functions
function copyResults() {
    const aiResults = document.getElementById('aiResults');
    if (aiResults) {
        const text = aiResults.textContent.trim();
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                showTemporaryMessage('Results copied to clipboard!');
            });
        } else {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showTemporaryMessage('Results copied to clipboard!');
        }
    }
}

function startOver() {
    if (confirm('Are you sure you want to start over? This will clear all your progress.')) {
        location.reload();
    }
}

function showTemporaryMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform transition-transform duration-300';
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.transform = 'translateX(400px)';
        setTimeout(() => {
            document.body.removeChild(messageDiv);
        }, 300);
    }, 2500);
}

// Initialize the multi-step tool when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.multiStepTool = new MultiStepTool();
    console.log('✅ Multi-Step Tool V6 initialized');
});`;
    }

    /**
     * Save generated tool files to file system
     * @param {string} slug - Project slug
     * @param {Object} toolContent - Generated content
     * @returns {string} - Tool path
     */
    async saveToolToFiles(slug, toolContent) {
        const toolPath = path.join(this.toolsDir, slug);
        
        try {
            // Create tool directory
            await fs.mkdir(toolPath, { recursive: true });
            
            // Save HTML file
            await fs.writeFile(
                path.join(toolPath, 'index.html'), 
                toolContent.html, 
                'utf8'
            );
            
            // Save CSS file
            await fs.writeFile(
                path.join(toolPath, 'style.css'), 
                toolContent.css, 
                'utf8'
            );
            
            // Save JavaScript file
            await fs.writeFile(
                path.join(toolPath, 'app.js'), 
                toolContent.js, 
                'utf8'
            );
            
            console.log(`💾 v6 Tool saved to: ${toolPath}`);
            return toolPath;
            
        } catch (error) {
            console.error('Error saving v6 tool files:', error);
            throw new Error(`Failed to save v6 tool files: ${error.message}`);
        }
    }

    /**
     * Remove deployed tool files and directory
     * @param {string} subdomain - The subdomain/slug of the tool
     * @returns {Promise<boolean>} - Success status
     */
    async removeDeployedTool(subdomain) {
        try {
            const toolPath = path.join(this.toolsDir, subdomain);
            
            // Check if directory exists
            try {
                await fs.access(toolPath);
            } catch (error) {
                console.log(`🗑️ Tool directory doesn't exist: ${toolPath}`);
                return true; // Not an error if it doesn't exist
            }
            
            // Remove the entire directory and its contents
            await fs.rm(toolPath, { recursive: true, force: true });
            console.log(`🗑️ Removed deployed tool directory: ${toolPath}`);
            
            return true;
        } catch (error) {
            console.error(`❌ Error removing deployed tool ${subdomain}:`, error);
            return false;
        }
    }

    /**
     * Generate advertising code for head or body sections using global settings
     * @param {Object} project - Project with advertising_enabled setting
     * @param {string} location - 'head' or 'body'
     * @returns {Promise<string>} - HTML code to inject
     */
    async generateMonetizationCode(project, location) {
        if (!project.monetization_enabled) {
            return '';
        }
        
        // Get global advertising settings from database using existing pool
        try {
            const result = await pool.query(
                'SELECT * FROM advertising_settings WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
                ['e88dad2e-5b81-4a6b-8d42-4b65611428ac'] // TODO: Get from project owner
            );
            
            if (result.rows.length === 0) {
                return ''; // No advertising settings configured
            }
            
            const adSettings = result.rows[0];
            let code = '';
            
            if (location === 'head') {
                // Google Analytics
                if (adSettings.google_analytics_enabled && adSettings.google_analytics_id) {
                    code += `\n    <!-- Google Analytics -->\n    <script async src="https://www.googletagmanager.com/gtag/js?id=${adSettings.google_analytics_id}"></script>\n    <script>\n      window.dataLayer = window.dataLayer || [];\n      function gtag(){dataLayer.push(arguments);}\n      gtag('js', new Date());\n      gtag('config', '${adSettings.google_analytics_id}');\n    </script>\n`;
                }
                
                // Google AdSense
                if (adSettings.google_ads_enabled && adSettings.google_ads_client) {
                    code += `\n    <!-- Google AdSense -->\n    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adSettings.google_ads_client}" crossorigin="anonymous"></script>\n`;
                }
                
                // Custom Head Code
                if (adSettings.custom_head_code) {
                    code += `\n    <!-- Custom Head Code -->\n    ${adSettings.custom_head_code}\n`;
                }
            } else if (location === 'body') {
                // Custom Body Code
                if (adSettings.custom_body_code) {
                    code += `\n    <!-- Custom Body Code -->\n    ${adSettings.custom_body_code}\n`;
                }
            }
            
            return code;
            
        } catch (error) {
            console.error('Error loading advertising settings:', error);
            return '';
        }
    }

    /**
     * Sanitize field name for HTML/JS use
     * @param {string} fieldName - Raw field name
     * @returns {string} - Sanitized name
     */
    sanitizeFieldName(fieldName) {
        return fieldName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }
}

module.exports = new ToolGeneratorV6();