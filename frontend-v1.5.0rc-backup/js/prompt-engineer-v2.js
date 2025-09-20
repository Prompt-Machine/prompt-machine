// ========================================
// PROMPT ENGINEER v2.0.0rc - Frontend JavaScript
// Universal AI Tool Creator Interface
// ========================================

class PromptEngineerV2 {
    constructor() {
        this.currentStep = 1;
        this.projectData = {
            name: '',
            description: '',
            toolType: null,
            targetAudience: 'general',
            complexity: 'auto',
            enableCalculations: false,
            enablePermissions: true,
            aiRole: '',
            aiPersona: '',
            systemPrompt: '',
            steps: [],
            fields: [],
            permissions: {},
            subdomain: ''
        };
        this.currentProjectId = null;
        this.templates = [];
        this.fieldIdCounter = 0;
        this.stepIdCounter = 0;
        this.draggedField = null;
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadProjects();
        await this.loadTemplates();
        this.initializeDragAndDrop();
    }

    bindEvents() {
        // Step 1 Events
        document.getElementById('analyzeButton')?.addEventListener('click', () => this.analyzeToolRequest());
        document.querySelectorAll('.tool-category-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectCategory(e.target.closest('.tool-category-card').dataset.category));
        });

        // Step 2 Events
        document.getElementById('addStepButton')?.addEventListener('click', () => this.addStep());
        document.getElementById('addFieldButton')?.addEventListener('click', () => this.openFieldEditor());
        document.getElementById('aiGenerateFields')?.addEventListener('click', () => this.aiGenerateFields());
        document.getElementById('backToStep1')?.addEventListener('click', () => this.goToStep(1));
        document.getElementById('continueToStep3')?.addEventListener('click', () => this.goToStep(3));

        // Step 3 Events
        document.getElementById('backToStep2')?.addEventListener('click', () => this.goToStep(2));
        document.getElementById('continueToStep4')?.addEventListener('click', () => this.goToStep(4));

        // Step 4 Events
        document.getElementById('backToStep3')?.addEventListener('click', () => this.goToStep(3));
        document.getElementById('deployButton')?.addEventListener('click', () => this.deployTool());
        document.getElementById('createAnotherButton')?.addEventListener('click', () => this.resetWizard());

        // Field Editor Events
        document.getElementById('fieldType')?.addEventListener('change', (e) => this.onFieldTypeChange(e));
        document.getElementById('addChoiceButton')?.addEventListener('click', () => this.addChoice());
        document.getElementById('saveField')?.addEventListener('click', () => this.saveField());
        document.getElementById('cancelFieldEdit')?.addEventListener('click', () => this.closeFieldEditor());

        // Other Events
        document.getElementById('helpButton')?.addEventListener('click', () => this.showHelp());
        document.getElementById('refreshProjects')?.addEventListener('click', () => this.loadProjects());

        // Input Events
        document.getElementById('toolName')?.addEventListener('input', (e) => {
            this.projectData.name = e.target.value;
            this.generateSubdomain();
        });
        document.getElementById('toolDescription')?.addEventListener('input', (e) => {
            this.projectData.description = e.target.value;
        });
        document.getElementById('targetAudience')?.addEventListener('change', (e) => {
            this.projectData.targetAudience = e.target.value;
        });
        document.getElementById('complexity')?.addEventListener('change', (e) => {
            this.projectData.complexity = e.target.value;
        });
        document.getElementById('enableCalculations')?.addEventListener('change', (e) => {
            this.projectData.enableCalculations = e.target.checked;
        });
        document.getElementById('enablePermissions')?.addEventListener('change', (e) => {
            this.projectData.enablePermissions = e.target.checked;
        });
    }

    // ========================================
    // STEP 1: TOOL DESCRIPTION
    // ========================================

    async analyzeToolRequest() {
        const name = document.getElementById('toolName').value.trim();
        const description = document.getElementById('toolDescription').value.trim();

        if (!name || !description) {
            this.showNotification('Please provide both a name and description for your tool', 'error');
            return;
        }

        this.projectData.name = name;
        this.projectData.description = description;

        // Show loading state
        const button = document.getElementById('analyzeButton');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...';
        button.disabled = true;

        try {
            const response = await PMConfig.fetch('/api/v2/prompt-engineer/analyze-request', {
                method: 'POST',
                body: JSON.stringify({
                    description: description,
                    toolType: this.projectData.toolType,
                    targetAudience: this.projectData.targetAudience,
                    complexity: this.projectData.complexity
                })
            });

            if (response.success) {
                const analysis = response.data.analysis;
                
                // Store AI suggestions
                this.projectData.aiSuggestions = analysis;
                this.projectData.toolType = analysis.suggestedCategory;
                
                // Generate initial structure based on AI suggestions
                this.generateInitialStructure(analysis);
                
                // Move to step 2
                this.goToStep(2);
                
                // Show AI suggestions
                this.displayAISuggestions(analysis);
            } else {
                throw new Error(response.error || 'Analysis failed');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            this.showNotification('Failed to analyze tool request. Please try again.', 'error');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    selectCategory(category) {
        this.projectData.toolType = category;
        
        // Update UI to show selection
        document.querySelectorAll('.tool-category-card').forEach(card => {
            if (card.dataset.category === category) {
                card.classList.add('border-purple-500', 'bg-purple-50');
            } else {
                card.classList.remove('border-purple-500', 'bg-purple-50');
            }
        });
    }

    generateInitialStructure(analysis) {
        // Clear existing structure
        this.projectData.steps = [];
        this.projectData.fields = [];

        // Generate steps based on AI suggestions
        if (analysis.suggestedSteps && analysis.suggestedSteps.length > 0) {
            analysis.suggestedSteps.forEach((step, index) => {
                this.projectData.steps.push({
                    id: `step_${++this.stepIdCounter}`,
                    name: step.name,
                    title: step.title || step.name,
                    subtitle: step.description,
                    order: index + 1,
                    fields: []
                });
            });
        } else {
            // Create default steps
            this.projectData.steps = [
                {
                    id: `step_${++this.stepIdCounter}`,
                    name: 'basic_info',
                    title: 'Basic Information',
                    subtitle: 'Let\'s start with some basic details',
                    order: 1,
                    fields: []
                }
            ];
        }

        // Generate fields based on AI suggestions
        if (analysis.suggestedFields && analysis.suggestedFields.length > 0) {
            analysis.suggestedFields.forEach((field, index) => {
                const fieldData = {
                    id: `field_${++this.fieldIdCounter}`,
                    name: field.name,
                    label: field.label,
                    type: field.type,
                    placeholder: field.placeholder || '',
                    helpText: field.helpText || '',
                    required: field.required || false,
                    weight: field.weight || 0,
                    isPremium: field.isPremium || false,
                    order: index + 1,
                    choices: field.choices || [],
                    validation: field.validation || {},
                    stepId: this.projectData.steps[0]?.id
                };

                this.projectData.fields.push(fieldData);
                
                // Assign field to first step by default
                if (this.projectData.steps[0]) {
                    this.projectData.steps[0].fields.push(fieldData.id);
                }
            });
        }

        // Set AI-generated prompts
        this.projectData.aiRole = analysis.aiRole || `Expert ${this.projectData.toolType} assistant`;
        this.projectData.systemPrompt = analysis.systemPrompt || '';
    }

    displayAISuggestions(analysis) {
        const suggestionsDiv = document.getElementById('aiSuggestions');
        const suggestionsList = document.getElementById('suggestionsList');
        
        if (analysis.feasibility && !analysis.feasibility.isFeasible) {
            suggestionsList.innerHTML = `
                <p class="text-red-600 font-semibold mb-2">⚠️ Feasibility Warning</p>
                <ul class="list-disc list-inside">
                    ${analysis.feasibility.limitations.map(l => `<li>${l}</li>`).join('')}
                </ul>
            `;
        } else {
            suggestionsList.innerHTML = `
                <p class="mb-2">✨ Tool Type: <strong>${this.formatCategory(analysis.suggestedCategory)}</strong></p>
                <p class="mb-2">📊 Complexity: Level ${analysis.complexity} of 5</p>
                <p class="mb-2">🔧 Calculation Type: ${this.formatCalculationType(analysis.calculationType)}</p>
                <p class="mb-2">⏱️ Estimated Setup Time: ${analysis.estimatedDevelopmentTime || '10 minutes'}</p>
                ${analysis.feasibility?.recommendations ? `
                <div class="mt-2">
                    <p class="font-semibold">Recommendations:</p>
                    <ul class="list-disc list-inside">
                        ${analysis.feasibility.recommendations.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>` : ''}
            `;
        }
        
        suggestionsDiv.classList.remove('hidden');
    }

    // ========================================
    // STEP 2: FIELD CONFIGURATION
    // ========================================

    renderSteps() {
        const container = document.getElementById('stepsContainer');
        container.innerHTML = '';

        this.projectData.steps.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'bg-gray-50 rounded-lg p-4';
            stepDiv.innerHTML = `
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center">
                        <span class="bg-purple-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-semibold mr-3">
                            ${index + 1}
                        </span>
                        <div>
                            <input type="text" value="${step.title}" class="font-semibold bg-transparent border-b border-gray-300 focus:border-purple-500 outline-none"
                                onchange="promptEngineer.updateStep('${step.id}', 'title', this.value)">
                            <input type="text" value="${step.subtitle}" class="text-sm text-gray-600 bg-transparent border-b border-gray-300 focus:border-purple-500 outline-none w-full mt-1"
                                onchange="promptEngineer.updateStep('${step.id}', 'subtitle', this.value)">
                        </div>
                    </div>
                    <button onclick="promptEngineer.removeStep('${step.id}')" class="text-red-500 hover:text-red-700">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="text-sm text-gray-500">
                    ${step.fields.length} field(s) in this step
                </div>
            `;
            container.appendChild(stepDiv);
        });
    }

    renderFields() {
        const container = document.getElementById('fieldsContainer');
        container.innerHTML = '';

        this.projectData.fields.forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field-item bg-white border rounded-lg p-4 cursor-move';
            fieldDiv.draggable = true;
            fieldDiv.dataset.fieldId = field.id;
            
            fieldDiv.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center flex-1">
                        <i class="fas fa-grip-vertical text-gray-400 mr-3"></i>
                        <div class="flex-1">
                            <div class="flex items-center">
                                <span class="font-medium">${field.label}</span>
                                <span class="ml-2 text-xs bg-gray-200 px-2 py-1 rounded">${field.type}</span>
                                ${field.isPremium ? '<span class="ml-2 text-xs premium-badge text-white px-2 py-1 rounded">Premium</span>' : ''}
                                ${field.required ? '<span class="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Required</span>' : ''}
                            </div>
                            <div class="text-sm text-gray-600 mt-1">
                                ${field.helpText || 'No help text'}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="promptEngineer.editField('${field.id}')" class="text-blue-500 hover:text-blue-700">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="promptEngineer.removeField('${field.id}')" class="text-red-500 hover:text-red-700">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            
            container.appendChild(fieldDiv);
        });
    }

    addStep() {
        const step = {
            id: `step_${++this.stepIdCounter}`,
            name: `step_${this.stepIdCounter}`,
            title: `Step ${this.projectData.steps.length + 1}`,
            subtitle: 'Configure this step',
            order: this.projectData.steps.length + 1,
            fields: []
        };
        
        this.projectData.steps.push(step);
        this.renderSteps();
    }

    updateStep(stepId, property, value) {
        const step = this.projectData.steps.find(s => s.id === stepId);
        if (step) {
            step[property] = value;
        }
    }

    removeStep(stepId) {
        if (this.projectData.steps.length <= 1) {
            this.showNotification('You must have at least one step', 'error');
            return;
        }
        
        this.projectData.steps = this.projectData.steps.filter(s => s.id !== stepId);
        this.renderSteps();
    }

    async aiGenerateFields() {
        const button = document.getElementById('aiGenerateFields');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
        button.disabled = true;

        try {
            // First create the project if not exists
            if (!this.currentProjectId) {
                await this.createProject();
            }

            const response = await PMConfig.fetch(`/api/v2/prompt-engineer/projects/${this.currentProjectId}/generate-fields`, {
                method: 'POST',
                body: JSON.stringify({
                    stepId: this.projectData.steps[0]?.id,
                    context: this.projectData.description,
                    count: 5
                })
            });

            if (response.success) {
                const recommendations = response.data.recommendations;
                
                // Add generated fields
                recommendations.forEach(field => {
                    const fieldData = {
                        id: `field_${++this.fieldIdCounter}`,
                        name: field.name,
                        label: field.label,
                        type: field.type,
                        placeholder: field.placeholder || '',
                        helpText: field.helpText || '',
                        required: field.required || false,
                        weight: field.weight || 0,
                        isPremium: field.isPremium || false,
                        order: this.projectData.fields.length + 1,
                        choices: field.choices || [],
                        stepId: this.projectData.steps[0]?.id
                    };
                    
                    this.projectData.fields.push(fieldData);
                    
                    if (this.projectData.steps[0]) {
                        this.projectData.steps[0].fields.push(fieldData.id);
                    }
                });
                
                this.renderFields();
                this.showNotification(`Added ${recommendations.length} AI-generated fields`, 'success');
            }
        } catch (error) {
            console.error('Field generation error:', error);
            this.showNotification('Failed to generate fields', 'error');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    openFieldEditor(fieldId = null) {
        const modal = document.getElementById('fieldEditorModal');
        const field = fieldId ? this.projectData.fields.find(f => f.id === fieldId) : null;
        
        // Reset form
        document.getElementById('fieldName').value = field?.name || '';
        document.getElementById('fieldLabel').value = field?.label || '';
        document.getElementById('fieldType').value = field?.type || 'text';
        document.getElementById('fieldPlaceholder').value = field?.placeholder || '';
        document.getElementById('fieldHelpText').value = field?.helpText || '';
        document.getElementById('fieldWeight').value = field?.weight || 0;
        document.getElementById('fieldOrder').value = field?.order || this.projectData.fields.length + 1;
        document.getElementById('fieldRequired').checked = field?.required || false;
        document.getElementById('fieldPremium').checked = field?.isPremium || false;
        
        // Store current editing field
        this.editingFieldId = fieldId;
        
        // Handle choices for select/multiselect
        this.onFieldTypeChange({ target: { value: field?.type || 'text' }});
        if (field?.choices) {
            this.renderChoices(field.choices);
        }
        
        modal.classList.remove('hidden');
    }

    closeFieldEditor() {
        document.getElementById('fieldEditorModal').classList.add('hidden');
        this.editingFieldId = null;
    }

    saveField() {
        const fieldData = {
            id: this.editingFieldId || `field_${++this.fieldIdCounter}`,
            name: document.getElementById('fieldName').value || `field_${this.fieldIdCounter}`,
            label: document.getElementById('fieldLabel').value,
            type: document.getElementById('fieldType').value,
            placeholder: document.getElementById('fieldPlaceholder').value,
            helpText: document.getElementById('fieldHelpText').value,
            weight: parseInt(document.getElementById('fieldWeight').value) || 0,
            order: parseInt(document.getElementById('fieldOrder').value) || 1,
            required: document.getElementById('fieldRequired').checked,
            isPremium: document.getElementById('fieldPremium').checked,
            stepId: this.projectData.steps[0]?.id,
            choices: this.getChoicesFromEditor()
        };
        
        if (this.editingFieldId) {
            // Update existing field
            const index = this.projectData.fields.findIndex(f => f.id === this.editingFieldId);
            if (index >= 0) {
                this.projectData.fields[index] = fieldData;
            }
        } else {
            // Add new field
            this.projectData.fields.push(fieldData);
            if (this.projectData.steps[0]) {
                this.projectData.steps[0].fields.push(fieldData.id);
            }
        }
        
        this.renderFields();
        this.closeFieldEditor();
    }

    editField(fieldId) {
        this.openFieldEditor(fieldId);
    }

    removeField(fieldId) {
        this.projectData.fields = this.projectData.fields.filter(f => f.id !== fieldId);
        
        // Remove from steps
        this.projectData.steps.forEach(step => {
            step.fields = step.fields.filter(fId => fId !== fieldId);
        });
        
        this.renderFields();
    }

    onFieldTypeChange(e) {
        const choicesContainer = document.getElementById('choicesContainer');
        if (e.target.value === 'select' || e.target.value === 'multiselect') {
            choicesContainer.classList.remove('hidden');
        } else {
            choicesContainer.classList.add('hidden');
        }
    }

    addChoice() {
        const choicesList = document.getElementById('choicesList');
        const choiceDiv = document.createElement('div');
        choiceDiv.className = 'flex items-center space-x-2';
        choiceDiv.innerHTML = `
            <input type="text" class="choice-text flex-1 px-2 py-1 border border-gray-300 rounded" placeholder="Choice text">
            <input type="text" class="choice-value flex-1 px-2 py-1 border border-gray-300 rounded" placeholder="Value">
            <input type="number" class="choice-weight w-20 px-2 py-1 border border-gray-300 rounded" placeholder="Weight" min="0" max="100">
            <button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700">
                <i class="fas fa-times"></i>
            </button>
        `;
        choicesList.appendChild(choiceDiv);
    }

    renderChoices(choices) {
        const choicesList = document.getElementById('choicesList');
        choicesList.innerHTML = '';
        
        choices.forEach(choice => {
            const choiceDiv = document.createElement('div');
            choiceDiv.className = 'flex items-center space-x-2';
            choiceDiv.innerHTML = `
                <input type="text" class="choice-text flex-1 px-2 py-1 border border-gray-300 rounded" value="${choice.text || choice.choice_text || ''}" placeholder="Choice text">
                <input type="text" class="choice-value flex-1 px-2 py-1 border border-gray-300 rounded" value="${choice.value || choice.choice_value || ''}" placeholder="Value">
                <input type="number" class="choice-weight w-20 px-2 py-1 border border-gray-300 rounded" value="${choice.weight || 0}" placeholder="Weight" min="0" max="100">
                <button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-times"></i>
                </button>
            `;
            choicesList.appendChild(choiceDiv);
        });
    }

    getChoicesFromEditor() {
        const choices = [];
        const choiceElements = document.querySelectorAll('#choicesList > div');
        
        choiceElements.forEach(div => {
            const text = div.querySelector('.choice-text').value;
            const value = div.querySelector('.choice-value').value;
            const weight = parseInt(div.querySelector('.choice-weight').value) || 0;
            
            if (text) {
                choices.push({
                    text,
                    value: value || text,
                    weight
                });
            }
        });
        
        return choices;
    }

    initializeDragAndDrop() {
        const container = document.getElementById('fieldsContainer');
        if (!container) return;

        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('field-item')) {
                this.draggedField = e.target;
                e.target.classList.add('dragging');
            }
        });

        container.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('field-item')) {
                e.target.classList.remove('dragging');
                this.draggedField = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(this.draggedField);
            } else {
                container.insertBefore(this.draggedField, afterElement);
            }
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.field-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // ========================================
    // STEP 3: PERMISSIONS
    // ========================================

    renderPermissions() {
        const container = document.getElementById('fieldPermissionsList');
        const freeCount = document.getElementById('freeFieldCount');
        const premiumCount = document.getElementById('premiumFieldCount');
        const enterpriseCount = document.getElementById('enterpriseFieldCount');
        
        let free = 0, premium = 0, enterprise = 0;
        
        container.innerHTML = '';
        
        this.projectData.fields.forEach(field => {
            const permDiv = document.createElement('div');
            permDiv.className = 'flex items-center justify-between bg-white border rounded-lg p-4';
            
            const packageLevel = field.isPremium ? 'premium' : 'free';
            if (packageLevel === 'free') free++;
            else if (packageLevel === 'premium') premium++;
            else if (packageLevel === 'enterprise') enterprise++;
            
            permDiv.innerHTML = `
                <div class="flex items-center flex-1">
                    <div>
                        <span class="font-medium">${field.label}</span>
                        <span class="ml-2 text-xs bg-gray-200 px-2 py-1 rounded">${field.type}</span>
                    </div>
                </div>
                <div>
                    <select class="px-3 py-1 border border-gray-300 rounded-lg" 
                            onchange="promptEngineer.updateFieldPermission('${field.id}', this.value)">
                        <option value="free" ${packageLevel === 'free' ? 'selected' : ''}>Free</option>
                        <option value="premium" ${packageLevel === 'premium' ? 'selected' : ''}>Premium</option>
                        <option value="enterprise" ${packageLevel === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                    </select>
                </div>
            `;
            
            container.appendChild(permDiv);
        });
        
        freeCount.textContent = free;
        premiumCount.textContent = premium;
        enterpriseCount.textContent = enterprise;
    }

    updateFieldPermission(fieldId, level) {
        const field = this.projectData.fields.find(f => f.id === fieldId);
        if (field) {
            field.isPremium = level !== 'free';
            field.packageLevel = level;
            this.renderPermissions();
        }
    }

    // ========================================
    // STEP 4: DEPLOY
    // ========================================

    updateDeploymentSummary() {
        document.getElementById('summaryName').textContent = this.projectData.name || '-';
        document.getElementById('summaryType').textContent = this.formatCategory(this.projectData.toolType);
        document.getElementById('summarySteps').textContent = this.projectData.steps.length;
        document.getElementById('summaryFields').textContent = this.projectData.fields.length;
        document.getElementById('summaryCalculations').textContent = this.projectData.enableCalculations ? 'Enabled' : 'Disabled';
        document.getElementById('summaryPremium').textContent = this.projectData.fields.filter(f => f.isPremium).length;
        
        // Set subdomain
        document.getElementById('subdomain').value = this.projectData.subdomain;
    }

    async deployTool() {
        const subdomain = document.getElementById('subdomain').value.trim();
        const accessLevel = document.getElementById('accessLevel').value;
        
        if (!subdomain) {
            this.showNotification('Please provide a subdomain', 'error');
            return;
        }
        
        // Show loading
        document.getElementById('deploymentStatus').classList.remove('hidden');
        document.getElementById('deployButton').disabled = true;
        
        try {
            // Create project if not exists
            if (!this.currentProjectId) {
                await this.createProject();
            }
            
            // Deploy project
            const response = await PMConfig.fetch(`/api/v2/prompt-engineer/projects/${this.currentProjectId}/deploy`, {
                method: 'POST',
                body: JSON.stringify({
                    subdomain,
                    accessLevel,
                    enableAnalytics: document.getElementById('enableAnalytics').checked,
                    enableAds: document.getElementById('enableAds').checked
                })
            });
            
            if (response.success) {
                const toolUrl = response.data.url;
                
                // Hide loading, show success
                document.getElementById('deploymentStatus').classList.add('hidden');
                document.getElementById('deploymentSuccess').classList.remove('hidden');
                document.getElementById('toolUrl').href = toolUrl;
                
                this.showNotification('Tool deployed successfully!', 'success');
            } else {
                throw new Error(response.error || 'Deployment failed');
            }
        } catch (error) {
            console.error('Deployment error:', error);
            this.showNotification('Failed to deploy tool', 'error');
            document.getElementById('deploymentStatus').classList.add('hidden');
        } finally {
            document.getElementById('deployButton').disabled = false;
        }
    }

    async createProject() {
        try {
            const response = await PMConfig.fetch('/api/v2/prompt-engineer/create-project', {
                method: 'POST',
                body: JSON.stringify({
                    name: this.projectData.name,
                    description: this.projectData.description,
                    toolType: this.projectData.toolType,
                    aiRole: this.projectData.aiRole,
                    aiPersona: this.projectData.aiPersona || `Professional ${this.projectData.toolType} assistant`,
                    systemPrompt: this.projectData.systemPrompt,
                    templateId: null, // We're creating custom structure
                    enableCalculations: this.projectData.enableCalculations,
                    accessLevel: 'public'
                })
            });
            
            if (response.success) {
                this.currentProjectId = response.data.project.id;
                return response.data.project;
            } else {
                throw new Error(response.error || 'Project creation failed');
            }
        } catch (error) {
            console.error('Project creation error:', error);
            throw error;
        }
    }

    generateSubdomain() {
        const name = this.projectData.name || '';
        const subdomain = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 30);
        
        this.projectData.subdomain = subdomain;
        
        if (document.getElementById('subdomain')) {
            document.getElementById('subdomain').value = subdomain;
        }
    }

    // ========================================
    // NAVIGATION
    // ========================================

    goToStep(step) {
        // Hide all steps
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        // Show target step
        document.getElementById(`step${step}Content`).classList.remove('hidden');
        
        // Update indicators
        for (let i = 1; i <= 4; i++) {
            const indicator = document.getElementById(`step${i}Indicator`);
            const line = indicator.nextElementSibling;
            
            if (i < step) {
                indicator.classList.add('bg-purple-600', 'text-white');
                indicator.classList.remove('bg-gray-300', 'text-gray-600');
                if (line) {
                    line.classList.add('bg-purple-600');
                    line.classList.remove('bg-gray-300');
                }
            } else if (i === step) {
                indicator.classList.add('bg-purple-600', 'text-white');
                indicator.classList.remove('bg-gray-300', 'text-gray-600');
                if (line) {
                    line.classList.remove('bg-purple-600');
                    line.classList.add('bg-gray-300');
                }
            } else {
                indicator.classList.remove('bg-purple-600', 'text-white');
                indicator.classList.add('bg-gray-300', 'text-gray-600');
                if (line) {
                    line.classList.remove('bg-purple-600');
                    line.classList.add('bg-gray-300');
                }
            }
        }
        
        // Execute step-specific logic
        if (step === 2) {
            this.renderSteps();
            this.renderFields();
        } else if (step === 3) {
            this.renderPermissions();
        } else if (step === 4) {
            this.updateDeploymentSummary();
        }
        
        this.currentStep = step;
    }

    resetWizard() {
        this.currentStep = 1;
        this.projectData = {
            name: '',
            description: '',
            toolType: null,
            targetAudience: 'general',
            complexity: 'auto',
            enableCalculations: false,
            enablePermissions: true,
            steps: [],
            fields: [],
            permissions: {},
            subdomain: ''
        };
        this.currentProjectId = null;
        
        // Reset form
        document.getElementById('toolName').value = '';
        document.getElementById('toolDescription').value = '';
        document.getElementById('deploymentSuccess').classList.add('hidden');
        
        // Go to step 1
        this.goToStep(1);
    }

    // ========================================
    // PROJECTS MANAGEMENT
    // ========================================

    async loadProjects() {
        try {
            const response = await PMConfig.fetch('/api/v2/prompt-engineer/projects');
            
            if (response.success) {
                this.renderProjects(response.data);
            }
        } catch (error) {
            console.error('Load projects error:', error);
        }
    }

    renderProjects(projects) {
        const container = document.getElementById('projectsList');
        
        if (projects.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center text-gray-500 py-8">
                    <i class="fas fa-folder-open text-4xl mb-3"></i>
                    <p>No tools created yet</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        projects.forEach(project => {
            const projectCard = document.createElement('div');
            projectCard.className = 'bg-white border rounded-lg p-4 hover:shadow-lg transition-shadow';
            
            projectCard.innerHTML = `
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <h3 class="font-semibold">${project.name}</h3>
                        <span class="text-xs bg-gray-200 px-2 py-1 rounded">${project.template_category || project.tool_type || 'custom'}</span>
                    </div>
                    <div class="text-right">
                        ${project.deployed ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Deployed</span>' : ''}
                    </div>
                </div>
                <p class="text-sm text-gray-600 mb-3">${project.description || 'No description'}</p>
                <div class="text-xs text-gray-500 mb-3">
                    <span>${project.step_count || 0} steps</span>
                    <span class="mx-2">•</span>
                    <span>${project.field_count || 0} fields</span>
                </div>
                <div class="flex justify-between">
                    <button onclick="promptEngineer.editProject('${project.id}')" class="text-blue-600 hover:text-blue-800 text-sm">
                        <i class="fas fa-edit mr-1"></i>Edit
                    </button>
                    ${project.deployed && project.subdomain ? 
                        `<a href="https://${project.subdomain}.tool.prompt-machine.com" target="_blank" class="text-green-600 hover:text-green-800 text-sm">
                            <i class="fas fa-external-link-alt mr-1"></i>View
                        </a>` : ''}
                    <button onclick="promptEngineer.deleteProject('${project.id}')" class="text-red-600 hover:text-red-800 text-sm">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </div>
            `;
            
            container.appendChild(projectCard);
        });
    }

    async editProject(projectId) {
        // Load project data and populate wizard
        this.showNotification('Edit functionality coming soon', 'info');
    }

    async deleteProject(projectId) {
        if (!confirm('Are you sure you want to delete this tool?')) return;
        
        try {
            const response = await PMConfig.fetch(`/api/v2/prompt-engineer/projects/${projectId}`, {
                method: 'DELETE'
            });
            
            if (response.success) {
                this.showNotification('Tool deleted successfully', 'success');
                await this.loadProjects();
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('Failed to delete tool', 'error');
        }
    }

    // ========================================
    // UTILITIES
    // ========================================

    async loadTemplates() {
        try {
            const response = await PMConfig.fetch('/api/v2/prompt-engineer/templates');
            if (response.success) {
                this.templates = response.data;
            }
        } catch (error) {
            console.error('Load templates error:', error);
        }
    }

    formatCategory(category) {
        const categories = {
            assessment: 'Assessment Tool',
            creative: 'Creative Tool',
            utility: 'Utility Application',
            business: 'Business Tool',
            educational: 'Educational Tool'
        };
        return categories[category] || category;
    }

    formatCalculationType(type) {
        const types = {
            weighted: 'Weighted Calculation',
            probability: 'Probability Analysis',
            scoring: 'Scoring System',
            decision_tree: 'Decision Tree',
            none: 'No Calculations'
        };
        return types[type] || type;
    }

    showHelp() {
        document.getElementById('helpModal').classList.remove('hidden');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 animate-fade-in`;
        
        // Set color based on type
        const colors = {
            success: 'bg-green-500 text-white',
            error: 'bg-red-500 text-white',
            warning: 'bg-yellow-500 text-white',
            info: 'bg-blue-500 text-white'
        };
        
        notification.classList.add(...colors[type].split(' '));
        notification.innerHTML = `
            <div class="flex items-center">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.promptEngineer = new PromptEngineerV2();
});
