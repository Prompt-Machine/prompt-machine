// PROMPT ENGINEER V5 - CLEAN AI-GUIDED TOOL CREATION
// Built from the ground up with proper workflow and field extraction

class PromptEngineerV5 {
    constructor() {
        this.sessionId = null;
        this.currentStage = 'expert_selection';
        this.selectedExpert = null;
        this.recommendedFields = [];
        this.selectedFields = [];
        this.conversationHistory = [];
        this.deployedToolUrl = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Prompt Engineer V5...');
        
        // Bind event listeners
        this.bindEventListeners();
        
        // Start the session
        await this.startSession();
    }

    bindEventListeners() {
        // Send message
        document.getElementById('send-message')?.addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter key in chat input
        document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    async startSession() {
        try {
            console.log('🤖 Starting V5 session...');
            
            const response = await PMConfig.fetch('api/v5/start', {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.success) {
                this.sessionId = data.session_id;
                this.currentStage = data.current_stage;
                
                // Hide loading, show interface
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('chat-interface').classList.remove('hidden');
                
                // Display AI greeting
                this.displayMessage(data.ai_response.message, 'ai');
                
                // Show expert selection
                if (data.ai_response.show_expert_grid) {
                    this.showExpertGrid(data.ai_response.experts);
                }
                
                this.updateStageIndicator('expert');
                
                console.log('✅ V5 session started:', this.sessionId);
            } else {
                throw new Error('Failed to start session');
            }
        } catch (error) {
            console.error('❌ Error starting V5 session:', error);
            this.showError('Failed to start AI assistant. Please try again.');
        }
    }

    async sendMessage(message = null) {
        const messageText = message || document.getElementById('chat-input')?.value.trim();
        
        if (!messageText) {
            return;
        }

        console.log('💬 Sending V5 message:', messageText);
        
        // Display user message
        this.displayMessage(messageText, 'user');
        
        // Clear input
        if (!message) {
            document.getElementById('chat-input').value = '';
        }
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            const response = await PMConfig.fetch('api/v5/chat', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    message: messageText,
                    stage: this.currentStage,
                    expert_type: this.selectedExpert
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            this.hideTypingIndicator();
            
            if (data.success) {
                // Display AI response
                this.displayMessage(data.ai_response.message, 'ai');
                
                // Update current stage
                this.currentStage = data.current_stage;
                this.updateStageIndicator(this.currentStage);
                
                // Handle stage-specific UI
                this.handleStageTransition(data.ai_response);
                
                console.log('✅ V5 message sent, new stage:', this.currentStage);
            } else {
                throw new Error('Failed to process message');
            }
        } catch (error) {
            console.error('❌ Error sending V5 message:', error);
            this.hideTypingIndicator();
            this.showError('Failed to send message. Please try again.');
        }
    }

    showExpertGrid(experts) {
        const expertGrid = document.getElementById('expert-grid');
        const expertCards = document.getElementById('expert-cards');
        
        expertCards.innerHTML = '';
        
        const expertIcons = {
            'Story Writer & Creative Fiction Expert': '📚',
            'Business & Marketing Consultant': '💼',
            'Health & Wellness Coach': '💪',
            'Educational Content Creator': '🎓',
            'Technical Writing Specialist': '⚙️'
        };
        
        experts.forEach(expert => {
            const card = document.createElement('div');
            card.className = 'expert-card p-4 bg-white rounded-lg shadow hover:shadow-lg border-2 border-gray-200';
            card.dataset.expert = expert;
            
            card.innerHTML = `
                <div class="text-2xl mb-2">${expertIcons[expert] || '🤖'}</div>
                <h4 class="font-semibold text-gray-900 mb-2">${expert.split(' & ')[0]}</h4>
                <p class="text-sm text-gray-600">${this.getExpertDescription(expert)}</p>
            `;
            
            card.addEventListener('click', () => {
                this.selectExpert(expert);
            });
            
            expertCards.appendChild(card);
        });
        
        expertGrid.classList.remove('hidden');
    }

    getExpertDescription(expert) {
        const descriptions = {
            'Story Writer & Creative Fiction Expert': 'Creative fiction, narrative structure, and storytelling',
            'Business & Marketing Consultant': 'Strategic planning, marketing, and business development',
            'Health & Wellness Coach': 'Nutrition, fitness, and lifestyle optimization',
            'Educational Content Creator': 'Learning design and educational content creation',
            'Technical Writing Specialist': 'Documentation, user guides, and technical content'
        };
        return descriptions[expert] || 'Specialized AI assistant';
    }

    selectExpert(expertType) {
        console.log('👨‍💼 V5 Expert selected:', expertType);
        
        this.selectedExpert = expertType;
        
        // Visual feedback
        document.querySelectorAll('.expert-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelector(`[data-expert="${expertType}"]`).classList.add('selected');
        
        // Hide expert grid after selection
        setTimeout(() => {
            document.getElementById('expert-grid').classList.add('hidden');
            document.getElementById('chat-input-area').classList.remove('hidden');
        }, 500);
        
        // Send expert selection
        this.sendMessage(`I choose: ${expertType}`);
    }

    handleStageTransition(aiResponse) {
        console.log('🔄 V5 Stage transition:', aiResponse);
        
        // Handle field recommendations
        if (aiResponse.show_field_selector && aiResponse.fields) {
            this.recommendedFields = aiResponse.fields;
            this.showFieldSelector(aiResponse.fields);
            this.updateStageIndicator('fields');
        }
        
        // Handle field selection completion
        if (aiResponse.selected_fields) {
            this.selectedFields = aiResponse.selected_fields;
            this.showToolConfiguration();
            this.updateStageIndicator('configure');
        }
        
        // Show chat input for other stages
        if (!aiResponse.show_field_selector && !aiResponse.selected_fields) {
            document.getElementById('chat-input-area').classList.remove('hidden');
        }
    }

    showFieldSelector(fields) {
        console.log('📋 Showing V5 field selector:', fields);
        
        const fieldSelector = document.getElementById('field-selector');
        const fieldCheckboxes = document.getElementById('field-checkboxes');
        
        fieldCheckboxes.innerHTML = '';
        
        fields.forEach((field, index) => {
            const fieldCard = document.createElement('div');
            fieldCard.className = 'field-card p-4 border border-gray-200 rounded-lg hover:bg-gray-50';
            
            const fieldTypeIcon = this.getFieldTypeIcon(field.type);
            const optionsText = field.options ? ` (${field.options.length} options)` : '';
            
            fieldCard.innerHTML = `
                <div class="flex items-start">
                    <input type="checkbox" id="field_${index}" value="${index}" 
                           class="mt-1 mr-3 h-5 w-5 text-blue-600 rounded" checked>
                    <div class="flex-1">
                        <label for="field_${index}" class="cursor-pointer">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-lg">${fieldTypeIcon}</span>
                                <span class="font-medium text-gray-900">${field.label}</span>
                                <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">
                                    ${field.type}${optionsText}
                                </span>
                                ${field.required ? '<span class="text-red-500 text-xs">*</span>' : ''}
                            </div>
                            <p class="text-sm text-gray-600">${field.description}</p>
                            ${field.options ? `<div class="mt-2 text-xs text-gray-500">Options: ${field.options.slice(0, 3).join(', ')}${field.options.length > 3 ? '...' : ''}</div>` : ''}
                        </label>
                    </div>
                </div>
            `;
            
            // Add checkbox event listener for visual feedback
            const checkbox = fieldCard.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    fieldCard.classList.add('selected');
                } else {
                    fieldCard.classList.remove('selected');
                }
            });
            
            // Initially mark as selected
            fieldCard.classList.add('selected');
            
            fieldCheckboxes.appendChild(fieldCard);
        });
        
        // Hide chat input and show field selector
        document.getElementById('chat-input-area').classList.add('hidden');
        fieldSelector.classList.remove('hidden');
    }

    getFieldTypeIcon(type) {
        const icons = {
            'text': '📝',
            'textarea': '📄',
            'select': '📋',
            'checkbox': '☑️',
            'number': '🔢'
        };
        return icons[type] || '📝';
    }

    async acceptSelectedFields() {
        console.log('✅ V5 Accepting selected fields');
        
        const selectedIndices = [];
        const checkboxes = document.querySelectorAll('#field-checkboxes input[type="checkbox"]:checked');
        
        checkboxes.forEach(checkbox => {
            selectedIndices.push(parseInt(checkbox.value));
        });
        
        if (selectedIndices.length === 0) {
            this.showError('Please select at least one field.');
            return;
        }
        
        const selectedFields = selectedIndices.map(index => this.recommendedFields[index]);
        
        try {
            const response = await PMConfig.fetch('api/v5/action', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'select_fields',
                    data: {
                        selected_fields: selectedFields
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.success) {
                this.selectedFields = selectedFields;
                
                // Hide field selector
                document.getElementById('field-selector').classList.add('hidden');
                
                // Display success message
                this.displayMessage(data.message, 'ai');
                
                // Show tool configuration
                this.showToolConfiguration();
                this.updateStageIndicator('configure');
                
                console.log('✅ V5 Fields selected:', selectedFields.length);
            } else {
                throw new Error('Failed to select fields');
            }
        } catch (error) {
            console.error('❌ Error selecting V5 fields:', error);
            this.showError('Failed to select fields. Please try again.');
        }
    }

    async requestDifferentFields() {
        console.log('🔄 V5 Requesting different fields');
        
        try {
            const response = await PMConfig.fetch('api/v5/action', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'request_different_fields'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.success) {
                // Hide current selector
                document.getElementById('field-selector').classList.add('hidden');
                
                // Display AI message
                this.displayMessage(data.message, 'ai');
                
                // Show new field selector
                if (data.fields) {
                    this.recommendedFields = data.fields;
                    this.showFieldSelector(data.fields);
                }
                
                console.log('✅ V5 Different fields requested');
            } else {
                throw new Error('Failed to get different fields');
            }
        } catch (error) {
            console.error('❌ Error requesting different V5 fields:', error);
            this.showError('Failed to get different fields. Please try again.');
        }
    }

    async modifyFields() {
        console.log('✏️ V5 Modifying fields');
        
        // Hide field selector, show chat input
        document.getElementById('field-selector').classList.add('hidden');
        document.getElementById('chat-input-area').classList.remove('hidden');
        
        // Set placeholder for modification request
        const chatInput = document.getElementById('chat-input');
        chatInput.placeholder = 'Tell me how you want to modify the field suggestions...';
        chatInput.focus();
        
        // Display instruction message
        this.displayMessage('Please describe how you\'d like me to modify the field suggestions. For example: "Add a field for user age" or "Remove the genre field and add a mood field instead."', 'ai');
    }

    showToolConfiguration() {
        console.log('🛠️ V5 Showing tool configuration');
        
        // Hide chat input
        document.getElementById('chat-input-area').classList.add('hidden');
        
        // Show tool config
        document.getElementById('tool-config').classList.remove('hidden');
        
        // Generate suggested values
        this.populateToolSuggestions();
    }

    populateToolSuggestions() {
        const toolName = document.getElementById('tool-name');
        const toolSubdomain = document.getElementById('tool-subdomain');
        const toolDescription = document.getElementById('tool-description');
        
        // Generate suggestions based on expert and fields
        if (this.selectedExpert && this.selectedExpert.includes('Story')) {
            toolName.value = 'AI Story Generator';
            toolSubdomain.value = 'story-generator-' + Date.now().toString().slice(-6);
            toolDescription.value = 'Generate personalized stories based on your preferences for characters, settings, and themes.';
        } else if (this.selectedExpert && this.selectedExpert.includes('Business')) {
            toolName.value = 'Business Content Creator';
            toolSubdomain.value = 'business-content-' + Date.now().toString().slice(-6);
            toolDescription.value = 'Create professional business content tailored to your specific needs and audience.';
        } else {
            toolName.value = 'AI-Powered Tool';
            toolSubdomain.value = 'ai-tool-' + Date.now().toString().slice(-6);
            toolDescription.value = 'Create personalized content with AI assistance.';
        }
    }

    async deployTool() {
        console.log('🚀 V5 Deploying tool');
        
        const toolName = document.getElementById('tool-name').value.trim();
        const toolSubdomain = document.getElementById('tool-subdomain').value.trim();
        const toolDescription = document.getElementById('tool-description').value.trim();
        
        if (!toolName || !toolSubdomain || !toolDescription) {
            this.showError('Please fill in all required fields.');
            return;
        }
        
        // Show loading state
        const deployButton = document.querySelector('#tool-config button[onclick*="deployTool"]');
        const originalText = deployButton.textContent;
        deployButton.textContent = '🔄 Deploying...';
        deployButton.disabled = true;
        
        try {
            const response = await PMConfig.fetch('api/v5/action', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'deploy_tool',
                    data: {
                        name: toolName,
                        subdomain: toolSubdomain,
                        description: toolDescription
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.success) {
                this.deployedToolUrl = data.tool_url;
                
                // Hide tool config
                document.getElementById('tool-config').classList.add('hidden');
                
                // Show success
                this.showDeploymentSuccess(data.tool_url);
                this.updateStageIndicator('deploy');
                
                console.log('✅ V5 Tool deployed:', data.tool_url);
            } else {
                throw new Error(data.error || 'Deployment failed');
            }
        } catch (error) {
            console.error('❌ Error deploying V5 tool:', error);
            this.showError('Failed to deploy tool: ' + error.message);
        } finally {
            // Restore button
            deployButton.textContent = originalText;
            deployButton.disabled = false;
        }
    }

    showDeploymentSuccess(toolUrl) {
        const deploymentSuccess = document.getElementById('deployment-success');
        const deployedUrl = document.getElementById('deployed-url');
        const visitTool = document.getElementById('visit-tool');
        
        deployedUrl.href = toolUrl;
        deployedUrl.textContent = toolUrl;
        visitTool.href = toolUrl;
        
        deploymentSuccess.classList.remove('hidden');
        
        // Display success message
        this.displayMessage(`🎉 Your tool has been successfully deployed! It's now live at: ${toolUrl}`, 'ai');
    }

    async saveDraft() {
        this.showError('Draft saving feature coming soon!');
    }

    createAnother() {
        window.location.reload();
    }

    displayMessage(message, sender) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message flex space-x-3';
        
        if (sender === 'ai') {
            messageDiv.innerHTML = `
                <div class="ai-avatar w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    AI
                </div>
                <div class="flex-1 bg-white rounded-lg p-4 shadow-sm border">
                    <div class="prose prose-sm max-w-none">
                        ${this.formatMessage(message)}
                    </div>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="flex-1"></div>
                <div class="bg-blue-600 text-white rounded-lg p-4 shadow-sm max-w-lg">
                    <p class="text-sm">${this.escapeHtml(message)}</p>
                </div>
                <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm">
                    U
                </div>
            `;
        }
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    formatMessage(message) {
        // Convert markdown-style formatting to HTML
        return message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mb-2">$1</h1>')
            .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mb-2">$1</h2>')
            .replace(/^### (.*$)/gm, '<h3 class="text-base font-medium mb-2">$1</h3>')
            .replace(/^\* (.*$)/gm, '<li>$1</li>')
            .replace(/^• (.*$)/gm, '<li>$1</li>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^(.*)$/gm, '<p>$1</p>')
            .replace(/<p><\/p>/g, '')
            .replace(/(<li>.*<\/li>)/s, '<ul class="list-disc pl-5 mb-2">$1</ul>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'chat-message flex space-x-3';
        indicator.innerHTML = `
            <div class="ai-avatar w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm typing-indicator">
                AI
            </div>
            <div class="bg-white rounded-lg p-4 shadow-sm border">
                <p class="text-sm text-gray-500">AI is thinking...</p>
            </div>
        `;
        document.getElementById('chat-messages').appendChild(indicator);
        document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    updateStageIndicator(stage) {
        // Reset all stages
        document.querySelectorAll('.stage-indicator').forEach(indicator => {
            indicator.classList.remove('active', 'completed');
            indicator.classList.add('bg-gray-100', 'text-gray-600');
            indicator.classList.remove('bg-blue-600', 'bg-green-500', 'text-white');
        });

        const stageMap = {
            'expert_selection': 'stage-expert',
            'expert': 'stage-expert',
            'tool_purpose': 'stage-purpose',
            'purpose': 'stage-purpose',
            'field_recommendations': 'stage-fields',
            'field_selection': 'stage-fields',
            'fields': 'stage-fields',
            'tool_configuration': 'stage-configure',
            'configure': 'stage-configure',
            'deployment': 'stage-deploy',
            'deploy': 'stage-deploy'
        };

        const stages = ['expert', 'purpose', 'fields', 'configure', 'deploy'];
        const currentIndex = stages.indexOf(stage);

        stages.forEach((s, index) => {
            const element = document.getElementById(`stage-${s}`);
            if (index < currentIndex) {
                element.classList.add('completed', 'bg-green-500', 'text-white');
                element.classList.remove('bg-gray-100', 'text-gray-600');
            } else if (index === currentIndex) {
                element.classList.add('active', 'bg-blue-600', 'text-white');
                element.classList.remove('bg-gray-100', 'text-gray-600');
            }
        });
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50';
        errorDiv.innerHTML = `
            <div class="flex items-center">
                <span class="mr-2">❌</span>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">×</button>
            </div>
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }
}

// Initialize V5 when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.v5 = new PromptEngineerV5();
});