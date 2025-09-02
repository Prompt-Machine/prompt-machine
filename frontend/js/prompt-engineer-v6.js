/**
 * Prompt Engineer V6 - Multi-Step Project Builder
 * Complete admin interface for creating and managing projects
 */

class PromptEngineerV6 {
    constructor() {
        this.currentProject = null;
        this.currentStep = null;
        this.projects = [];
        this.steps = [];
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadProjects();
        
        // Check if we should load a specific project from URL
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('id');
        
        if (projectId) {
            // Find and load the specific project
            const project = this.projects.find(p => p.id === projectId);
            if (project) {
                this.editProject(projectId);
            } else {
                this.showError('Project not found');
                this.showProjectListView();
            }
        } else {
            this.showProjectListView();
        }
    }

    bindEvents() {
        // Project creation
        document.getElementById('create-project-btn')?.addEventListener('click', () => this.showCreateModal());
        document.getElementById('create-first-project')?.addEventListener('click', () => this.showCreateModal());
        document.getElementById('cancel-create')?.addEventListener('click', () => this.hideCreateModal());
        
        // Multi-step creation flow
        document.getElementById('initial-project-form')?.addEventListener('submit', (e) => this.handleInitialSubmit(e));
        document.getElementById('back-to-step-1')?.addEventListener('click', () => this.showCreationStep(1));
        document.getElementById('back-to-step-2')?.addEventListener('click', () => this.showCreationStep(2));
        document.getElementById('ask-more-questions')?.addEventListener('click', () => this.askMoreQuestions());
        document.getElementById('create-fields')?.addEventListener('click', () => this.createFields());
        document.getElementById('add-custom-field')?.addEventListener('click', () => this.addCustomField());
        document.getElementById('finalize-project')?.addEventListener('click', () => this.finalizeProject());

        // Navigation
        document.getElementById('back-to-projects')?.addEventListener('click', () => this.showProjectListView());
        
        // Project actions
        document.getElementById('deploy-project')?.addEventListener('click', () => this.deployProject());
        document.getElementById('preview-project')?.addEventListener('click', () => this.previewProject());
        document.getElementById('project-settings')?.addEventListener('click', () => this.showProjectSettings());
        
        // Step management
        document.getElementById('add-step')?.addEventListener('click', () => this.addStep());
        
        // Field management
        document.getElementById('cancel-field')?.addEventListener('click', () => this.hideFieldModal());
        document.getElementById('field-editor-form')?.addEventListener('submit', (e) => this.handleSaveField(e));
        document.getElementById('field-type')?.addEventListener('change', () => this.updateFieldChoicesVisibility());

        // Project settings
        document.getElementById('close-settings')?.addEventListener('click', () => this.hideProjectSettings());
        document.getElementById('cancel-settings')?.addEventListener('click', () => this.hideProjectSettings());
        document.getElementById('project-settings-form')?.addEventListener('submit', (e) => this.handleSaveProjectSettings(e));
    }

    // ================================
    // PROJECT MANAGEMENT
    // ================================

    async loadProjects() {
        try {
            this.showLoading('Loading projects...');
            
            const response = await PMConfig.fetch('api/v6/projects');
            const data = await response.json();
            
            if (data.success) {
                this.projects = data.projects || [];
                this.renderProjects();
            } else {
                this.showError('Failed to load projects');
            }
        } catch (error) {
            console.error('Error loading projects:', error);
            this.showError('Failed to load projects');
        } finally {
            this.hideLoading();
        }
    }

    renderProjects() {
        const grid = document.getElementById('projects-grid');
        const emptyState = document.getElementById('empty-state');
        
        if (this.projects.length === 0) {
            grid.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        grid.innerHTML = this.projects.map(project => `
            <div class="project-card bg-white rounded-lg shadow-sm border p-6 hover:shadow-lg transition-shadow" 
                 onclick="promptEngineer.editProject('${project.id}')">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900">${this.escapeHtml(project.name)}</h3>
                        <p class="text-sm text-gray-600 mt-1">${this.escapeHtml(project.description || '')}</p>
                    </div>
                    <div class="flex space-x-1">
                        <span class="px-2 py-1 text-xs rounded-full ${project.deployed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                            ${project.deployed ? 'Deployed' : 'Draft'}
                        </span>
                    </div>
                </div>
                
                <div class="flex items-center justify-between text-sm text-gray-500">
                    <span class="flex items-center">
                        <i class="fas fa-user-tie mr-2"></i>
                        ${this.escapeHtml(project.ai_role)}
                    </span>
                    <span class="flex items-center">
                        <i class="fas fa-list mr-2"></i>
                        ${project.step_count || 0} steps
                    </span>
                    <span class="flex items-center">
                        <i class="fas fa-calendar mr-2"></i>
                        ${this.formatDate(project.created_at)}
                    </span>
                </div>
                
                ${project.deployed ? `
                    <div class="mt-4 pt-4 border-t">
                        <a href="https://${project.subdomain}.tool.prompt-machine.com" 
                           target="_blank" 
                           class="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                           onclick="event.stopPropagation()">
                            <i class="fas fa-external-link-alt mr-2"></i>
                            View Live Tool
                        </a>
                    </div>
                ` : ''}
                
                <div class="mt-4 pt-4 border-t flex justify-between">
                    <button onclick="event.stopPropagation(); promptEngineer.cloneProject('${project.id}')" 
                            class="text-gray-600 hover:text-gray-800 text-sm">
                        <i class="fas fa-copy mr-1"></i>
                        Clone
                    </button>
                    <button onclick="event.stopPropagation(); promptEngineer.exportProject('${project.id}')" 
                            class="text-gray-600 hover:text-gray-800 text-sm">
                        <i class="fas fa-download mr-1"></i>
                        Export
                    </button>
                    <button onclick="event.stopPropagation(); promptEngineer.deleteProject('${project.id}', '${this.escapeHtml(project.name)}')" 
                            class="text-red-600 hover:text-red-800 text-sm">
                        <i class="fas fa-trash mr-1"></i>
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    async editProject(projectId) {
        try {
            // Find the project in our loaded projects
            const project = this.projects.find(p => p.id === projectId);
            if (!project) {
                this.showError('Project not found');
                return;
            }

            this.showLoading('Loading project for editing...');
            
            // Load detailed project data including steps
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}`);
            const data = await response.json();
            
            if (data.success) {
                this.currentProject = data.project;
                this.steps = data.project.steps || [];
                
                // Update UI with project data
                document.getElementById('project-title').textContent = this.currentProject.name;
                document.getElementById('project-description').textContent = this.currentProject.description;
                
                // Load steps
                this.renderSteps();
                
                // Show project editor view
                this.showProjectEditorView();
            } else {
                this.showError(data.error || 'Failed to load project');
            }
        } catch (error) {
            console.error('Error loading project:', error);
            this.showError('Failed to load project');
        } finally {
            this.hideLoading();
        }
    }

    showCreateModal() {
        this.resetCreationFlow();
        document.getElementById('create-project-modal').classList.remove('hidden');
        this.showCreationStep(1);
    }

    hideCreateModal() {
        document.getElementById('create-project-modal').classList.add('hidden');
        this.resetCreationFlow();
    }

    resetCreationFlow() {
        // Reset all forms
        document.getElementById('initial-project-form')?.reset();
        
        // Clear stored data
        this.creationData = {};
        
        // Reset steps visibility
        this.showCreationStep(1);
    }

    showCreationStep(step) {
        // Hide all steps
        document.getElementById('creation-step-1').classList.add('hidden');
        document.getElementById('creation-step-2').classList.add('hidden');
        document.getElementById('creation-step-3').classList.add('hidden');
        
        // Show requested step
        document.getElementById(`creation-step-${step}`).classList.remove('hidden');
    }

    async handleCreateProject(e) {
        e.preventDefault();
        
        const projectName = document.getElementById('project-name').value.trim();
        const projectIdea = document.getElementById('project-idea').value;
        const expertType = document.getElementById('expert-type').value;
        
        if (!projectIdea || !expertType) {
            this.showError('Please fill in all required fields');
            return;
        }
        
        const submitBtn = document.getElementById('submit-create');
        const createText = submitBtn.querySelector('.create-text');
        const loadingText = submitBtn.querySelector('.create-loading');
        
        try {
            submitBtn.disabled = true;
            createText.classList.add('hidden');
            loadingText.classList.remove('hidden');
            
            const requestBody = {
                projectIdea: projectIdea,
                expertType: expertType
            };
            
            // Only include projectName if user provided one
            if (projectName) {
                requestBody.projectName = projectName;
            }
            
            const response = await PMConfig.fetch('api/v6/projects', {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.hideCreateModal();
                this.loadProjects();
                this.showSuccess('Project created successfully! AI has generated your multi-step structure.');
                
                // Auto-edit the new project
                setTimeout(() => {
                    this.editProject(data.project.id);
                }, 1000);
            } else {
                this.showError(data.error || 'Failed to create project');
            }
        } catch (error) {
            console.error('Error creating project:', error);
            this.showError('Failed to create project');
        } finally {
            submitBtn.disabled = false;
            createText.classList.remove('hidden');
            loadingText.classList.add('hidden');
        }
    }

    // ================================
    // NEW MULTI-STEP CREATION FLOW
    // ================================

    async handleInitialSubmit(e) {
        e.preventDefault();
        
        const projectName = document.getElementById('project-name').value.trim();
        const projectIdea = document.getElementById('project-idea').value;
        const expertType = document.getElementById('expert-type').value;
        
        if (!projectIdea || !expertType) {
            this.showError('Please fill in all required fields');
            return;
        }
        
        // Store the initial data
        this.creationData = {
            projectName: projectName,
            projectIdea: projectIdea,
            expertType: expertType,
            refinementAnswers: []
        };
        
        // Get AI refinement questions
        await this.generateRefinementQuestions();
    }

    async generateRefinementQuestions() {
        const submitBtn = document.getElementById('submit-initial');
        const submitText = submitBtn.querySelector('.submit-text');
        const loadingText = submitBtn.querySelector('.submit-loading');
        
        try {
            submitBtn.disabled = true;
            submitText.classList.add('hidden');
            loadingText.classList.remove('hidden');
            
            const response = await PMConfig.fetch('api/v6/projects/refinement-questions', {
                method: 'POST',
                body: JSON.stringify({
                    projectIdea: this.creationData.projectIdea,
                    expertType: this.creationData.expertType
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.displayRefinementQuestions(data.questions);
                this.showCreationStep(2);
            } else {
                this.showError(data.error || 'Failed to generate refinement questions');
            }
        } catch (error) {
            console.error('Error generating refinement questions:', error);
            this.showError('Failed to generate refinement questions');
        } finally {
            submitBtn.disabled = false;
            submitText.classList.remove('hidden');
            loadingText.classList.add('hidden');
        }
    }

    displayRefinementQuestions(questions) {
        const container = document.getElementById('refinement-questions');
        container.innerHTML = questions.map((question, index) => `
            <div class="bg-gray-50 rounded-lg p-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    ${question.question}
                    ${question.required ? '<span class="text-red-500">*</span>' : '<span class="text-gray-400">(optional)</span>'}
                </label>
                <textarea id="refinement-${index}" 
                          class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                          rows="2" 
                          placeholder="${question.placeholder || 'Your answer...'}"
                          ${question.required ? 'required' : ''}></textarea>
            </div>
        `).join('');
    }

    async askMoreQuestions() {
        // Collect current answers
        this.collectRefinementAnswers();
        
        const askBtn = document.getElementById('ask-more-questions');
        const askText = askBtn.querySelector('.ask-more-text');
        const loadingText = askBtn.querySelector('.ask-more-loading');
        
        try {
            askBtn.disabled = true;
            askText.classList.add('hidden');
            loadingText.classList.remove('hidden');
            
            const response = await PMConfig.fetch('api/v6/projects/more-questions', {
                method: 'POST',
                body: JSON.stringify({
                    ...this.creationData
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.displayRefinementQuestions(data.questions);
            } else {
                this.showError(data.error || 'Failed to generate more questions');
            }
        } catch (error) {
            console.error('Error generating more questions:', error);
            this.showError('Failed to generate more questions');
        } finally {
            askBtn.disabled = false;
            askText.classList.remove('hidden');
            loadingText.classList.add('hidden');
        }
    }

    collectRefinementAnswers() {
        const questions = document.querySelectorAll('#refinement-questions textarea');
        this.creationData.refinementAnswers = Array.from(questions).map(textarea => ({
            question: textarea.previousElementSibling.textContent.trim(),
            answer: textarea.value.trim()
        })).filter(item => item.answer); // Only include answered questions
    }

    async createFields() {
        // Collect current answers
        this.collectRefinementAnswers();
        
        const createBtn = document.getElementById('create-fields');
        const createText = createBtn.querySelector('.create-fields-text');
        const loadingText = createBtn.querySelector('.create-fields-loading');
        
        try {
            createBtn.disabled = true;
            createText.classList.add('hidden');
            loadingText.classList.remove('hidden');
            
            const response = await PMConfig.fetch('api/v6/projects/generate-fields', {
                method: 'POST',
                body: JSON.stringify({
                    ...this.creationData
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.displayGeneratedFields(data.fields, data.steps);
                this.showCreationStep(3);
            } else {
                this.showError(data.error || 'Failed to generate fields');
            }
        } catch (error) {
            console.error('Error generating fields:', error);
            this.showError('Failed to generate fields');
        } finally {
            createBtn.disabled = false;
            createText.classList.remove('hidden');
            loadingText.classList.add('hidden');
        }
    }

    displayGeneratedFields(fields, steps) {
        const container = document.getElementById('generated-fields');
        container.innerHTML = steps.map((step, stepIndex) => `
            <div class="border rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 mb-3">${step.name}</h4>
                <div class="space-y-3">
                    ${step.fields.map((field, fieldIndex) => `
                        <div class="bg-gray-50 rounded p-3 flex justify-between items-start">
                            <div class="flex-1">
                                <div class="font-medium">${field.label}</div>
                                <div class="text-sm text-gray-600">${field.type} ${field.required ? '(required)' : '(optional)'}</div>
                                ${field.options ? `<div class="text-xs text-blue-600 mt-1">${field.options.length} options available</div>` : ''}
                            </div>
                            <div class="flex space-x-2">
                                <button onclick="promptEngineer.editField(${stepIndex}, ${fieldIndex})" class="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                                <button onclick="promptEngineer.removeField(${stepIndex}, ${fieldIndex})" class="text-red-600 hover:text-red-800 text-sm">Remove</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
        
        // Store generated data for finalization
        this.creationData.generatedSteps = steps;
    }

    async finalizeProject() {
        const finalizeBtn = document.getElementById('finalize-project');
        const finalizeText = finalizeBtn.querySelector('.finalize-text');
        const loadingText = finalizeBtn.querySelector('.finalize-loading');
        
        try {
            finalizeBtn.disabled = true;
            finalizeText.classList.add('hidden');
            loadingText.classList.remove('hidden');
            
            const response = await PMConfig.fetch('api/v6/projects', {
                method: 'POST',
                body: JSON.stringify({
                    ...this.creationData,
                    finalizeProject: true
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.hideCreateModal();
                this.loadProjects();
                this.showSuccess('Project created successfully!');
                
                // Auto-edit the new project
                setTimeout(() => {
                    this.editProject(data.project.id);
                }, 1000);
            } else {
                this.showError(data.error || 'Failed to create project');
            }
        } catch (error) {
            console.error('Error creating project:', error);
            this.showError('Failed to create project');
        } finally {
            finalizeBtn.disabled = false;
            finalizeText.classList.remove('hidden');
            loadingText.classList.add('hidden');
        }
    }

    addCustomField() {
        // TODO: Open field editor to add custom field
        this.showError('Custom field creation coming soon!');
    }

    editField(stepIndex, fieldIndex) {
        // TODO: Open field editor to edit field
        this.showError('Field editing coming soon!');
    }

    removeField(stepIndex, fieldIndex) {
        if (confirm('Remove this field?')) {
            this.creationData.generatedSteps[stepIndex].fields.splice(fieldIndex, 1);
            this.displayGeneratedFields(null, this.creationData.generatedSteps);
        }
    }

    async cloneProject(projectId) {
        if (!confirm('Clone this project with all its steps and fields?')) {
            return;
        }
        
        try {
            this.showLoading('Cloning project...');
            
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}/clone`, {
                method: 'POST',
                body: JSON.stringify({})
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.loadProjects();
                this.showSuccess('Project cloned successfully!');
            } else {
                this.showError(data.error || 'Failed to clone project');
            }
        } catch (error) {
            console.error('Error cloning project:', error);
            this.showError('Failed to clone project');
        } finally {
            this.hideLoading();
        }
    }

    async exportProject(projectId) {
        try {
            this.showLoading('Exporting project...');
            
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}/export`);
            const data = await response.json();
            
            if (data.success) {
                // Download JSON file
                const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${data.export.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.showSuccess('Project exported successfully!');
            } else {
                this.showError(data.error || 'Failed to export project');
            }
        } catch (error) {
            console.error('Error exporting project:', error);
            this.showError('Failed to export project');
        } finally {
            this.hideLoading();
        }
    }

    async deleteProject(projectId, projectName) {
        if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
            return;
        }
        
        try {
            this.showLoading('Deleting project...');
            
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.loadProjects();
                this.showSuccess('Project deleted successfully');
            } else {
                this.showError(data.error || 'Failed to delete project');
            }
        } catch (error) {
            console.error('Error deleting project:', error);
            this.showError('Failed to delete project');
        } finally {
            this.hideLoading();
        }
    }

    // ================================
    // PROJECT EDITOR
    // ================================

    async editProject(projectId) {
        try {
            this.showLoading('Loading project...');
            
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}`);
            const data = await response.json();
            
            if (data.success) {
                this.currentProject = data.project;
                this.steps = data.project.steps || [];
                this.showProjectEditor();
            } else {
                this.showError(data.error || 'Failed to load project');
            }
        } catch (error) {
            console.error('Error loading project:', error);
            this.showError('Failed to load project');
        } finally {
            this.hideLoading();
        }
    }

    showProjectEditor() {
        document.getElementById('project-list-view').classList.add('hidden');
        document.getElementById('project-editor-view').classList.remove('hidden');
        
        // Update header
        document.getElementById('project-title').textContent = this.currentProject.name;
        document.getElementById('project-description').textContent = this.currentProject.description;
        
        // Render steps
        this.renderSteps();
    }

    showProjectListView() {
        document.getElementById('project-editor-view').classList.add('hidden');
        document.getElementById('project-list-view').classList.remove('hidden');
        
        this.currentProject = null;
        this.currentStep = null;
        this.loadProjects(); // Refresh the list
    }

    renderSteps() {
        const stepsList = document.getElementById('steps-list');
        
        stepsList.innerHTML = this.steps.map((step, index) => `
            <div class="step-item p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 ${this.currentStep?.id === step.id ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}"
                 onclick="promptEngineer.selectStep('${step.id}')">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="font-medium text-sm">${step.name || `Step ${index + 1}`}</div>
                        <div class="text-xs text-gray-500">${step.fields?.length || 0} fields</div>
                    </div>
                    <div class="flex space-x-1">
                        <button onclick="event.stopPropagation(); promptEngineer.moveStep('${step.id}', 'up')" 
                                class="text-gray-400 hover:text-gray-600 ${index === 0 ? 'opacity-50 cursor-not-allowed' : ''}">
                            <i class="fas fa-chevron-up"></i>
                        </button>
                        <button onclick="event.stopPropagation(); promptEngineer.moveStep('${step.id}', 'down')" 
                                class="text-gray-400 hover:text-gray-600 ${index === this.steps.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <button onclick="event.stopPropagation(); promptEngineer.deleteStep('${step.id}')" 
                                class="text-red-400 hover:text-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Select first step if none selected
        if (this.steps.length > 0 && !this.currentStep) {
            this.selectStep(this.steps[0].id);
        }
    }

    selectStep(stepId) {
        this.currentStep = this.steps.find(s => s.id === stepId);
        this.renderSteps(); // Re-render to update selection
        this.renderStepEditor();
    }

    renderStepEditor() {
        const editor = document.getElementById('step-editor');
        
        if (!this.currentStep) {
            editor.innerHTML = `
                <div class="text-center text-gray-500 py-12">
                    <i class="fas fa-arrow-left text-4xl mb-4"></i>
                    <p>Select a step to edit</p>
                </div>
            `;
            return;
        }
        
        const fields = this.currentStep.fields || [];
        
        editor.innerHTML = `
            <div class="mb-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold">Step: ${this.escapeHtml(this.currentStep.name)}</h3>
                    <div class="flex space-x-2">
                        <button onclick="promptEngineer.editStepSettings('${this.currentStep.id}')" 
                                class="text-blue-600 hover:text-blue-800 flex items-center">
                            <i class="fas fa-cog mr-1"></i>
                            Edit
                        </button>
                        <button onclick="promptEngineer.deleteStep('${this.currentStep.id}')" 
                                class="text-red-600 hover:text-red-800 flex items-center">
                            <i class="fas fa-trash mr-1"></i>
                            Delete
                        </button>
                    </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4 mb-6">
                    <h4 class="font-medium mb-2">Step Preview</h4>
                    <div class="text-lg font-medium">${this.escapeHtml(this.currentStep.page_title || this.currentStep.name)}</div>
                    <div class="text-gray-600">${this.escapeHtml(this.currentStep.page_subtitle || '')}</div>
                </div>
            </div>
            
            <div class="mb-6">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="font-medium">Form Fields (${fields.length})</h4>
                    <button onclick="promptEngineer.addField('${this.currentStep.id}')" 
                            class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 flex items-center space-x-1">
                        <i class="fas fa-plus"></i>
                        <span>Add Field</span>
                    </button>
                </div>
                
                <div class="space-y-3">
                    ${fields.length === 0 ? `
                        <div class="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                            <i class="fas fa-plus-circle text-gray-400 text-2xl mb-2"></i>
                            <p class="text-gray-500">No fields yet</p>
                            <button onclick="promptEngineer.addField('${this.currentStep.id}')" 
                                    class="text-blue-600 hover:text-blue-800 text-sm mt-2">
                                Add your first field
                            </button>
                        </div>
                    ` : fields.map((field, index) => `
                        <div class="field-card bg-white border rounded-lg p-4">
                            <div class="flex justify-between items-start">
                                <div class="flex-1">
                                    <div class="flex items-center space-x-2 mb-2">
                                        <span class="font-medium">${this.escapeHtml(field.label)}</span>
                                        <span class="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">${field.field_type}</span>
                                        ${field.is_required ? '<span class="px-2 py-1 text-xs rounded bg-red-100 text-red-600">Required</span>' : ''}
                                    </div>
                                    <div class="text-sm text-gray-600">${this.escapeHtml(field.description || '')}</div>
                                    ${field.placeholder ? `<div class="text-xs text-gray-500 mt-1">Placeholder: ${this.escapeHtml(field.placeholder)}</div>` : ''}
                                    ${field.choices?.length > 0 ? `
                                        <div class="text-xs text-gray-500 mt-1">
                                            Choices: ${field.choices.map(c => this.escapeHtml(c.label)).join(', ')}
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="flex space-x-1 ml-4">
                                    <button onclick="promptEngineer.moveField('${field.id}', 'up')" 
                                            class="text-gray-400 hover:text-gray-600 p-1 ${index === 0 ? 'opacity-50 cursor-not-allowed' : ''}">
                                        <i class="fas fa-chevron-up"></i>
                                    </button>
                                    <button onclick="promptEngineer.moveField('${field.id}', 'down')" 
                                            class="text-gray-400 hover:text-gray-600 p-1 ${index === fields.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}">
                                        <i class="fas fa-chevron-down"></i>
                                    </button>
                                    <button onclick="promptEngineer.editField('${field.id}')" 
                                            class="text-blue-400 hover:text-blue-600 p-1">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="promptEngineer.deleteField('${field.id}')" 
                                            class="text-red-400 hover:text-red-600 p-1">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async addStep() {
        if (!this.currentProject) return;
        
        try {
            const response = await PMConfig.fetch(`api/v6/projects/${this.currentProject.id}/steps`, {
                method: 'POST',
                body: JSON.stringify({
                    name: `Step ${this.steps.length + 1}`,
                    description: 'New step',
                    page_title: `Step ${this.steps.length + 1}`,
                    page_subtitle: 'Please complete this step'
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Reload the current project to get updated steps
                this.editProject(this.currentProject.id);
            } else {
                this.showError(data.error || 'Failed to add step');
            }
        } catch (error) {
            console.error('Error adding step:', error);
            this.showError('Failed to add step');
        }
    }

    // ================================
    // FIELD MANAGEMENT
    // ================================

    showFieldModal(field = null) {
        const modal = document.getElementById('field-editor-modal');
        const title = document.getElementById('field-modal-title');
        
        title.textContent = field ? 'Edit Field' : 'Add Field';
        
        if (field) {
            document.getElementById('field-name').value = field.name || '';
            document.getElementById('field-label').value = field.label || '';
            document.getElementById('field-type').value = field.field_type || 'text';
            document.getElementById('field-placeholder').value = field.placeholder || '';
            document.getElementById('field-description').value = field.description || '';
            document.getElementById('field-required').checked = field.is_required || false;
            
            if (field.choices?.length > 0) {
                document.getElementById('field-choices').value = field.choices.map(c => c.label).join('\\n');
            }
        } else {
            document.getElementById('field-editor-form').reset();
        }
        
        this.updateFieldChoicesVisibility();
        modal.classList.remove('hidden');
    }

    hideFieldModal() {
        document.getElementById('field-editor-modal').classList.add('hidden');
        document.getElementById('field-editor-form').reset();
    }

    updateFieldChoicesVisibility() {
        const fieldType = document.getElementById('field-type').value;
        const choicesSection = document.getElementById('field-choices-section');
        
        if (['select', 'radio', 'checkbox'].includes(fieldType)) {
            choicesSection.classList.remove('hidden');
        } else {
            choicesSection.classList.add('hidden');
        }
    }

    addField(stepId) {
        this.currentFieldStepId = stepId;
        this.currentEditingField = null;
        this.showFieldModal();
    }

    editField(fieldId) {
        const field = this.currentStep.fields.find(f => f.id === fieldId);
        if (!field) return;
        
        this.currentEditingField = field;
        this.currentFieldStepId = this.currentStep.id;
        this.showFieldModal(field);
    }

    async handleSaveField(e) {
        e.preventDefault();
        
        const name = document.getElementById('field-name').value;
        const label = document.getElementById('field-label').value;
        const field_type = document.getElementById('field-type').value;
        const placeholder = document.getElementById('field-placeholder').value;
        const description = document.getElementById('field-description').value;
        const is_required = document.getElementById('field-required').checked;
        const choices = document.getElementById('field-choices').value;
        
        if (!name || !label) {
            this.showError('Name and label are required');
            return;
        }
        
        try {
            let response;
            
            if (this.currentEditingField) {
                // Update existing field
                response = await PMConfig.fetch(`api/v6/fields/${this.currentEditingField.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        name: name,
                        label: label,
                        field_type: field_type,
                        placeholder: placeholder,
                        description: description,
                        is_required: is_required
                    })
                });
            } else {
                // Create new field
                response = await PMConfig.fetch(`api/v6/steps/${this.currentFieldStepId}/fields`, {
                    method: 'POST',
                    body: JSON.stringify({
                        name: name,
                        label: label,
                        field_type: field_type,
                        placeholder: placeholder,
                        description: description,
                        is_required: is_required
                    })
                });
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.hideFieldModal();
                
                // Handle choices if field type supports them
                if (['select', 'radio', 'checkbox'].includes(field_type) && choices.trim()) {
                    await this.saveFieldChoices(data.field.id, choices);
                }
                
                // Reload project to get updated fields
                this.editProject(this.currentProject.id);
            } else {
                this.showError(data.error || 'Failed to save field');
            }
        } catch (error) {
            console.error('Error saving field:', error);
            this.showError('Failed to save field');
        }
    }

    async saveFieldChoices(fieldId, choicesText) {
        const choices = choicesText.split('\\n').filter(c => c.trim());
        
        for (let i = 0; i < choices.length; i++) {
            try {
                await PMConfig.fetch(`api/v6/fields/${fieldId}/choices`, {
                    method: 'POST',
                    body: JSON.stringify({
                        label: choices[i].trim(),
                        value: choices[i].trim(),
                        is_default: i === 0
                    })
                });
            } catch (error) {
                console.error('Error saving choice:', error);
            }
        }
    }

    async deleteField(fieldId) {
        if (!confirm('Are you sure you want to delete this field?')) {
            return;
        }
        
        try {
            const response = await PMConfig.fetch(`api/v6/fields/${fieldId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Reload project to get updated fields
                this.editProject(this.currentProject.id);
            } else {
                this.showError(data.error || 'Failed to delete field');
            }
        } catch (error) {
            console.error('Error deleting field:', error);
            this.showError('Failed to delete field');
        }
    }

    // ================================
    // PROJECT ACTIONS
    // ================================

    async deployProject() {
        if (!this.currentProject) return;
        
        if (!confirm(`Deploy "${this.currentProject.name}" as a public tool?`)) {
            return;
        }
        
        try {
            this.showLoading('Deploying project...');
            
            const response = await PMConfig.fetch(`api/v6/projects/${this.currentProject.id}/deploy`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentProject.deployed = true;
                this.showSuccess(`Project deployed successfully! Available at: ${data.deployment?.url || 'URL not available'}`);
            } else {
                this.showError(data.error || 'Failed to deploy project');
            }
        } catch (error) {
            console.error('Error deploying project:', error);
            this.showError('Failed to deploy project');
        } finally {
            this.hideLoading();
        }
    }

    previewProject() {
        if (!this.currentProject) return;
        
        if (this.currentProject.deployed) {
            window.open(`https://${this.currentProject.subdomain}.tool.prompt-machine.com`, '_blank');
        } else {
            this.showError('Project must be deployed first to preview');
        }
    }

    // ================================
    // PROJECT SETTINGS
    // ================================

    showProjectSettings() {
        if (!this.currentProject) return;
        
        // Populate form with current project data
        document.getElementById('settings-project-name').value = this.currentProject.name || '';
        document.getElementById('settings-ai-role').value = this.currentProject.ai_role || '';
        document.getElementById('settings-project-description').value = this.currentProject.description || '';
        document.getElementById('settings-header-title').value = this.currentProject.header_title || '';
        document.getElementById('settings-header-subtitle').value = this.currentProject.header_subtitle || '';
        document.getElementById('update-subdomain').checked = false;
        
        document.getElementById('project-settings-modal').classList.remove('hidden');
    }

    hideProjectSettings() {
        document.getElementById('project-settings-modal').classList.add('hidden');
    }

    async handleSaveProjectSettings(e) {
        e.preventDefault();
        
        if (!this.currentProject) return;
        
        try {
            this.showLoading('Saving project settings...');
            
            const formData = {
                name: document.getElementById('settings-project-name').value.trim(),
                ai_role: document.getElementById('settings-ai-role').value.trim(),
                description: document.getElementById('settings-project-description').value.trim(),
                header_title: document.getElementById('settings-header-title').value.trim(),
                header_subtitle: document.getElementById('settings-header-subtitle').value.trim(),
                updateSubdomain: document.getElementById('update-subdomain').checked
            };

            const response = await PMConfig.fetch(`api/v6/projects/${this.currentProject.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                // Update current project with returned data
                this.currentProject = { ...this.currentProject, ...data.project };
                
                // Update the project title and description in the editor
                document.getElementById('project-title').textContent = this.currentProject.name;
                document.getElementById('project-description').textContent = this.currentProject.description;
                
                this.hideProjectSettings();
                this.showSuccess('Project settings saved successfully!');
                
                // Reload project list to reflect changes
                this.loadProjects();
            } else {
                this.showError(data.error || 'Failed to save project settings');
            }
        } catch (error) {
            console.error('Error saving project settings:', error);
            this.showError('Failed to save project settings');
        } finally {
            this.hideLoading();
        }
    }

    // ================================
    // VIEW MANAGEMENT
    // ================================

    showProjectListView() {
        document.getElementById('project-list-view').classList.remove('hidden');
        document.getElementById('project-editor-view').classList.add('hidden');
    }

    showProjectEditorView() {
        document.getElementById('project-list-view').classList.add('hidden');
        document.getElementById('project-editor-view').classList.remove('hidden');
    }

    // ================================
    // UTILITY METHODS
    // ================================

    showLoading(message = 'Loading...') {
        document.getElementById('loading-text').textContent = message;
        document.getElementById('loading-overlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    showSuccess(message) {
        // You can implement a toast notification system here
        alert(message); // Temporary
    }

    showError(message) {
        // You can implement a toast notification system here
        alert('Error: ' + message); // Temporary
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString();
    }

    // ================================
    // STEP MANAGEMENT METHODS
    // ================================

    async editStepSettings(stepId) {
        // Find the step
        const step = this.steps.find(s => s.id === stepId);
        if (!step) {
            this.showError('Step not found');
            return;
        }

        // For now, just show an alert - you can implement a modal later
        const newName = prompt('Enter new step name:', step.name);
        if (newName && newName.trim() !== step.name) {
            await this.updateStep(stepId, { name: newName.trim() });
        }
    }

    async deleteStep(stepId) {
        if (!confirm('Are you sure you want to delete this step? This action cannot be undone.')) {
            return;
        }

        try {
            this.showLoading('Deleting step...');

            const response = await PMConfig.fetch(`api/v6/steps/${stepId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Remove from local steps array
                this.steps = this.steps.filter(s => s.id !== stepId);
                
                // If this was the current step, switch to first step or list view
                if (this.currentStep && this.currentStep.id === stepId) {
                    if (this.steps.length > 0) {
                        this.selectStep(this.steps[0].id);
                    } else {
                        this.currentStep = null;
                        this.renderSteps();
                    }
                } else {
                    this.renderSteps();
                }
                
                this.showSuccess('Step deleted successfully');
            } else {
                const data = await response.json();
                this.showError(data.error || 'Failed to delete step');
            }
        } catch (error) {
            console.error('Error deleting step:', error);
            this.showError('Failed to delete step');
        } finally {
            this.hideLoading();
        }
    }

    async updateStep(stepId, updates) {
        try {
            this.showLoading('Updating step...');

            const response = await PMConfig.fetch(`api/v6/steps/${stepId}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            if (response.ok) {
                // Update local step data
                const stepIndex = this.steps.findIndex(s => s.id === stepId);
                if (stepIndex !== -1) {
                    this.steps[stepIndex] = { ...this.steps[stepIndex], ...updates };
                    if (this.currentStep && this.currentStep.id === stepId) {
                        this.currentStep = this.steps[stepIndex];
                    }
                }
                
                this.renderSteps();
                this.renderCurrentStepEditor();
                this.showSuccess('Step updated successfully');
            } else {
                const data = await response.json();
                this.showError(data.error || 'Failed to update step');
            }
        } catch (error) {
            console.error('Error updating step:', error);
            this.showError('Failed to update step');
        } finally {
            this.hideLoading();
        }
    }
}

// Initialize the application
let promptEngineer;
document.addEventListener('DOMContentLoaded', () => {
    promptEngineer = new PromptEngineerV6();
});