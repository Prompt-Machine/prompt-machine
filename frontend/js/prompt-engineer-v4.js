// PROMPT ENGINEER V4 - AI-GUIDED CONVERSATIONAL TOOL CREATION
// Advanced conversational interface for prompt engineering

class PromptEngineerV4 {
    constructor() {
        this.sessionId = null;
        this.currentStage = 'greeting';
        this.selectedExpert = null;
        this.conversationHistory = [];
        this.deployedToolUrl = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Prompt Engineer v4...');
        
        // Bind event listeners
        this.bindEventListeners();
        
        // Start the AI conversation
        await this.startSession();
    }

    bindEventListeners() {
        // Send message button
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

        // Expert selection cards
        document.querySelectorAll('.expert-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectExpert(card.dataset.expert);
            });
        });

        // Action buttons
        document.getElementById('deploy-tool')?.addEventListener('click', () => {
            this.deployTool();
        });

        document.getElementById('save-draft')?.addEventListener('click', () => {
            this.saveDraft();
        });

        document.getElementById('make-changes')?.addEventListener('click', () => {
            this.makeChanges();
        });

        document.getElementById('create-another')?.addEventListener('click', () => {
            this.createAnother();
        });
    }

    async startSession() {
        try {
            console.log('🤖 Starting AI conversation...');
            
            const response = await PMConfig.fetch('api/v4/start', {
                method: 'GET'
            });

            if (!response.ok) {
                // Try to get the error message from the response
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                        if (errorData.suggestion) {
                            errorMessage += `\n\n${errorData.suggestion}`;
                        }
                    }
                } catch (parseError) {
                    // If we can't parse the error response, use the default message
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            if (data.success) {
                this.sessionId = data.session_id;
                this.currentStage = 'expert_selection';
                
                // Hide loading, show chat interface
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('chat-interface').classList.remove('hidden');
                
                // Display AI greeting message
                this.displayMessage(data.ai_response.message, 'ai');
                
                // Show expert selection with options from API
                this.showExpertSelection(data.ai_response.options);
                
                // Update stage indicator
                this.updateStageIndicator('expert');
                
                console.log('✅ Session started:', this.sessionId);
            } else {
                throw new Error('Failed to start session');
            }
        } catch (error) {
            console.error('❌ Error starting session:', error);
            
            // Display the detailed error message from the API if available
            if (error.message && (error.message.includes('❌') || error.message.includes('🤖') || error.message.includes('AI Settings'))) {
                this.showError(error.message);
            } else {
                this.showError('Failed to start AI assistant. Please check your AI Settings and try again.');
            }
        }
    }

    async sendMessage(message = null) {
        const messageText = message || document.getElementById('chat-input')?.value.trim();
        
        if (!messageText) {
            return;
        }

        console.log('💬 Sending message:', messageText);
        
        // Display user message
        this.displayMessage(messageText, 'user');
        
        // Clear input
        if (!message) {
            document.getElementById('chat-input').value = '';
        }
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            const response = await PMConfig.fetch('api/v4/chat', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    message: messageText,
                    stage: this.currentStage,
                    expert_type: this.selectedExpert
                })
            });

            if (!response.ok) {
                // Try to get the error message from the response
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                        if (errorData.suggestion) {
                            errorMessage += `\n\n${errorData.suggestion}`;
                        }
                    }
                } catch (parseError) {
                    // If we can't parse the error response, use the default message
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            // Hide typing indicator
            this.hideTypingIndicator();
            
            if (data.success) {
                // Display AI response
                this.displayMessage(data.ai_response.message, 'ai');
                
                // Update stage and fields if provided
                this.currentStage = data.current_stage;
                
                // Store fields if provided in the response
                if (data.ai_response && data.ai_response.fields) {
                    this.currentFields = data.ai_response.fields;
                }
                
                this.updateStageIndicator(data.current_stage);
                
                // Handle stage-specific UI updates
                this.handleStageTransition(data.current_stage, data.ai_response);
                
                console.log('✅ Message sent, new stage:', this.currentStage);
            } else {
                throw new Error('Failed to process message');
            }
        } catch (error) {
            console.error('❌ Error sending message:', error);
            this.hideTypingIndicator();
            
            // Display the detailed error message from the API if available
            if (error.message && (error.message.includes('❌') || error.message.includes('🤖') || error.message.includes('AI Settings'))) {
                this.showError(error.message);
            } else {
                this.showError('Failed to send message. Please check your AI Settings and try again.');
            }
        }
    }

    selectExpert(expertType) {
        console.log('👨‍💼 Expert selected:', expertType);
        
        this.selectedExpert = expertType;
        
        // Visual feedback
        document.querySelectorAll('.expert-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelector(`[data-expert="${expertType}"]`).classList.add('selected');
        
        // Hide expert selection
        setTimeout(() => {
            document.getElementById('expert-selection').classList.add('hidden');
            document.getElementById('chat-input-area').classList.remove('hidden');
        }, 300);
        
        // Send expert selection to AI
        this.sendMessage(`I choose: ${expertType}`);
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
                <div class="flex-1 flex justify-end">
                    <div class="bg-blue-600 text-white rounded-lg p-4 max-w-md">
                        <p class="text-sm">${this.escapeHtml(message)}</p>
                    </div>
                </div>
                <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                    U
                </div>
            `;
        }
        
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    }

    formatMessage(message) {
        // Convert markdown-like formatting to HTML
        return message
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>')
            // Handle lists
            .replace(/<p>•\s*([^<]+)<\/p>/g, '<ul><li>$1</li></ul>')
            .replace(/<\/ul>\s*<ul>/g, '')
            // Handle numbered lists
            .replace(/<p>\d+\.\s*([^<]+)<\/p>/g, '<ol><li>$1</li></ol>')
            .replace(/<\/ol>\s*<ol>/g, '');
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    showTypingIndicator() {
        const chatMessages = document.getElementById('chat-messages');
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'flex space-x-3 typing-indicator';
        typingDiv.innerHTML = `
            <div class="ai-avatar w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm">
                AI
            </div>
            <div class="bg-white rounded-lg p-4 shadow-sm border">
                <div class="flex space-x-1">
                    <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                    <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                    <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    showExpertSelection(expertOptions = []) {
        const expertSelectionDiv = document.getElementById('expert-selection');
        
        // Create expert grid HTML
        const expertGridHTML = `
            <h3 class="text-lg font-semibold mb-4 text-center">Choose Your AI Expert:</h3>
            <div class="expert-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${expertOptions.map(expert => `
                    <button class="expert-card p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 text-left"
                            data-expert="${expert}">
                        <div class="font-medium text-gray-900">${expert}</div>
                    </button>
                `).join('')}
            </div>
        `;
        
        expertSelectionDiv.innerHTML = expertGridHTML;
        expertSelectionDiv.classList.remove('hidden');
        
        // Bind click events to expert cards
        document.querySelectorAll('.expert-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectExpert(card.dataset.expert);
            });
        });
    }

    updateStageIndicator(stage) {
        // Reset all stages
        document.querySelectorAll('.stage-indicator').forEach(indicator => {
            indicator.classList.remove('active', 'completed');
            indicator.classList.add('bg-gray-100', 'text-gray-600');
            indicator.classList.remove('bg-blue-600', 'bg-green-500', 'text-white');
        });

        const stageMap = {
            'greeting': 'stage-greeting',
            'expert_selection': 'stage-expert',
            'tool_purpose': 'stage-purpose',
            'field_recommendations': 'stage-fields',
            'field_refinement': 'stage-fields',
            'tool_details': 'stage-details',
            'final_review': 'stage-deploy',
            'deployment': 'stage-deploy'
        };

        const stages = ['greeting', 'expert_selection', 'tool_purpose', 'field_recommendations', 'tool_details', 'deployment'];
        const currentIndex = stages.indexOf(stage);

        stages.forEach((stageName, index) => {
            const element = document.getElementById(stageMap[stageName]);
            if (!element) return;

            if (index < currentIndex) {
                // Completed stages
                element.classList.remove('bg-gray-100', 'text-gray-600');
                element.classList.add('completed', 'bg-green-500', 'text-white');
            } else if (index === currentIndex) {
                // Current active stage
                element.classList.remove('bg-gray-100', 'text-gray-600');
                element.classList.add('active', 'bg-blue-600', 'text-white');
            }
        });
    }

    handleStageTransition(stage, aiResponse) {
        // Add interactive elements based on stage
        switch (stage) {
            case 'tool_purpose':
                this.showChatInput();
                break;
                
            case 'field_recommendations':
                if (aiResponse.show_options) {
                    this.showFieldRecommendationOptions();
                } else {
                    this.showChatInput();
                }
                break;
                
            case 'field_modification_chat':
                this.showChatInput();
                break;
                
            case 'field_editing':
                this.showFieldEditor();
                break;
                
            case 'tool_naming':
                this.showToolNamingForm();
                break;
                
            case 'final_review':
                this.showDeploymentOptions();
                break;
                
            case 'deployment':
                this.showDeploymentComplete();
                break;
                
            default:
                // For any other stages, show chat input
                this.showChatInput();
                break;
        }
    }

    async deployTool() {
        console.log('🚀 Deploying tool...');
        
        // Show loading state
        const deployButton = document.getElementById('deploy-tool');
        const originalText = deployButton.textContent;
        deployButton.textContent = '🔄 Deploying...';
        deployButton.disabled = true;
        
        try {
            const response = await PMConfig.fetch('api/v4/deploy', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId
                })
            });

            if (!response.ok) {
                // Try to get the error message from the response
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                        if (errorData.suggestion) {
                            errorMessage += `\n\n${errorData.suggestion}`;
                        }
                    }
                } catch (parseError) {
                    // If we can't parse the error response, use the default message
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            if (data.success) {
                // Store the deployed tool URL
                this.deployedToolUrl = data.tool_url;
                
                // Show success message
                document.getElementById('action-buttons')?.classList.add('hidden');
                document.getElementById('deployment-success')?.classList.remove('hidden');
                
                // Update links if elements exist
                if (document.getElementById('deployed-url')) {
                    document.getElementById('deployed-url').href = data.tool_url;
                    document.getElementById('deployed-url').textContent = data.tool_url;
                }
                if (document.getElementById('visit-tool')) {
                    document.getElementById('visit-tool').href = data.tool_url;
                }
                
                console.log('✅ Tool deployed successfully:', data.tool_url);
                
                // Update stage indicator
                this.updateStageIndicator('deployment');
                
                // Show success message in chat
                this.displayMessage(`🎉 **Your tool has been deployed successfully!**\n\n**URL:** ${data.tool_url}\n\nYour AI-powered tool is now live and ready for users. You can visit it, share it, or create more tools from your dashboard.`, 'ai');
                
            } else {
                throw new Error('Deployment failed');
            }
        } catch (error) {
            console.error('❌ Error deploying tool:', error);
            this.showError('Failed to deploy tool. Please try again.');
            
            // Reset button
            deployButton.textContent = originalText;
            deployButton.disabled = false;
        }
    }

    async saveDraft() {
        console.log('💾 Saving draft...');
        
        try {
            // Gather current tool data
            const toolName = document.getElementById('tool-name')?.value || 'Untitled Draft';
            const toolDescription = document.getElementById('tool-description')?.value || 'Draft in progress';
            const toolSubdomain = document.getElementById('tool-subdomain')?.value || 'draft-tool';

            const response = await PMConfig.fetch('api/v4/choice', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'save_draft',
                    data: {
                        name: toolName,
                        description: toolDescription,
                        subdomain: toolSubdomain,
                        fields: this.currentFields || []
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.displayMessage(data.message, 'ai');
                this.showSuccess(`"${toolName}" saved as draft successfully!`);
            } else {
                throw new Error('Failed to save draft');
            }
        } catch (error) {
            console.error('Error saving draft:', error);
            this.showError('Failed to save draft. Please try again.');
        }
    }

    makeChanges() {
        console.log('✏️ Making changes...');
        // Re-enable chat input to make changes
        document.getElementById('action-buttons').classList.add('hidden');
        document.getElementById('chat-input-area').classList.remove('hidden');
        
        this.displayMessage("What would you like to change about the tool? I can help you modify the fields, description, name, or any other aspect.", 'ai');
    }

    createAnother() {
        console.log('🆕 Creating another tool...');
        // Reload the page to start fresh
        window.location.reload();
    }

    showError(message) {
        // Create toast notification for errors
        this.showToast(message, 'error');
    }

    showSuccess(message) {
        // Create toast notification for success
        this.showToast(message, 'success');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-sm ${
            type === 'error' ? 'bg-red-500 text-white' :
            type === 'success' ? 'bg-green-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        toast.innerHTML = `
            <div class="flex items-center justify-between">
                <p class="text-sm">${message}</p>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                    ×
                </button>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    // ===========================================
    // INTERACTIVE PROMPT ENGINEERING FUNCTIONS  
    // ===========================================

    displayAIResponse(message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-response bg-gray-50 p-4 rounded-lg mb-4';
        messageDiv.innerHTML = `<div class="prose max-w-none">${this.formatMessage(message)}</div>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    showChatInput() {
        document.getElementById('chat-input-area').classList.remove('hidden');
    }

    showFieldRecommendationOptions() {
        // Get the current fields from the last AI response or stored fields
        const fields = this.currentFields || this.extractFieldsFromLastResponse() || [];
        
        if (fields.length === 0) {
            // Fallback to old interface if no fields are available
            this.showLegacyFieldOptions();
            return;
        }
        
        const optionsHTML = `
            <div class="field-recommendation-actions bg-white p-6 rounded-lg border-2 border-blue-200 mb-4">
                <h3 class="text-xl font-semibold mb-4">✅ Select Your Field Recommendations</h3>
                <p class="text-gray-600 mb-4">Review the AI's field suggestions and select which ones you'd like to use for your tool:</p>
                
                <div class="space-y-3 mb-6" id="field-checkbox-list">
                    ${fields.map((field, index) => {
                        const fieldName = field.label || field.name || `Field ${index + 1}`;
                        const fieldType = field.type || 'text';
                        const description = field.description || '';
                        const options = field.options || [];
                        
                        return `
                            <div class="field-checkbox-item p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                                <div class="flex items-start">
                                    <input type="checkbox" id="field_${index}" value="${index}" 
                                           class="mt-1 mr-3 h-5 w-5 text-blue-600 rounded" checked>
                                    <div class="flex-1">
                                        <label for="field_${index}" class="cursor-pointer">
                                            <div class="flex items-center gap-2 mb-1">
                                                <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">
                                                    ${fieldType.toUpperCase()}
                                                </span>
                                                <span class="font-semibold text-gray-900">${fieldName}</span>
                                            </div>
                                            <p class="text-gray-600 text-sm">${description}</p>
                                            ${options.length > 0 ? `
                                                <div class="text-xs text-gray-500 mt-1">
                                                    <strong>Options:</strong> ${options.slice(0, 3).join(', ')}${options.length > 3 ? ` (+${options.length - 3} more)` : ''}
                                                </div>
                                            ` : ''}
                                        </label>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div class="flex flex-wrap gap-3 pt-4 border-t">
                    <button onclick="promptEngineerV4.acceptSelectedFields()" 
                            class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium">
                        ✅ Use Selected Fields
                    </button>
                    <button onclick="promptEngineerV4.requestNewFields()" 
                            class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                        🔄 Get Different Suggestions
                    </button>
                    <button onclick="promptEngineerV4.modifyFields()" 
                            class="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-medium">
                        💬 Request Modifications
                    </button>
                </div>
                
                <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p class="text-amber-800 text-sm">
                        <span class="font-semibold">💡 Tip:</span> Select the fields that best match your tool's purpose. You can always add, edit, or reorder fields in the next step.
                    </p>
                </div>
            </div>
        `;
        
        document.getElementById('chat-messages').insertAdjacentHTML('beforeend', optionsHTML);
        document.getElementById('chat-input-area').classList.add('hidden');
    }
    
    showLegacyFieldOptions() {
        const optionsHTML = `
            <div class="field-recommendation-actions bg-white p-6 rounded-lg border-2 border-blue-200 mb-4">
                <h3 class="text-lg font-semibold mb-4">What would you like to do?</h3>
                <div class="flex flex-wrap gap-3">
                    <button onclick="promptEngineerV4.acceptFieldSuggestions()" 
                            class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition">
                        ✅ Use These Fields
                    </button>
                    <button onclick="promptEngineerV4.requestNewFields()" 
                            class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
                        🔄 Try Different Fields
                    </button>
                    <button onclick="promptEngineerV4.modifyFields()" 
                            class="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition">
                        💬 Modify These Ideas
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('chat-messages').insertAdjacentHTML('beforeend', optionsHTML);
        document.getElementById('chat-input-area').classList.add('hidden');
    }

    showFieldEditor() {
        const editorHTML = `
            <div class="field-editor bg-white p-6 rounded-lg border-2 border-green-200 mb-4 w-full">
                <h3 class="text-xl font-semibold mb-6">Edit Your Prompt Fields</h3>
                <div class="text-sm text-gray-600 mb-4">
                    Review, edit, reorder, and customize your fields. These will determine what information users provide to get personalized results.
                </div>
                <div id="field-list" class="space-y-4 mb-6 min-h-[300px] max-h-[600px] overflow-y-auto">
                    <!-- Fields will be populated here -->
                </div>
                <div class="flex flex-wrap gap-3 pt-4 border-t">
                    <button onclick="promptEngineerV4.addNewField()" 
                            class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                        ➕ Add New Field
                    </button>
                    <button onclick="promptEngineerV4.continueToNaming()" 
                            class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium">
                        ➡️ Continue to Tool Details
                    </button>
                    <button onclick="promptEngineerV4.goBackToFieldOptions()" 
                            class="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 font-medium">
                        ⬅️ Back to Field Options
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('chat-messages').insertAdjacentHTML('beforeend', editorHTML);
        document.getElementById('chat-input-area').classList.add('hidden');
        this.populateFieldEditor();
    }

    showToolNamingForm() {
        // First, generate AI suggestions for tool details
        this.generateToolSuggestions().then(suggestions => {
            const namingHTML = `
                <div class="tool-naming bg-white p-6 rounded-lg border-2 border-yellow-200 mb-4">
                    <h3 class="text-xl font-semibold mb-4">🎯 Tool Preview & Details</h3>
                    <p class="text-gray-600 mb-6">Review the AI-generated suggestions below and make any changes you'd like:</p>
                    
                    <div class="space-y-6">
                        <div>
                            <label class="block text-sm font-medium mb-2">Tool Name</label>
                            <input type="text" id="tool-name" value="${suggestions.name || ''}"
                                   class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                   placeholder="e.g., Personalized Story Generator">
                            <p class="text-xs text-gray-500 mt-1">💡 AI suggested this name based on your tool's purpose</p>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-2">Description</label>
                            <textarea id="tool-description" rows="3"
                                    class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Describe what your tool does for users...">${suggestions.description || ''}</textarea>
                            <p class="text-xs text-gray-500 mt-1">✨ AI crafted this description for maximum user appeal</p>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-2">Subdomain</label>
                            <div class="flex items-center">
                                <input type="text" id="tool-subdomain" value="${suggestions.subdomain || ''}"
                                       class="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                       placeholder="story-generator">
                                <span class="bg-gray-100 px-3 py-3 border border-l-0 rounded-r-lg text-gray-600 text-sm">
                                    .tool.prompt-machine.com
                                </span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">🌐 AI optimized this URL for search engines</p>
                        </div>
                        
                        <!-- Preview Section -->
                        <div class="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                            <h4 class="font-semibold text-gray-800 mb-3">📋 Tool Preview</h4>
                            <div class="space-y-2 text-sm">
                                <div><span class="font-medium">Fields:</span> ${(this.currentFields || []).length} custom input fields</div>
                                <div><span class="font-medium">Expert Mode:</span> ${this.selectedExpert || 'AI Assistant'}</div>
                                <div><span class="font-medium">URL:</span> <span class="font-mono text-blue-600">https://<span id="subdomain-preview">${suggestions.subdomain || 'your-tool'}</span>.tool.prompt-machine.com</span></div>
                            </div>
                        </div>
                        
                        <!-- Field Summary -->
                        ${(this.currentFields || []).length > 0 ? `
                            <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                                <h4 class="font-semibold text-gray-800 mb-3">📝 Your Fields Summary</h4>
                                <div class="grid gap-2">
                                    ${this.currentFields.map((field, index) => `
                                        <div class="flex items-center text-sm">
                                            <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-2">${(field.type || 'text').toUpperCase()}</span>
                                            <span class="font-medium">${field.label || field.name || `Field ${index + 1}`}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex flex-wrap gap-3 mt-8 pt-4 border-t">
                        <button onclick="promptEngineerV4.saveAndDeploy()" 
                                class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium shadow-lg">
                            🚀 Deploy Tool Now
                        </button>
                        <button onclick="promptEngineerV4.saveDraft()" 
                                class="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 font-medium">
                            💾 Save as Draft
                        </button>
                        <button onclick="promptEngineerV4.goBackToFieldEditor()" 
                                class="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 font-medium">
                            ⬅️ Edit Fields
                        </button>
                    </div>
                </div>
            `;
            
            document.getElementById('chat-messages').insertAdjacentHTML('beforeend', namingHTML);
            document.getElementById('chat-input-area').classList.add('hidden');
            
            // Add live preview updates
            this.bindPreviewUpdates();
        });
    }
    
    async generateToolSuggestions() {
        try {
            // Generate suggestions based on the expert type, fields, and conversation
            const expertType = this.selectedExpert || 'AI Assistant';
            const fieldCount = (this.currentFields || []).length;
            const fieldSummary = (this.currentFields || []).map(f => f.label || f.name).join(', ');
            
            // Create basic suggestions based on available information
            const suggestions = {
                name: this.generateToolName(expertType, fieldSummary),
                description: this.generateToolDescription(expertType, fieldCount),
                subdomain: this.generateSubdomain(expertType)
            };
            
            return suggestions;
        } catch (error) {
            console.warn('Failed to generate tool suggestions:', error);
            return {
                name: 'AI-Powered Tool',
                description: 'Create amazing content with AI assistance',
                subdomain: 'ai-tool'
            };
        }
    }
    
    generateToolName(expertType, fieldSummary) {
        if (expertType.includes('Story') || expertType.includes('Creative')) {
            return 'Personalized Story Generator';
        } else if (expertType.includes('Business') || expertType.includes('Marketing')) {
            return 'AI Business Content Creator';
        } else if (expertType.includes('Health') || expertType.includes('Wellness')) {
            return 'Personal Wellness Advisor';
        } else if (expertType.includes('Educational') || expertType.includes('Education')) {
            return 'Smart Learning Assistant';
        } else if (expertType.includes('Technical')) {
            return 'Technical Documentation Helper';
        } else {
            return 'Smart AI Assistant';
        }
    }
    
    generateToolDescription(expertType, fieldCount) {
        const baseDesc = `Get instant, professional results with ${fieldCount} customized input${fieldCount !== 1 ? 's' : ''}. `;
        
        if (expertType.includes('Story') || expertType.includes('Creative')) {
            return baseDesc + 'Create compelling stories, characters, and creative content tailored to your vision.';
        } else if (expertType.includes('Business') || expertType.includes('Marketing')) {
            return baseDesc + 'Generate professional business content, marketing copy, and strategic communications.';
        } else if (expertType.includes('Health') || expertType.includes('Wellness')) {
            return baseDesc + 'Receive personalized health and wellness guidance based on your specific needs.';
        } else if (expertType.includes('Educational') || expertType.includes('Education')) {
            return baseDesc + 'Enhance learning with customized educational content and study materials.';
        } else {
            return baseDesc + 'Powered by advanced AI to deliver exactly what you need.';
        }
    }
    
    generateSubdomain(expertType) {
        if (expertType.includes('Story') || expertType.includes('Creative')) {
            return 'story-generator';
        } else if (expertType.includes('Business') || expertType.includes('Marketing')) {
            return 'business-content';
        } else if (expertType.includes('Health') || expertType.includes('Wellness')) {
            return 'wellness-advisor';
        } else if (expertType.includes('Educational') || expertType.includes('Education')) {
            return 'learning-assistant';
        } else if (expertType.includes('Technical')) {
            return 'tech-helper';
        } else {
            return 'ai-assistant';
        }
    }
    
    bindPreviewUpdates() {
        // Update subdomain preview when user types
        const subdomainInput = document.getElementById('tool-subdomain');
        const subdomainPreview = document.getElementById('subdomain-preview');
        
        if (subdomainInput && subdomainPreview) {
            subdomainInput.addEventListener('input', (e) => {
                const value = e.target.value.trim() || 'your-tool';
                subdomainPreview.textContent = value;
            });
        }
    }
    
    goBackToFieldEditor() {
        document.querySelector('.tool-naming')?.remove();
        this.showFieldEditor();
    }

    // Interactive action handlers
    async acceptFieldSuggestions() {
        try {
            const response = await PMConfig.fetch('api/v4/choice', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'accept_fields'
                })
            });

            if (response.ok) {
                const data = await response.json();
                document.querySelector('.field-recommendation-actions').remove();
                this.currentStage = data.next_stage;
                this.currentFields = data.fields || []; // Store the extracted fields
                this.displayAIResponse(data.message);
                this.showFieldEditor();
            }
        } catch (error) {
            console.error('Error accepting field suggestions:', error);
            this.showError('Failed to proceed. Please try again.');
        }
    }

    async requestNewFields() {
        try {
            const response = await PMConfig.fetch('api/v4/choice', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'request_new_fields'
                })
            });

            if (response.ok) {
                const data = await response.json();
                document.querySelector('.field-recommendation-actions')?.remove();
                this.displayMessage(data.message, 'ai');
                
                // Store new fields if provided
                if (data.fields) {
                    this.currentFields = data.fields;
                }
                
                // Show field recommendation options for the new fields
                if (data.show_options) {
                    this.showFieldRecommendationOptions();
                } else if (data.show_input) {
                    this.showChatInput();
                }
            }
        } catch (error) {
            console.error('Error requesting new fields:', error);
            this.showError('Failed to request new fields. Please try again.');
        }
    }

    async modifyFields() {
        try {
            const response = await PMConfig.fetch('api/v4/choice', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'modify_fields'
                })
            });

            if (response.ok) {
                const data = await response.json();
                document.querySelector('.field-recommendation-actions')?.remove();
                this.displayMessage(data.message, 'ai');
                
                // Always show chat input for modification requests
                if (data.show_input) {
                    this.showChatInput();
                }
            }
        } catch (error) {
            console.error('Error modifying fields:', error);
            this.showError('Failed to modify fields. Please try again.');
        }
    }

    continueToNaming() {
        this.currentStage = 'tool_naming';
        this.displayAIResponse("Excellent! Your fields look great. Now let's give your tool a name and description so users know what it does.");
        this.showToolNamingForm();
    }

    populateFieldEditor() {
        const fieldList = document.getElementById('field-list');
        if (!fieldList) return;
        
        // Use extracted fields or create default
        const fields = this.currentFields || [{
            id: 'field_1',
            name: 'User Input', 
            label: 'User Input',
            type: 'text',
            description: 'Main user input field',
            required: true
        }];
        
        if (fields.length === 0) {
            fieldList.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p class="text-lg mb-2">No fields defined yet</p>
                    <p class="text-sm">Add your first field to get started</p>
                </div>
            `;
            return;
        }
        
        const fieldListHTML = fields.map((field, index) => {
            const fieldName = field.label || field.name || `Field ${index + 1}`;
            const fieldType = field.type || 'text';
            const description = field.description || '';
            const options = field.options || [];
            
            return `
                <div class="field-item bg-gray-50 border border-gray-300 rounded-lg p-4 hover:shadow-md transition-shadow" data-field-id="${field.id || `field_${index + 1}`}">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">${fieldType.toUpperCase()}</span>
                                <h4 class="font-semibold text-lg text-gray-900">${fieldName}</h4>
                                ${field.required ? '<span class="text-red-500 text-sm">*</span>' : ''}
                            </div>
                            <p class="text-gray-600 mb-2">${description}</p>
                            ${options.length > 0 ? `
                                <div class="text-sm text-gray-500">
                                    <strong>Options:</strong> ${options.slice(0, 3).join(', ')}${options.length > 3 ? `... (+${options.length - 3} more)` : ''}
                                </div>
                            ` : ''}
                        </div>
                        <div class="flex flex-col gap-2 ml-4">
                            <button onclick="promptEngineerV4.moveFieldUp(${index})" 
                                    ${index === 0 ? 'disabled class="text-gray-300 cursor-not-allowed"' : 'class="text-gray-600 hover:text-gray-800"'}
                                    title="Move up">
                                ⬆️
                            </button>
                            <button onclick="promptEngineerV4.moveFieldDown(${index})" 
                                    ${index === fields.length - 1 ? 'disabled class="text-gray-300 cursor-not-allowed"' : 'class="text-gray-600 hover:text-gray-800"'}
                                    title="Move down">
                                ⬇️
                            </button>
                            <button onclick="promptEngineerV4.editField(${index})" 
                                    class="text-blue-600 hover:text-blue-800"
                                    title="Edit field">
                                ✏️
                            </button>
                            <button onclick="promptEngineerV4.deleteField(${index})" 
                                    class="text-red-600 hover:text-red-800"
                                    title="Delete field">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        fieldList.innerHTML = fieldListHTML;
    }

    moveFieldUp(index) {
        if (index <= 0 || !this.currentFields) return;
        
        const fields = [...this.currentFields];
        [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
        this.currentFields = fields;
        this.populateFieldEditor();
    }

    moveFieldDown(index) {
        if (!this.currentFields || index >= this.currentFields.length - 1) return;
        
        const fields = [...this.currentFields];
        [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];
        this.currentFields = fields;
        this.populateFieldEditor();
    }

    editField(index) {
        if (!this.currentFields || index < 0 || index >= this.currentFields.length) return;
        
        const field = this.currentFields[index];
        this.showFieldEditModal(field, index);
    }

    deleteField(index) {
        if (!this.currentFields || index < 0 || index >= this.currentFields.length) return;
        
        const field = this.currentFields[index];
        if (confirm(`Are you sure you want to delete the field "${field.label || field.name || 'Field ' + (index + 1)}"?`)) {
            this.currentFields.splice(index, 1);
            this.populateFieldEditor();
        }
    }

    addNewField() {
        this.showFieldEditModal(null, -1);
    }

    showFieldEditModal(field, index) {
        const isEditing = field !== null;
        const fieldData = field || {
            name: '',
            label: '',
            type: 'text',
            description: '',
            required: true,
            options: []
        };

        const modalHTML = `
            <div id="field-edit-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                    <h3 class="text-lg font-semibold mb-4">${isEditing ? 'Edit Field' : 'Add New Field'}</h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Field Name</label>
                            <input type="text" id="field-name" value="${fieldData.label || fieldData.name || ''}" 
                                   class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                   placeholder="e.g., Story Genre">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-2">Field Type</label>
                            <select id="field-type" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="text" ${fieldData.type === 'text' ? 'selected' : ''}>Text Input</option>
                                <option value="textarea" ${fieldData.type === 'textarea' ? 'selected' : ''}>Text Area</option>
                                <option value="select" ${fieldData.type === 'select' || fieldData.type === 'dropdown' ? 'selected' : ''}>Dropdown</option>
                                <option value="checkbox" ${fieldData.type === 'checkbox' ? 'selected' : ''}>Checkboxes</option>
                                <option value="radio" ${fieldData.type === 'radio' ? 'selected' : ''}>Radio Buttons</option>
                                <option value="range" ${fieldData.type === 'range' ? 'selected' : ''}>Range Slider</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-2">Description</label>
                            <textarea id="field-description" rows="2" 
                                      class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                      placeholder="Describe what this field is for...">${fieldData.description || ''}</textarea>
                        </div>
                        
                        <div id="field-options-container" class="hidden">
                            <label class="block text-sm font-medium mb-2">Options (one per line)</label>
                            <textarea id="field-options" rows="4" 
                                      class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                      placeholder="Fantasy Adventure&#10;Romantic Comedy&#10;Sci-Fi Thriller">${(fieldData.options || []).join('\\n')}</textarea>
                        </div>
                        
                        <div class="flex items-center">
                            <input type="checkbox" id="field-required" ${fieldData.required ? 'checked' : ''} 
                                   class="mr-2 h-4 w-4 text-blue-600 rounded">
                            <label for="field-required" class="text-sm font-medium">Required field</label>
                        </div>
                    </div>
                    
                    <div class="flex gap-3 mt-6">
                        <button onclick="promptEngineerV4.saveFieldEdit(${index})" 
                                class="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                            ${isEditing ? 'Update Field' : 'Add Field'}
                        </button>
                        <button onclick="promptEngineerV4.closeFieldEditModal()" 
                                class="flex-1 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Show/hide options based on field type
        const typeSelect = document.getElementById('field-type');
        const optionsContainer = document.getElementById('field-options-container');
        
        const toggleOptions = () => {
            const type = typeSelect.value;
            if (type === 'select' || type === 'dropdown' || type === 'checkbox' || type === 'radio') {
                optionsContainer.classList.remove('hidden');
            } else {
                optionsContainer.classList.add('hidden');
            }
        };
        
        typeSelect.addEventListener('change', toggleOptions);
        toggleOptions(); // Initial check
    }

    saveFieldEdit(index) {
        const name = document.getElementById('field-name').value.trim();
        const type = document.getElementById('field-type').value;
        const description = document.getElementById('field-description').value.trim();
        const required = document.getElementById('field-required').checked;
        const optionsText = document.getElementById('field-options').value.trim();
        
        if (!name) {
            alert('Field name is required');
            return;
        }
        
        const options = optionsText ? optionsText.split('\\n').map(opt => opt.trim()).filter(opt => opt) : [];
        
        const fieldData = {
            id: index >= 0 && this.currentFields[index] ? this.currentFields[index].id : `field_${Date.now()}`,
            name: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            label: name,
            type: type,
            description: description,
            required: required,
            options: options.length > 0 ? options : null
        };

        if (!this.currentFields) {
            this.currentFields = [];
        }

        if (index >= 0) {
            // Editing existing field
            this.currentFields[index] = fieldData;
        } else {
            // Adding new field
            this.currentFields.push(fieldData);
        }

        this.closeFieldEditModal();
        this.populateFieldEditor();
    }

    closeFieldEditModal() {
        const modal = document.getElementById('field-edit-modal');
        if (modal) {
            modal.remove();
        }
    }

    goBackToFieldOptions() {
        document.querySelector('.field-editor')?.remove();
        this.showFieldRecommendationOptions();
    }
    
    extractFieldsFromLastResponse() {
        // Try to extract fields from the most recent AI response
        try {
            const chatMessages = document.querySelectorAll('.chat-message .prose');
            if (chatMessages.length === 0) return [];
            
            const lastMessage = chatMessages[chatMessages.length - 1];
            const messageText = lastMessage.textContent || '';
            
            // Look for field patterns like **Field Name** (type): Description
            const fieldRegex = /\*\*([^*]+)\*\*\s*\(([^)]+)\):\s*([^\n]+)/g;
            const fields = [];
            let match;
            let index = 0;
            
            while ((match = fieldRegex.exec(messageText)) !== null) {
                const [_, fieldName, fieldType, description] = match;
                
                fields.push({
                    id: `extracted_field_${index++}`,
                    name: fieldName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'),
                    label: fieldName.trim(),
                    type: fieldType.trim().toLowerCase(),
                    description: description.trim(),
                    required: true,
                    options: []
                });
            }
            
            return fields;
        } catch (error) {
            console.warn('Failed to extract fields from response:', error);
            return [];
        }
    }
    
    async acceptSelectedFields() {
        try {
            // Get selected field indices
            const checkboxes = document.querySelectorAll('#field-checkbox-list input[type="checkbox"]:checked');
            const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
            
            if (selectedIndices.length === 0) {
                alert('Please select at least one field to continue.');
                return;
            }
            
            // Get the selected fields
            const allFields = this.currentFields || this.extractFieldsFromLastResponse() || [];
            const selectedFields = selectedIndices.map(index => allFields[index]).filter(field => field);
            
            if (selectedFields.length === 0) {
                this.showError('No valid fields selected. Please try again.');
                return;
            }
            
            // Update current fields with selected ones
            this.currentFields = selectedFields;
            
            // Call the backend to accept the selected fields
            const response = await PMConfig.fetch('api/v4/choice', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'accept_fields',
                    data: { fields: selectedFields }
                })
            });

            if (response.ok) {
                const data = await response.json();
                document.querySelector('.field-recommendation-actions')?.remove();
                this.displayMessage(data.message, 'ai');
                
                // Show field editor with selected fields
                this.showFieldEditor();
            } else {
                throw new Error('Failed to accept selected fields');
            }
            
        } catch (error) {
            console.error('Error accepting selected fields:', error);
            this.showError('Failed to proceed with selected fields. Please try again.');
        }
    }

    async saveAndDeploy() {
        const toolName = document.getElementById('tool-name').value;
        const toolDescription = document.getElementById('tool-description').value;
        const toolSubdomain = document.getElementById('tool-subdomain').value;

        if (!toolName || !toolDescription) {
            this.showError('Please fill in the tool name and description.');
            return;
        }

        try {
            const response = await PMConfig.fetch('api/v4/choice', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    action: 'deploy_tool',
                    data: {
                        name: toolName,
                        description: toolDescription,
                        subdomain: toolSubdomain || toolName.toLowerCase().replace(/\s+/g, '-'),
                        fields: this.currentFields || []
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                document.querySelector('.tool-naming')?.remove();
                
                // Store the deployed tool URL
                this.deployedToolUrl = data.tool_url;
                
                this.displayMessage(data.message, 'ai');
                this.showDeploymentComplete(data.tool_url);
                this.showSuccess(`"${toolName}" deployed successfully!`);
            }
        } catch (error) {
            console.error('Error deploying tool:', error);
            this.showError('Failed to deploy tool. Please try again.');
        }
    }

    showDeploymentComplete(toolUrl) {
        const deploymentHTML = `
            <div class="deployment-complete bg-green-50 p-6 rounded-lg border-2 border-green-200 mb-4">
                <h3 class="text-xl font-semibold text-green-800 mb-4">🚀 Tool Deployed Successfully!</h3>
                <p class="text-green-700 mb-4">Your AI-powered tool is now live and ready for users.</p>
                ${toolUrl ? `<p class="text-sm text-green-600 mb-4"><strong>Live URL:</strong> <a href="${toolUrl}" target="_blank" class="underline">${toolUrl}</a></p>` : ''}
                <div class="flex flex-wrap gap-3">
                    <button onclick="promptEngineerV4.viewLiveTool()" 
                            class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium">
                        👁️ View Live Tool
                    </button>
                    <button onclick="promptEngineerV4.createAnother()" 
                            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
                        🆕 Create Another Tool
                    </button>
                    <button onclick="promptEngineerV4.backToDashboard()" 
                            class="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 font-medium">
                        🏠 Back to Dashboard
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('chat-messages').insertAdjacentHTML('beforeend', deploymentHTML);
    }

    viewLiveTool() {
        if (this.deployedToolUrl) {
            console.log('Opening live tool:', this.deployedToolUrl);
            window.open(this.deployedToolUrl, '_blank');
        } else {
            console.warn('No deployed tool URL available');
            this.showError('Tool URL not available. Please try deploying again.');
        }
    }

    backToDashboard() {
        window.location.href = '/';
    }
}

// Global instance variable
let promptEngineerV4;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!localStorage.getItem('authToken')) {
        window.location.href = '/';
        return;
    }
    
    // Initialize Prompt Engineer v4 and make it globally accessible
    promptEngineerV4 = new PromptEngineerV4();
    window.promptEngineerV4 = promptEngineerV4;
});

// Export for potential external use
window.PromptEngineerV4 = PromptEngineerV4;