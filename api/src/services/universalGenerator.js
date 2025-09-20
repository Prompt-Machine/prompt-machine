// ========================================
// UNIVERSAL GENERATOR SERVICE v2.0.0rc
// AI-Powered Tool Generation Engine
// ========================================

const ClaudeService = require('./claude');
const { v4: uuidv4 } = require('uuid');

class UniversalGenerator {
    constructor() {
        this.claude = new ClaudeService();
        this.toolCategories = {
            assessment: {
                name: 'Assessment Tools',
                description: 'Professional evaluation and risk assessment tools',
                examples: ['Health Risk Calculator', 'Business Viability Assessment', 'Career Aptitude Test'],
                defaultCalculationType: 'weighted',
                typicalComplexity: 3
            },
            creative: {
                name: 'Creative Tools',
                description: 'Content generation and creative assistance tools',
                examples: ['Story Generator', 'Joke Creator', 'Poetry Builder'],
                defaultCalculationType: 'none',
                typicalComplexity: 2
            },
            utility: {
                name: 'Utility Applications',
                description: 'Practical tools and calculators',
                examples: ['Currency Converter', 'To-Do List', 'Timer', 'Unit Converter'],
                defaultCalculationType: 'none',
                typicalComplexity: 1
            },
            business: {
                name: 'Business Tools',
                description: 'Professional business analysis and planning tools',
                examples: ['Market Analysis', 'ROI Calculator', 'Project Planner'],
                defaultCalculationType: 'scoring',
                typicalComplexity: 4
            },
            educational: {
                name: 'Educational Tools',
                description: 'Learning and assessment tools',
                examples: ['Quiz Builder', 'Flashcard System', 'Learning Path Guide'],
                defaultCalculationType: 'scoring',
                typicalComplexity: 2
            }
        };
    }

    /**
     * Analyzes a tool request and determines the best approach
     */
    async analyzeToolRequest({ description, toolType, targetAudience, complexity }) {
        try {
            const prompt = `You are an expert AI tool architect. Analyze this tool request and provide structured recommendations.

Tool Request: "${description}"
Specified Type: ${toolType || 'auto-detect'}
Target Audience: ${targetAudience || 'general public'}
Complexity Preference: ${complexity || 'auto'}

Analyze this request and respond with a JSON object containing:
1. suggestedCategory: One of [assessment, creative, utility, business, educational]
2. complexity: Integer 1-5 (1=very simple, 5=very complex)
3. calculationType: One of [weighted, scoring, probability, decision_tree, none]
4. suggestedFields: Array of field objects, each with:
   - name: Field identifier
   - label: Display label
   - type: One of [select, multiselect, text, textarea, number, date, scale]
   - required: Boolean
   - weight: Number (0-100) for calculation importance
   - isPremium: Boolean (true for advanced fields)
   - helpText: Brief help text
   - placeholder: Placeholder text
   - validation: Object with validation rules
   - choices: Array of choice objects (for select/multiselect) with text, value, weight
5. suggestedSteps: Array of step objects with name, description, fields array
6. systemPrompt: Suggested AI system prompt for this tool
7. estimatedDevelopmentTime: String like "5 minutes", "30 minutes", "2 hours"
8. feasibility: Object with:
   - isFeasi ble: Boolean
   - limitations: Array of strings (if any)
   - recommendations: Array of strings

Important: 
- For simple tools (calculators, converters), suggest minimal fields
- For assessment tools, include weighted fields for calculations
- For creative tools, focus on input parameters that guide generation
- Mark advanced features as isPremium: true
- If the request is too complex or impossible, set feasibility.isFeasible to false

Respond ONLY with valid JSON. Do not include any other text.`;

            const response = await this.claude.generateContent(prompt, {
                model: 'claude-3-opus-20240229',
                max_tokens: 2000,
                temperature: 0.3
            });

            // Parse the AI response
            let analysis;
            try {
                // Clean the response to ensure valid JSON
                const jsonStr = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
                analysis = JSON.parse(jsonStr);
            } catch (parseError) {
                console.error('Failed to parse AI response:', parseError);
                // Fallback to default analysis
                analysis = this.getDefaultAnalysis(description);
            }

            // Validate and enhance the analysis
            analysis = this.validateAndEnhanceAnalysis(analysis);

            return analysis;

        } catch (error) {
            console.error('Tool analysis error:', error);
            throw new Error('Failed to analyze tool request');
        }
    }

    /**
     * Generates complete tool structure based on template
     */
    async generateToolStructure({ template, projectConfig }) {
        try {
            const prompt = `You are creating a professional ${template.category} tool.
Project: ${projectConfig.name}
Description: ${projectConfig.description}
Template Category: ${template.category}
Base Prompt: ${template.base_prompt}

Generate a complete tool structure with:
1. At least 3 steps/sections
2. 5-15 fields total across all steps
3. Appropriate field types for the tool category
4. Weighted calculations if applicable
5. Clear, professional labeling

For each step, provide:
- name: Step identifier
- title: Display title
- subtitle: Brief description
- description: Detailed description
- order: Step number
- required: Boolean
- weight: Progress weight (1-10)
- fields: Array of field objects

For each field, provide:
- name: Field identifier (lowercase, underscores)
- label: Professional display label
- type: Field type (select, multiselect, text, number, date, scale, textarea)
- placeholder: Helpful placeholder text
- description: Brief field description
- required: Boolean
- order: Field order within step
- weight: Importance for calculations (0-100)
- isPremium: Boolean (true for advanced fields, aim for 20-30% premium)
- packageId: null for free, "premium" for premium fields
- helpText: Contextual help
- validation: Validation rules object
- choices: For select/multiselect, array of {text, value, weight, explanation}

Guidelines:
- First step should gather basic information (usually free fields)
- Later steps should have more advanced/premium fields
- Include a good mix of field types
- For assessment tools, ensure fields contribute to calculations
- For creative tools, focus on customization options
- For utility tools, keep it simple and functional

Respond with valid JSON containing:
{
  "steps": [...],
  "fields": [...] // Flat array of all fields
}`;

            const response = await this.claude.generateContent(prompt, {
                model: 'claude-3-opus-20240229',
                max_tokens: 3000,
                temperature: 0.4
            });

            // Parse and validate the structure
            let structure;
            try {
                const jsonStr = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
                structure = JSON.parse(jsonStr);
            } catch (parseError) {
                console.error('Failed to parse structure:', parseError);
                structure = this.generateDefaultStructure(template, projectConfig);
            }

            // Enhance with additional metadata
            structure = this.enhanceStructure(structure, template);

            return structure;

        } catch (error) {
            console.error('Structure generation error:', error);
            throw new Error('Failed to generate tool structure');
        }
    }

    /**
     * Generates field recommendations based on context
     */
    async generateFieldRecommendations({ project, stepId, context, requestedCount = 5 }) {
        try {
            const prompt = `You are enhancing a ${project.tool_type} tool: "${project.name}"
Current context: ${context || 'Adding new fields to improve the tool'}
Tool description: ${project.description}
AI Role: ${project.ai_role}

Generate ${requestedCount} field recommendations that would enhance this tool.
Consider the tool's purpose and suggest fields that would:
1. Improve the quality of results
2. Gather valuable user data
3. Enhance personalization
4. Add professional depth

For each field, provide:
- name: Unique identifier (lowercase, underscores)
- label: Professional display label
- type: Appropriate field type
- description: Clear description
- placeholder: Example or hint text
- required: Boolean (true for critical fields)
- weight: Importance (0-100)
- isPremium: Boolean (true for advanced fields)
- helpText: Contextual help for users
- validation: Validation rules if applicable
- choices: For select/multiselect types

Focus on fields that would genuinely improve the tool's effectiveness.
Mix both simple and advanced fields.
Ensure field names don't conflict with common names.

Respond with a JSON array of field objects.`;

            const response = await this.claude.generateContent(prompt, {
                model: 'claude-3-opus-20240229',
                max_tokens: 2000,
                temperature: 0.5
            });

            // Parse recommendations
            let recommendations;
            try {
                const jsonStr = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
                recommendations = JSON.parse(jsonStr);
            } catch (parseError) {
                console.error('Failed to parse recommendations:', parseError);
                recommendations = this.generateDefaultFieldRecommendations(project, requestedCount);
            }

            // Ensure array format and validate
            if (!Array.isArray(recommendations)) {
                recommendations = [recommendations];
            }

            // Validate and enhance each recommendation
            recommendations = recommendations.map(field => this.validateField(field));

            return recommendations.slice(0, requestedCount);

        } catch (error) {
            console.error('Field recommendation error:', error);
            throw new Error('Failed to generate field recommendations');
        }
    }

    /**
     * Generates deployment files for the tool
     */
    async generateDeploymentFiles({ project, includeCalculations, includePermissions, version }) {
        const files = {};

        // Generate index.html
        files['index.html'] = this.generateHTML(project, includePermissions);

        // Generate app.js
        files['app.js'] = this.generateJavaScript(project, includeCalculations, includePermissions);

        // Generate style.css
        files['style.css'] = this.generateCSS(project);

        // Generate config.json
        files['config.json'] = JSON.stringify({
            projectId: project.id,
            version: version || '2.0.0',
            name: project.name,
            description: project.description,
            subdomain: project.subdomain,
            features: {
                calculations: includeCalculations,
                permissions: includePermissions,
                analytics: true
            }
        }, null, 2);

        return files;
    }

    /**
     * Generate HTML for deployed tool
     */
    generateHTML(project, includePermissions) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name} - AI-Powered Tool</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="style.css">
    ${project.google_ads_code ? `<!-- Google Ads -->
    ${project.google_ads_code}` : ''}
</head>
<body class="bg-gray-50 min-h-screen">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900">${project.name}</h1>
                    <p class="text-gray-600 mt-1">${project.description}</p>
                </div>
                ${includePermissions ? `
                <div id="upgradeButton" class="hidden">
                    <button class="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all">
                        ✨ Unlock Premium Features
                    </button>
                </div>` : ''}
            </div>
        </div>
    </header>

    <!-- Progress Bar -->
    <div id="progressContainer" class="bg-white border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div class="w-full bg-gray-200 rounded-full h-2">
                <div id="progressBar" class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
            <p id="progressText" class="text-sm text-gray-600 mt-2">Step 1 of X</p>
        </div>
    </div>

    <!-- Main Content -->
    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Step Container -->
        <div id="stepContainer" class="bg-white rounded-lg shadow-sm p-6 mb-6">
            <!-- Dynamic content loads here -->
        </div>

        <!-- Navigation -->
        <div class="flex justify-between">
            <button id="prevButton" class="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50" disabled>
                ← Previous
            </button>
            <button id="nextButton" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Next →
            </button>
        </div>

        <!-- Results Container -->
        <div id="resultsContainer" class="hidden mt-8">
            <!-- Results will be displayed here -->
        </div>
    </main>

    <!-- Premium Upgrade Modal -->
    ${includePermissions ? `
    <div id="upgradeModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-8 max-w-md mx-4">
            <h2 class="text-2xl font-bold mb-4">Unlock Premium Features</h2>
            <p class="text-gray-600 mb-6">Get access to advanced features and detailed analysis with our premium plan.</p>
            <div class="space-y-3 mb-6">
                <div class="flex items-start">
                    <svg class="w-5 h-5 text-green-500 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                    <span>Access all premium fields</span>
                </div>
                <div class="flex items-start">
                    <svg class="w-5 h-5 text-green-500 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                    <span>Detailed professional analysis</span>
                </div>
                <div class="flex items-start">
                    <svg class="w-5 h-5 text-green-500 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                    <span>Priority support</span>
                </div>
            </div>
            <div class="flex gap-3">
                <button onclick="closeUpgradeModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Maybe Later
                </button>
                <button onclick="upgradeToPremium()" class="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg">
                    Upgrade Now
                </button>
            </div>
        </div>
    </div>` : ''}

    <!-- Scripts -->
    <script src="config.json"></script>
    <script src="app.js"></script>
</body>
</html>`;
    }

    /**
     * Generate JavaScript for deployed tool
     */
    generateJavaScript(project, includeCalculations, includePermissions) {
        return `// ${project.name} - AI-Powered Tool v2.0.0
// Generated by Prompt Machine Universal Generator

class AITool {
    constructor() {
        this.currentStep = 0;
        this.responses = {};
        this.steps = [];
        this.fields = [];
        this.projectId = '${project.id}';
        this.subdomain = '${project.subdomain}';
        this.includeCalculations = ${includeCalculations};
        this.includePermissions = ${includePermissions};
        this.userPackage = 'free'; // Default to free
        this.init();
    }

    async init() {
        try {
            // Load tool configuration
            await this.loadConfiguration();
            
            // Check user package if permissions enabled
            if (this.includePermissions) {
                await this.checkUserPackage();
            }
            
            // Render first step
            this.renderStep();
            
            // Bind events
            this.bindEvents();
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to load tool configuration');
        }
    }

    async loadConfiguration() {
        try {
            const response = await fetch(\`/api/public/tools/\${this.subdomain}\`);
            const data = await response.json();
            
            if (data.success) {
                this.steps = data.data.steps;
                this.fields = data.data.fields;
                this.projectConfig = data.data.project;
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('Configuration load error:', error);
            throw error;
        }
    }

    async checkUserPackage() {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const response = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': \`Bearer \${token}\`
                    }
                });
                const data = await response.json();
                if (data.success) {
                    this.userPackage = data.data.packageName || 'free';
                }
            }
        } catch (error) {
            console.error('Package check error:', error);
            // Continue with free package
        }
    }

    renderStep() {
        const step = this.steps[this.currentStep];
        const container = document.getElementById('stepContainer');
        
        // Update progress
        this.updateProgress();
        
        // Render step content
        let html = \`
            <h2 class="text-2xl font-bold mb-2">\${step.page_title}</h2>
            <p class="text-gray-600 mb-6">\${step.page_subtitle}</p>
            <div class="space-y-4">
        \`;
        
        // Render fields for this step
        const stepFields = this.fields.filter(f => f.step_id === step.id);
        
        stepFields.forEach(field => {
            html += this.renderField(field);
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Initialize field behaviors
        this.initializeFields();
    }

    renderField(field) {
        // Check if field requires premium
        const isLocked = this.includePermissions && 
                        field.is_premium && 
                        this.userPackage === 'free';
        
        let fieldHtml = \`<div class="field-container \${isLocked ? 'premium-locked' : ''}" data-field-id="\${field.id}">\`;
        
        // Add label
        fieldHtml += \`
            <label class="block text-sm font-medium text-gray-700 mb-1">
                \${field.label}
                \${field.is_required ? '<span class="text-red-500">*</span>' : ''}
                \${isLocked ? '<span class="ml-2 text-xs bg-gradient-to-r from-purple-600 to-blue-600 text-white px-2 py-0.5 rounded">Premium</span>' : ''}
            </label>
        \`;
        
        // Add help text if available
        if (field.help_text) {
            fieldHtml += \`<p class="text-sm text-gray-500 mb-1">\${field.help_text}</p>\`;
        }
        
        // Render field based on type
        if (isLocked) {
            fieldHtml += this.renderLockedField(field);
        } else {
            fieldHtml += this.renderFieldInput(field);
        }
        
        fieldHtml += '</div>';
        return fieldHtml;
    }

    renderFieldInput(field) {
        switch(field.field_type) {
            case 'text':
                return \`<input type="text" 
                        id="\${field.id}" 
                        name="\${field.name}"
                        placeholder="\${field.placeholder || ''}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        \${field.is_required ? 'required' : ''}>\`;
                
            case 'textarea':
                return \`<textarea 
                        id="\${field.id}" 
                        name="\${field.name}"
                        placeholder="\${field.placeholder || ''}"
                        rows="4"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        \${field.is_required ? 'required' : ''}></textarea>\`;
                
            case 'number':
                return \`<input type="number" 
                        id="\${field.id}" 
                        name="\${field.name}"
                        placeholder="\${field.placeholder || ''}"
                        min="\${field.min_value || ''}"
                        max="\${field.max_value || ''}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        \${field.is_required ? 'required' : ''}>\`;
                
            case 'select':
                let selectHtml = \`<select 
                        id="\${field.id}" 
                        name="\${field.name}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        \${field.is_required ? 'required' : ''}>
                        <option value="">Select an option</option>\`;
                
                field.choices?.forEach(choice => {
                    selectHtml += \`<option value="\${choice.choice_value}">\${choice.choice_text}</option>\`;
                });
                
                selectHtml += '</select>';
                return selectHtml;
                
            case 'multiselect':
                let checkboxHtml = '<div class="space-y-2">';
                field.choices?.forEach(choice => {
                    checkboxHtml += \`
                        <label class="flex items-center">
                            <input type="checkbox" 
                                   name="\${field.name}[]" 
                                   value="\${choice.choice_value}"
                                   class="mr-2">
                            <span>\${choice.choice_text}</span>
                        </label>\`;
                });
                checkboxHtml += '</div>';
                return checkboxHtml;
                
            case 'scale':
                return \`
                    <div class="flex items-center space-x-2">
                        <span>1</span>
                        <input type="range" 
                               id="\${field.id}" 
                               name="\${field.name}"
                               min="1" max="10" value="5"
                               class="flex-1">
                        <span>10</span>
                        <output class="ml-2 font-medium">5</output>
                    </div>\`;
                
            case 'date':
                return \`<input type="date" 
                        id="\${field.id}" 
                        name="\${field.name}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        \${field.is_required ? 'required' : ''}>\`;
                
            default:
                return \`<input type="text" 
                        id="\${field.id}" 
                        name="\${field.name}"
                        placeholder="\${field.placeholder || ''}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">\`;
        }
    }

    renderLockedField(field) {
        return \`
            <div class="relative">
                <div class="absolute inset-0 bg-gray-100 bg-opacity-90 rounded-lg flex items-center justify-center cursor-pointer" onclick="tool.showUpgradeModal()">
                    <div class="text-center">
                        <svg class="w-8 h-8 mx-auto mb-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
                        </svg>
                        <p class="text-sm font-medium">Premium Feature</p>
                        <p class="text-xs text-gray-500">Click to unlock</p>
                    </div>
                </div>
                <div class="blur-sm pointer-events-none">
                    \${this.renderFieldInput(field)}
                </div>
            </div>\`;
    }

    initializeFields() {
        // Initialize range sliders
        document.querySelectorAll('input[type="range"]').forEach(slider => {
            slider.addEventListener('input', (e) => {
                e.target.nextElementSibling.nextElementSibling.value = e.target.value;
            });
        });
    }

    updateProgress() {
        const progress = ((this.currentStep + 1) / this.steps.length) * 100;
        document.getElementById('progressBar').style.width = \`\${progress}%\`;
        document.getElementById('progressText').textContent = \`Step \${this.currentStep + 1} of \${this.steps.length}\`;
        
        // Update navigation buttons
        document.getElementById('prevButton').disabled = this.currentStep === 0;
        document.getElementById('nextButton').textContent = 
            this.currentStep === this.steps.length - 1 ? 'Get Results' : 'Next →';
    }

    bindEvents() {
        document.getElementById('prevButton').addEventListener('click', () => this.previousStep());
        document.getElementById('nextButton').addEventListener('click', () => this.nextStep());
        
        // Bind upgrade button if present
        const upgradeButton = document.getElementById('upgradeButton');
        if (upgradeButton) {
            upgradeButton.addEventListener('click', () => this.showUpgradeModal());
        }
    }

    previousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.renderStep();
        }
    }

    async nextStep() {
        // Validate current step
        if (!this.validateStep()) {
            return;
        }
        
        // Save responses
        this.saveStepResponses();
        
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.renderStep();
        } else {
            // Final step - calculate results
            await this.calculateResults();
        }
    }

    validateStep() {
        const step = this.steps[this.currentStep];
        const stepFields = this.fields.filter(f => f.step_id === step.id);
        
        for (const field of stepFields) {
            if (field.is_required && !field.is_premium) {
                const input = document.getElementById(field.id);
                if (input && !input.value) {
                    alert(\`Please fill in the required field: \${field.label}\`);
                    input.focus();
                    return false;
                }
            }
        }
        
        return true;
    }

    saveStepResponses() {
        const step = this.steps[this.currentStep];
        const stepFields = this.fields.filter(f => f.step_id === step.id);
        
        stepFields.forEach(field => {
            const input = document.getElementById(field.id);
            if (input) {
                if (field.field_type === 'multiselect') {
                    const checkboxes = document.querySelectorAll(\`input[name="\${field.name}[]"]:checked\`);
                    this.responses[field.id] = Array.from(checkboxes).map(cb => cb.value);
                } else {
                    this.responses[field.id] = input.value;
                }
            }
        });
    }

    async calculateResults() {
        try {
            // Show loading
            document.getElementById('stepContainer').innerHTML = \`
                <div class="text-center py-8">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p class="mt-4 text-gray-600">Analyzing your responses...</p>
                </div>\`;
            
            if (this.includeCalculations) {
                // Send to calculation endpoint
                const response = await fetch(\`/api/public/tools/\${this.subdomain}/calculate\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        responses: this.responses,
                        userPackage: this.userPackage
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.displayResults(data.data);
                } else {
                    throw new Error(data.error);
                }
            } else {
                // Simple AI generation without calculations
                await this.generateSimpleResults();
            }
            
        } catch (error) {
            console.error('Calculation error:', error);
            this.showError('Failed to generate results');
        }
    }

    displayResults(results) {
        const container = document.getElementById('stepContainer');
        
        let html = \`
            <div class="space-y-6">
                <div>
                    <h2 class="text-3xl font-bold mb-4">Your Results</h2>
                    \${results.score ? \`
                    <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 mb-6">
                        <div class="text-center">
                            <div class="text-5xl font-bold \${this.getScoreColor(results.score)}">
                                \${results.score}%
                            </div>
                            <p class="text-xl mt-2">\${results.interpretation}</p>
                        </div>
                    </div>\` : ''}
                </div>
                
                \${results.analysis ? \`
                <div class="bg-white rounded-lg border p-6">
                    <h3 class="text-xl font-semibold mb-3">Analysis</h3>
                    <div class="prose max-w-none">
                        \${results.analysis}
                    </div>
                </div>\` : ''}
                
                \${results.factors ? \`
                <div class="bg-white rounded-lg border p-6">
                    <h3 class="text-xl font-semibold mb-3">Contributing Factors</h3>
                    <div class="space-y-3">
                        \${results.factors.increase ? \`
                        <div>
                            <h4 class="font-medium text-green-700 mb-2">Positive Factors</h4>
                            <ul class="list-disc list-inside space-y-1">
                                \${results.factors.increase.map(f => \`<li>\${f}</li>\`).join('')}
                            </ul>
                        </div>\` : ''}
                        
                        \${results.factors.decrease ? \`
                        <div>
                            <h4 class="font-medium text-red-700 mb-2">Risk Factors</h4>
                            <ul class="list-disc list-inside space-y-1">
                                \${results.factors.decrease.map(f => \`<li>\${f}</li>\`).join('')}
                            </ul>
                        </div>\` : ''}
                    </div>
                </div>\` : ''}
                
                \${results.recommendations ? \`
                <div class="bg-blue-50 rounded-lg p-6">
                    <h3 class="text-xl font-semibold mb-3">Recommendations</h3>
                    <ul class="space-y-2">
                        \${results.recommendations.map(r => \`
                        <li class="flex items-start">
                            <svg class="w-5 h-5 text-blue-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd"/>
                            </svg>
                            <span>\${r}</span>
                        </li>\`).join('')}
                    </ul>
                </div>\` : ''}
                
                \${results.upgradePrompts && results.upgradePrompts.length > 0 ? \`
                <div class="bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg p-6">
                    <h3 class="text-xl font-semibold mb-3">Unlock More Insights</h3>
                    <p class="mb-4">Upgrade to premium for:</p>
                    <ul class="space-y-2 mb-4">
                        \${results.upgradePrompts.map(p => \`<li>• \${p}</li>\`).join('')}
                    </ul>
                    <button onclick="tool.showUpgradeModal()" class="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:shadow-lg">
                        Upgrade Now
                    </button>
                </div>\` : ''}
            </div>
        \`;
        
        container.innerHTML = html;
        
        // Hide navigation buttons
        document.getElementById('prevButton').style.display = 'none';
        document.getElementById('nextButton').style.display = 'none';
        
        // Track completion
        this.trackCompletion();
    }

    getScoreColor(score) {
        if (score >= 75) return 'text-green-600';
        if (score >= 50) return 'text-yellow-600';
        if (score >= 25) return 'text-orange-600';
        return 'text-red-600';
    }

    async generateSimpleResults() {
        // For non-calculation tools, generate AI response
        const response = await fetch(\`/api/public/tools/\${this.subdomain}/generate\`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                responses: this.responses,
                projectConfig: this.projectConfig
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            this.displaySimpleResults(data.data);
        } else {
            throw new Error(data.error);
        }
    }

    displaySimpleResults(results) {
        const container = document.getElementById('stepContainer');
        container.innerHTML = \`
            <div class="space-y-6">
                <h2 class="text-3xl font-bold mb-4">Your Generated Content</h2>
                <div class="bg-white rounded-lg border p-6">
                    <div class="prose max-w-none">
                        \${results.content}
                    </div>
                </div>
                \${results.additionalSuggestions ? \`
                <div class="bg-blue-50 rounded-lg p-6">
                    <h3 class="text-xl font-semibold mb-3">Additional Suggestions</h3>
                    \${results.additionalSuggestions}
                </div>\` : ''}
            </div>\`;
        
        // Hide navigation
        document.getElementById('prevButton').style.display = 'none';
        document.getElementById('nextButton').style.display = 'none';
    }

    showUpgradeModal() {
        const modal = document.getElementById('upgradeModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    showError(message) {
        document.getElementById('stepContainer').innerHTML = \`
            <div class="bg-red-50 border border-red-200 rounded-lg p-6">
                <h3 class="text-red-800 font-semibold mb-2">Error</h3>
                <p class="text-red-600">\${message}</p>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                    Try Again
                </button>
            </div>\`;
    }

    trackCompletion() {
        // Send analytics
        fetch('/api/public/analytics/track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: this.projectId,
                event: 'completion',
                data: {
                    responses: Object.keys(this.responses).length,
                    userPackage: this.userPackage
                }
            })
        }).catch(console.error);
    }
}

// Utility functions
function closeUpgradeModal() {
    const modal = document.getElementById('upgradeModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function upgradeToPremium() {
    window.location.href = '/pricing';
}

// Initialize tool
const tool = new AITool();`;
    }

    /**
     * Generate CSS for deployed tool
     */
    generateCSS(project) {
        return `/* ${project.name} - Custom Styles */

:root {
    --primary-color: #3B82F6;
    --secondary-color: #8B5CF6;
    --success-color: #10B981;
    --warning-color: #F59E0B;
    --danger-color: #EF4444;
}

/* Premium field styling */
.premium-locked {
    position: relative;
}

.premium-locked::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%);
    border-radius: 0.5rem;
    pointer-events: none;
}

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.field-container {
    animation: fadeIn 0.3s ease-out;
}

/* Custom scrollbar */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: #f3f4f6;
}

::-webkit-scrollbar-thumb {
    background: #9ca3af;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
}

/* Loading spinner */
@keyframes spin {
    to { transform: rotate(360deg); }
}

.animate-spin {
    animation: spin 1s linear infinite;
}

/* Result cards */
.result-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 1rem;
    transition: all 0.3s ease;
}

.result-card:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Progress bar animation */
#progressBar {
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Mobile responsive adjustments */
@media (max-width: 640px) {
    .field-container {
        margin-bottom: 1.5rem;
    }
    
    h2 {
        font-size: 1.5rem;
    }
    
    .result-card {
        padding: 1rem;
    }
}

/* Print styles */
@media print {
    header, #progressContainer, #prevButton, #nextButton, #upgradeButton, #upgradeModal {
        display: none !important;
    }
    
    main {
        max-width: 100%;
    }
}`;
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Validates and enhances analysis from AI
     */
    validateAndEnhanceAnalysis(analysis) {
        // Ensure all required fields exist
        if (!analysis.suggestedCategory) {
            analysis.suggestedCategory = 'utility';
        }
        
        if (!analysis.complexity || analysis.complexity < 1 || analysis.complexity > 5) {
            analysis.complexity = 3;
        }
        
        if (!analysis.calculationType) {
            analysis.calculationType = this.toolCategories[analysis.suggestedCategory]?.defaultCalculationType || 'none';
        }
        
        if (!Array.isArray(analysis.suggestedFields)) {
            analysis.suggestedFields = [];
        }
        
        if (!Array.isArray(analysis.suggestedSteps)) {
            analysis.suggestedSteps = [];
        }
        
        if (!analysis.feasibility) {
            analysis.feasibility = {
                isFeasible: true,
                limitations: [],
                recommendations: []
            };
        }
        
        return analysis;
    }

    /**
     * Generates default analysis when AI fails
     */
    getDefaultAnalysis(description) {
        return {
            suggestedCategory: 'utility',
            complexity: 2,
            calculationType: 'none',
            suggestedFields: [
                {
                    name: 'user_input',
                    label: 'Your Input',
                    type: 'text',
                    required: true,
                    weight: 0,
                    isPremium: false,
                    helpText: 'Enter your information',
                    placeholder: 'Type here...'
                }
            ],
            suggestedSteps: [
                {
                    name: 'main',
                    description: 'Main input step',
                    fields: ['user_input']
                }
            ],
            systemPrompt: `You are a helpful AI assistant for: ${description}`,
            estimatedDevelopmentTime: '5 minutes',
            feasibility: {
                isFeasible: true,
                limitations: [],
                recommendations: ['AI analysis unavailable - using default configuration']
            }
        };
    }

    /**
     * Generates default structure when AI fails
     */
    generateDefaultStructure(template, projectConfig) {
        return {
            steps: [
                {
                    name: 'basic_info',
                    title: 'Basic Information',
                    subtitle: 'Let\'s start with some basic details',
                    description: 'Please provide the following information',
                    order: 1,
                    required: true,
                    weight: 1,
                    fields: []
                }
            ],
            fields: []
        };
    }

    /**
     * Enhances structure with additional metadata
     */
    enhanceStructure(structure, template) {
        // Add template metadata
        structure.templateId = template.id;
        structure.templateCategory = template.category;
        
        // Ensure minimum viable structure
        if (!structure.steps || structure.steps.length === 0) {
            structure.steps = this.generateDefaultStructure(template, {}).steps;
        }
        
        // Add unique IDs if missing
        structure.steps = structure.steps.map((step, index) => ({
            ...step,
            id: step.id || uuidv4(),
            order: step.order || index + 1
        }));
        
        // Enhance fields
        if (structure.fields) {
            structure.fields = structure.fields.map(field => this.validateField(field));
        }
        
        return structure;
    }

    /**
     * Validates and enhances a field object
     */
    validateField(field) {
        // Ensure all required properties
        return {
            id: field.id || uuidv4(),
            name: field.name || `field_${Date.now()}`,
            label: field.label || 'Field',
            type: field.type || field.field_type || 'text',
            field_type: field.field_type || field.type || 'text',
            placeholder: field.placeholder || '',
            description: field.description || '',
            required: field.required || field.is_required || false,
            is_required: field.is_required || field.required || false,
            order: field.order || field.field_order || 0,
            field_order: field.field_order || field.order || 0,
            weight: field.weight || field.weight_in_calculation || 0,
            weight_in_calculation: field.weight_in_calculation || field.weight || 0,
            isPremium: field.isPremium || field.is_premium || false,
            is_premium: field.is_premium || field.isPremium || false,
            packageId: field.packageId || field.required_package_id || null,
            required_package_id: field.required_package_id || field.packageId || null,
            helpText: field.helpText || field.help_text || '',
            help_text: field.help_text || field.helpText || '',
            validation: field.validation || field.validation_rules || {},
            validation_rules: field.validation_rules || field.validation || {},
            choices: field.choices || []
        };
    }

    /**
     * Generates default field recommendations
     */
    generateDefaultFieldRecommendations(project, count) {
        const recommendations = [];
        const fieldTypes = ['text', 'number', 'select', 'textarea', 'date'];
        
        for (let i = 0; i < count; i++) {
            recommendations.push({
                name: `field_${Date.now()}_${i}`,
                label: `Additional Field ${i + 1}`,
                type: fieldTypes[i % fieldTypes.length],
                description: 'Additional information field',
                placeholder: 'Enter value',
                required: i === 0,
                weight: Math.floor(Math.random() * 50) + 10,
                isPremium: i > 2,
                helpText: 'Please provide this information',
                validation: {}
            });
        }
        
        return recommendations;
    }
}

module.exports = UniversalGenerator;
