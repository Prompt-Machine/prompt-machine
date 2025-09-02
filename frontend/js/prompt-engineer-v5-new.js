class PromptEngineerV5 {
    constructor() {
        this.sessionId = null;
        this.currentStage = 'expert_selection';
        this.selectedExpertType = null;
        this.fieldRecommendations = [];
        this.selectedFields = [];
        this.apiBase = `${window.CONFIG?.API_URL || 'https://api.prompt-machine.com'}/api/v5/prompt-engineer`;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Prompt Engineer v5');
        
        // Load expert types and start
        await this.loadExpertTypes();
        this.showExpertSelection();
        
        // Set up event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Continue button
        document.getElementById('continue-to-config')?.addEventListener('click', () => {
            this.proceedToConfiguration();
        });
        
        // Request different fields
        document.getElementById('request-different-fields')?.addEventListener('click', () => {
            this.requestDifferentFields();
        });
        
        // Back button
        document.getElementById('back-to-fields')?.addEventListener('click', () => {
            this.showStage('field-selection');
            this.updateProgress(50);
        });
        
        // Deploy button
        document.getElementById('deploy-tool')?.addEventListener('click', () => {
            this.deployTool();
        });
        
        // Create another tool
        document.getElementById('create-another-tool')?.addEventListener('click', () => {
            this.resetTool();
        });
    }

    async loadExpertTypes() {
        try {
            const response = await PMConfig.fetch('api/v5/prompt-engineer/expert-types');
            const data = await response.json();
            
            if (data.success) {
                this.expertTypes = data.expertTypes;
                this.expertTemplates = data.templates;
                console.log('✅ Loaded expert types:', this.expertTypes);
            } else {
                throw new Error('Failed to load expert types');
            }
        } catch (error) {
            console.error('❌ Error loading expert types:', error);
            this.showError('Failed to load expert types. Please refresh the page.');
        }
    }

    showExpertSelection() {
        this.updateProgress(25);
        this.showStage('expert-selection');
        
        const expertGrid = document.getElementById('expert-grid');
        if (!expertGrid) return;
        
        // Generate expert cards
        const expertCards = this.expertTypes.map(expertType => {
            const displayName = this.formatExpertName(expertType);
            const description = this.getExpertDescription(expertType);
            
            return `
                <div class="expert-card border-2 border-gray-200 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
                     onclick="v5.selectExpert('${expertType}')">
                    <div class="text-center">
                        <div class="text-3xl mb-3">${this.getExpertIcon(expertType)}</div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">${displayName}</h3>
                        <p class="text-sm text-gray-600">${description}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        expertGrid.innerHTML = expertCards;
    }

    formatExpertName(expertType) {
        const names = {
            'story_writer': 'Story Writer',
            'business_consultant': 'Business Consultant',
            'content_creator': 'Content Creator',
            'marketing_expert': 'Marketing Expert',
            'fitness_coach': 'Fitness Coach',
            'recipe_creator': 'Recipe Creator',
            'travel_planner': 'Travel Planner',
            'study_tutor': 'Study Tutor'
        };
        return names[expertType] || expertType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    getExpertDescription(expertType) {
        const descriptions = {
            'story_writer': 'Create personalized stories and creative fiction',
            'business_consultant': 'Provide business advice and strategic insights',
            'content_creator': 'Generate engaging content for various platforms',
            'marketing_expert': 'Develop marketing strategies and campaigns',
            'fitness_coach': 'Create personalized fitness and wellness plans',
            'recipe_creator': 'Generate custom recipes and cooking instructions',
            'travel_planner': 'Plan personalized travel itineraries',
            'study_tutor': 'Create educational content and study materials'
        };
        return descriptions[expertType] || 'Provide expert assistance in this field';
    }

    getExpertIcon(expertType) {
        const icons = {
            'story_writer': '📚',
            'business_consultant': '💼',
            'content_creator': '✨',
            'marketing_expert': '📈',
            'fitness_coach': '💪',
            'recipe_creator': '🍳',
            'travel_planner': '✈️',
            'study_tutor': '🎓'
        };
        return icons[expertType] || '🤖';
    }

    async selectExpert(expertType) {
        console.log('🎯 Selected expert:', expertType);
        this.selectedExpertType = expertType;
        
        this.showLoading('Getting field recommendations...');
        
        try {
            // Create session first
            await this.createSession();
            
            // Then select expert and get recommendations
            const response = await PMConfig.fetch('api/v5/prompt-engineer/select-expert', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    expertType: expertType
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.fieldRecommendations = data.recommendations.fieldSuggestions;
                console.log('📋 Field recommendations received:', this.fieldRecommendations);
                this.showFieldSelection();
            } else {
                throw new Error(data.error || 'Failed to get field recommendations');
            }
        } catch (error) {
            console.error('❌ Error selecting expert:', error);
            this.showError('Failed to get field recommendations. Please try again.');
        }
        
        this.hideLoading();
    }

    async createSession() {
        if (this.sessionId) return;
        
        try {
            // Get user ID from auth (you may need to adjust this based on your auth system)
            const userId = this.getUserId();
            
            const response = await PMConfig.fetch('api/v5/prompt-engineer/session', {
                method: 'POST',
                body: JSON.stringify({ userId: userId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.sessionId = data.sessionId;
                console.log('✅ Session created:', this.sessionId);
            } else {
                throw new Error(data.error || 'Failed to create session');
            }
        } catch (error) {
            console.error('❌ Error creating session:', error);
            throw error;
        }
    }

    getUserId() {
        // This should get the actual user ID from your auth system
        // For now, using a default user ID
        return 'e88dad2e-5b81-4a6b-8d42-4b65611428ac';
    }

    showFieldSelection() {
        this.updateProgress(50);
        this.showStage('field-selection');
        
        const fieldRecommendations = document.getElementById('field-recommendations');
        if (!fieldRecommendations || !this.fieldRecommendations) return;
        
        // Generate field cards with checkboxes
        const fieldCards = this.fieldRecommendations.map((field, index) => {
            const fieldId = `field_${index}`;
            const isRequired = field.is_required !== false;
            
            return `
                <div class="field-card border-2 border-gray-200 rounded-lg p-4 transition-all duration-200">
                    <div class="flex items-start space-x-3">
                        <div class="flex items-center h-5 mt-1">
                            <input 
                                id="${fieldId}" 
                                name="field-selection" 
                                type="checkbox" 
                                class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                onchange="v5.toggleField(${index})"
                                ${isRequired ? 'checked' : ''}
                            >
                        </div>
                        <div class="flex-1">
                            <label for="${fieldId}" class="cursor-pointer">
                                <div class="flex items-center space-x-2 mb-2">
                                    <h3 class="font-semibold text-gray-800">${field.field_label}</h3>
                                    <span class="px-2 py-1 bg-gray-100 text-xs rounded-full text-gray-600">
                                        ${field.field_type}
                                    </span>
                                    ${isRequired ? '<span class="px-2 py-1 bg-red-100 text-xs rounded-full text-red-600">required</span>' : ''}
                                </div>
                                <p class="text-sm text-gray-600 mb-2">${field.description || ''}</p>
                                ${field.placeholder ? `<p class="text-xs text-gray-500">Placeholder: "${field.placeholder}"</p>` : ''}
                                ${field.options ? `<div class="mt-2"><p class="text-xs text-gray-500">Options: ${field.options.join(', ')}</p></div>` : ''}
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        fieldRecommendations.innerHTML = fieldCards;
        
        // Pre-select required fields
        this.selectedFields = this.fieldRecommendations
            .map((field, index) => ({ ...field, index }))
            .filter(field => field.is_required !== false);
        
        this.updateContinueButton();
    }

    toggleField(index) {
        const field = this.fieldRecommendations[index];
        const checkbox = document.getElementById(`field_${index}`);
        const fieldCard = checkbox.closest('.field-card');
        
        if (checkbox.checked) {
            // Add field to selection
            if (!this.selectedFields.some(f => f.index === index)) {
                this.selectedFields.push({ ...field, index });
                fieldCard.classList.add('selected');
            }
        } else {
            // Remove field from selection
            this.selectedFields = this.selectedFields.filter(f => f.index !== index);
            fieldCard.classList.remove('selected');
        }
        
        this.updateContinueButton();
        console.log('📋 Selected fields:', this.selectedFields);
    }

    updateContinueButton() {
        const continueBtn = document.getElementById('continue-to-config');
        if (continueBtn) {
            continueBtn.disabled = this.selectedFields.length === 0;
            continueBtn.innerHTML = this.selectedFields.length === 0 
                ? 'Select at least one field'
                : `Continue with ${this.selectedFields.length} fields <i class="fas fa-arrow-right ml-2"></i>`;
        }
    }

    async requestDifferentFields() {
        this.showLoading('Generating different field recommendations...');
        
        try {
            // For now, we'll re-request with the same expert type
            // In a more advanced version, you could implement specific field modification requests
            const response = await PMConfig.fetch('api/v5/prompt-engineer/select-expert', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    expertType: this.selectedExpertType
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.fieldRecommendations = data.recommendations.fieldSuggestions;
                this.showFieldSelection();
            } else {
                throw new Error(data.error || 'Failed to get different recommendations');
            }
        } catch (error) {
            console.error('❌ Error requesting different fields:', error);
            this.showError('Failed to get different field recommendations. Please try again.');
        }
        
        this.hideLoading();
    }

    async proceedToConfiguration() {
        if (this.selectedFields.length === 0) {
            this.showError('Please select at least one field before continuing.');
            return;
        }
        
        this.showLoading('Processing selected fields...');
        
        try {
            // Process the selected fields
            const processedFields = this.selectedFields.map(field => ({
                field_name: field.field_name,
                field_type: field.field_type,
                field_label: field.field_label,
                placeholder: field.placeholder,
                options: field.options,
                is_required: field.is_required !== false,
                description: field.description
            }));
            
            const response = await PMConfig.fetch('api/v5/prompt-engineer/select-fields', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    selectedFields: processedFields,
                    toolName: `${this.formatExpertName(this.selectedExpertType)} Tool`,
                    toolDescription: `AI-powered ${this.formatExpertName(this.selectedExpertType).toLowerCase()} assistant`
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.sessionData = data;
                this.showConfiguration();
            } else {
                throw new Error(data.error || 'Failed to process selected fields');
            }
        } catch (error) {
            console.error('❌ Error proceeding to configuration:', error);
            this.showError('Failed to process selected fields. Please try again.');
        }
        
        this.hideLoading();
    }

    showConfiguration() {
        this.updateProgress(75);
        this.showStage('tool-configuration');
        
        // Pre-fill form fields
        const toolName = document.getElementById('tool-name');
        const toolDescription = document.getElementById('tool-description');
        const pageTitle = document.getElementById('page-title');
        const pageSubtitle = document.getElementById('page-subtitle');
        
        if (toolName && this.sessionData && this.sessionData.toolPreview) {
            toolName.value = this.sessionData.toolPreview.name || '';
        }
        if (toolDescription && this.sessionData && this.sessionData.toolPreview) {
            toolDescription.value = this.sessionData.toolPreview.description || '';
        }
        if (pageTitle) {
            pageTitle.value = `Create Your Custom ${this.formatExpertName(this.selectedExpertType)}`;
        }
        if (pageSubtitle) {
            pageSubtitle.value = `Get personalized results from our AI ${this.formatExpertName(this.selectedExpertType).toLowerCase()}`;
        }
        
        this.updateToolPreview();
        
        // Add event listeners for live preview updates
        [toolName, toolDescription, pageTitle, pageSubtitle].forEach(input => {
            if (input) {
                input.addEventListener('input', () => this.updateToolPreview());
            }
        });
    }

    updateToolPreview() {
        const preview = document.getElementById('tool-preview');
        if (!preview) return;
        
        const toolName = document.getElementById('tool-name')?.value || 'Your Tool';
        const pageTitle = document.getElementById('page-title')?.value || 'Create Your Custom Tool';
        const pageSubtitle = document.getElementById('page-subtitle')?.value || 'Get personalized results';
        
        const fieldsPreview = this.selectedFields.map(field => 
            `<div class="text-sm text-gray-600">• ${field.field_label} (${field.field_type})</div>`
        ).join('');
        
        preview.innerHTML = `
            <div class="bg-white border rounded-lg p-4 shadow-sm">
                <h3 class="text-lg font-bold text-gray-800 mb-1">${pageTitle}</h3>
                <p class="text-gray-600 text-sm mb-4">${pageSubtitle}</p>
                <div class="space-y-2">
                    <h4 class="font-semibold text-gray-700">Form Fields:</h4>
                    ${fieldsPreview}
                </div>
                <div class="mt-4 pt-3 border-t text-xs text-gray-500">
                    Powered by ${toolName}
                </div>
            </div>
        `;
    }

    async deployTool() {
        const toolName = document.getElementById('tool-name')?.value;
        const toolDescription = document.getElementById('tool-description')?.value;
        const pageTitle = document.getElementById('page-title')?.value;
        const pageSubtitle = document.getElementById('page-subtitle')?.value;
        
        if (!toolName || !toolDescription) {
            this.showError('Please fill in the tool name and description.');
            return;
        }
        
        this.showLoading('Deploying your tool...');
        
        try {
            const pageContent = {
                header: {
                    title: pageTitle || `Create Your Custom ${this.formatExpertName(this.selectedExpertType)}`,
                    subtitle: pageSubtitle || 'Get personalized results'
                },
                tool_section: {
                    description: toolDescription,
                    instructions: 'Fill out the form below to get your personalized results'
                },
                footer: {
                    text: 'Powered by Prompt Machine'
                }
            };
            
            const response = await PMConfig.fetch('api/v5/prompt-engineer/create-tool', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    pageContent: pageContent
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.deploymentData = data;
                this.showDeploymentSuccess();
            } else {
                throw new Error(data.error || 'Failed to deploy tool');
            }
        } catch (error) {
            console.error('❌ Error deploying tool:', error);
            this.showError('Failed to deploy tool. Please try again.');
        }
        
        this.hideLoading();
    }

    showDeploymentSuccess() {
        this.updateProgress(100);
        this.showStage('deployment-success');
        
        const deploymentDetails = document.getElementById('deployment-details');
        const visitToolLink = document.getElementById('visit-tool-link');
        
        if (deploymentDetails && this.deploymentData) {
            deploymentDetails.innerHTML = `
                <div class="space-y-3">
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Tool Name:</span>
                        <span class="text-gray-800">${this.deploymentData.tool.name}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">URL:</span>
                        <span class="text-blue-600 break-all">${this.deploymentData.deploymentUrl}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Fields:</span>
                        <span class="text-gray-800">${this.deploymentData.fieldCount} form fields</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Expert Type:</span>
                        <span class="text-gray-800">${this.formatExpertName(this.selectedExpertType)}</span>
                    </div>
                </div>
            `;
        }
        
        if (visitToolLink && this.deploymentData) {
            visitToolLink.href = this.deploymentData.deploymentUrl;
        }
    }

    // Utility Methods
    showStage(stageId) {
        const stages = ['expert-selection', 'field-selection', 'tool-configuration', 'deployment-success'];
        stages.forEach(stage => {
            const element = document.getElementById(stage);
            if (element) {
                element.classList.toggle('hidden', stage !== stageId);
            }
        });
    }

    updateProgress(percentage) {
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const text = document.getElementById('loading-text');
        if (overlay) {
            overlay.classList.remove('hidden');
            if (text) text.textContent = message;
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    showError(message) {
        alert(message); // You can replace this with a better error display
        console.error('❌ Error:', message);
    }

    resetTool() {
        this.sessionId = null;
        this.selectedExpertType = null;
        this.fieldRecommendations = [];
        this.selectedFields = [];
        this.sessionData = null;
        this.deploymentData = null;
        
        this.showExpertSelection();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.v5 = new PromptEngineerV5();
});