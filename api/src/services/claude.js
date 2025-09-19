const axios = require('axios');
const aiConfig = require('./aiConfig');

/**
 * AI Service
 * Handles communication with multiple AI providers (Claude, OpenAI, Google)
 * Uses dynamic AI configuration from database settings
 */
class AIService {
    constructor() {
        // No longer load configuration in constructor - will load dynamically
        this.maxTokens = 1000; // Reasonable limit for MVP
    }

    /**
     * Load AI configuration dynamically from database settings
     * @param {string} userId - User ID to get personalized config for
     */
    async loadConfiguration(userId = null) {
        try {
            const config = await aiConfig.getCurrentConfig(userId);
            
            // Find the active provider and model
            let activeProvider = null;
            let activeModel = null;
            
            for (const [providerId, provider] of Object.entries(config.providers || {})) {
                if (provider.isActive && provider.selectedModel) {
                    activeProvider = providerId;
                    activeModel = provider.selectedModel;
                    break;
                }
            }

            // Fallback to environment if no active provider found in database
            if (!activeProvider) {
                activeProvider = process.env.AI_PROVIDER || 'anthropic';
                activeModel = process.env.AI_MODEL || 'claude-3-5-sonnet-20240620';
                console.warn('⚠️ No active AI provider in database, falling back to environment:', { activeProvider, activeModel });
            }

            this.activeProvider = activeProvider;
            this.activeModel = activeModel;
        
            // Load provider-specific configuration
            if (this.activeProvider === 'anthropic') {
                this.apiKey = process.env.CLAUDE_API_KEY;
                this.apiUrl = 'https://api.anthropic.com/v1/messages';
                this.headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                };
            } else if (this.activeProvider === 'openai') {
                this.apiKey = process.env.OPENAI_API_KEY;
                this.apiUrl = 'https://api.openai.com/v1/chat/completions';
                this.headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                };
            } else if (this.activeProvider === 'google') {
                this.apiKey = process.env.GOOGLE_API_KEY;
                this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
                this.headers = {
                    'Content-Type': 'application/json'
                };
            }

            // Validate configuration
            if (!this.apiKey) {
                throw new Error(`No API key found for ${this.activeProvider}. Please configure it in AI settings.`);
            }

            console.log(`✅ AI Service configured: ${this.activeProvider} (${this.activeModel})`);
            return { provider: this.activeProvider, model: this.activeModel };

        } catch (error) {
            console.error('❌ Failed to load AI configuration:', error.message);
            throw new Error(`AI configuration error: ${error.message}`);
        }
    }

    /**
     * Check if running in demo mode
     */
    isDemoMode() {
        return !this.apiKey || 
               this.apiKey === 'demo-key' ||
               this.apiKey.includes('MUST_ADD_YOUR_KEY');
    }

    /**
     * Simple chat function for prompt building
     * @param {string} message - User message to send to Claude
     * @param {Array} conversationHistory - Previous messages in conversation
     * @returns {Promise<string>} - Claude's response
     */
    async chat(message, conversationHistory = [], userId = null) {
        try {
            // Load configuration dynamically for each request
            await this.loadConfiguration(userId);
            
            if (this.isDemoMode()) {
                // Demo mode fallback for MVP testing
                return this.getDemoResponse(message);
            }

            // Build messages array
            const messages = [
                // Add conversation history
                ...conversationHistory,
                // Add current message
                {
                    role: 'user',
                    content: message
                }
            ];

            // System prompt for prompt building assistance
            const systemPrompt = `You are an expert AI assistant helping users create effective prompts for AI tools. 

Your role is to:
1. Help users design clear, specific prompts for their AI applications
2. Suggest useful input fields for their tools (text inputs, dropdowns, checkboxes, etc.)
3. Provide guidance on prompt structure and best practices
4. Keep responses practical and focused on creating working AI tools

When a user describes their AI tool idea, help them:
- Refine their concept into a clear prompt
- Identify what inputs users should provide
- Structure the prompt for optimal AI performance
- Consider edge cases and user experience

Be concise, practical, and focused on creating deployable AI tools.`;

            console.log(`🤖 Sending request to ${this.activeProvider} API...`);

            let requestData, response;

            if (this.activeProvider === 'anthropic') {
                requestData = {
                    model: this.activeModel,
                    max_tokens: this.maxTokens,
                    system: systemPrompt,
                    messages: messages
                };
                
                response = await axios.post(this.apiUrl, requestData, {
                    headers: this.headers,
                    timeout: 60000  // Increased to 60 seconds for complex requests
                });
                
                if (response.data && response.data.content && response.data.content.length > 0) {
                    const aiResponse = response.data.content[0].text;
                    console.log(`✅ ${this.activeProvider} API response received`);
                    return aiResponse;
                }
                
            } else if (this.activeProvider === 'openai') {
                const messagesWithSystem = [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ];
                
                requestData = {
                    model: this.activeModel,
                    max_tokens: this.maxTokens,
                    messages: messagesWithSystem
                };
                
                response = await axios.post(this.apiUrl, requestData, {
                    headers: this.headers,
                    timeout: 60000  // Increased to 60 seconds for complex requests
                });
                
                if (response.data && response.data.choices && response.data.choices.length > 0) {
                    const aiResponse = response.data.choices[0].message.content;
                    console.log(`✅ ${this.activeProvider} API response received`);
                    return aiResponse;
                }
            }

            throw new Error(`Invalid response format from ${this.activeProvider} API`);

        } catch (error) {
            console.error(`❌ ${this.activeProvider} API Error:`, error.message);
            
            if (error.response) {
                const status = error.response.status;
                const data = error.response.data;
                
                // Handle specific API errors with helpful messages
                if (status === 401 || status === 403) {
                    throw new Error(`❌ Authentication failed with ${this.activeProvider}. Please check your API key in AI Settings. Current model: ${this.activeModel}`);
                } else if (status === 429) {
                    throw new Error(`⏳ Rate limit exceeded for ${this.activeProvider}. Please wait a moment before trying again.`);
                } else if (status === 400) {
                    const errorMsg = data.error?.message || data.message || 'Bad request';
                    if (errorMsg.includes('model') || errorMsg.includes('Model')) {
                        throw new Error(`🤖 Model issue with ${this.activeModel}: ${errorMsg}. Please check your AI Settings and select a valid model.`);
                    }
                    throw new Error(`🔧 Request error: ${errorMsg}. Please check your AI Settings configuration.`);
                } else if (status === 404) {
                    throw new Error(`🤖 Model "${this.activeModel}" not found or not accessible with your ${this.activeProvider} API key. Please check your AI Settings and select a valid model.`);
                } else if (status >= 500) {
                    throw new Error(`🌐 ${this.activeProvider} API is currently unavailable (${status}). Please try again later or switch to a different AI provider in Settings.`);
                }
                
                throw new Error(`${this.activeProvider} API error (${status}): ${data.error?.message || 'Unknown error'}`);
            }
            
            if (error.code === 'ECONNABORTED') {
                throw new Error(`Request timeout. ${this.activeProvider} API took too long to respond.`);
            }
            
            throw new Error(`AI service error: ${error.message}`);
        }
    }

    /**
     * Extract fields from numbered list format (e.g., "1. Radio buttons..." "2. Checkboxes...")
     */
    extractFromNumberedList(response) {
        const fields = [];
        
        // Look for numbered lists with field descriptions
        const numberedPattern = /(?:Key inputs?:?\s*)?((?:\d+\.\s+[^\n]+(?:\n|$))+)/gi;
        let match;
        
        while ((match = numberedPattern.exec(response)) !== null) {
            const listSection = match[1];
            const lines = listSection.split('\n').filter(line => line.trim());
            
            lines.forEach((line, index) => {
                const trimmed = line.trim();
                if (/^\d+\.\s/.test(trimmed)) {
                    const field = this.parseNumberedFieldLine(trimmed, fields.length);
                    if (field) {
                        fields.push(field);
                    }
                }
            });
        }
        
        return fields;
    }
    
    /**
     * Parse individual numbered field line (e.g., "1. Radio buttons to select...")
     */
    parseNumberedFieldLine(line, index) {
        console.log('Parsing numbered field:', line);
        
        const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        const fieldId = `field_${index}`;
        
        // Radio buttons or dropdown patterns
        if (cleanLine.toLowerCase().includes('radio') || cleanLine.toLowerCase().includes('dropdown')) {
            // Extract options if mentioned
            const optionsMatch = cleanLine.match(/"([^"]+)"/g);
            let options = ['Option 1', 'Option 2', 'Option 3']; // Default
            let label = 'Selection';
            
            if (optionsMatch) {
                options = optionsMatch.map(opt => opt.replace(/"/g, ''));
                // Try to extract a label from context
                if (cleanLine.toLowerCase().includes('joke')) {
                    label = 'Joke Type';
                } else if (cleanLine.toLowerCase().includes('style')) {
                    label = 'Style';
                } else if (cleanLine.toLowerCase().includes('category')) {
                    label = 'Category';
                }
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'select',
                label: label,
                required: true,
                options: options
            };
        }
        
        // Checkboxes pattern
        if (cleanLine.toLowerCase().includes('checkbox')) {
            // Extract categories from parentheses like "(child, teen, adult)"
            const categoriesMatch = cleanLine.match(/\(([^)]+)\)/);
            let options = ['Option 1', 'Option 2', 'Option 3'];
            let label = 'Categories';
            
            if (categoriesMatch) {
                options = categoriesMatch[1].split(',').map(opt => opt.trim());
                if (cleanLine.toLowerCase().includes('type')) {
                    label = 'Content Type';
                } else if (cleanLine.toLowerCase().includes('audience')) {
                    label = 'Target Audience';
                }
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'select', // Using select for now since checkboxes are complex
                label: label,
                required: false,
                options: options
            };
        }
        
        // Text input patterns
        if (cleanLine.toLowerCase().includes('text input') || cleanLine.toLowerCase().includes('input field')) {
            let label = 'Input';
            let placeholder = 'Enter value...';
            
            if (cleanLine.toLowerCase().includes('topic')) {
                label = 'Topic';
                placeholder = 'Enter topic (e.g., animals, relationships, work)';
            } else if (cleanLine.toLowerCase().includes('subject')) {
                label = 'Subject';
                placeholder = 'Enter subject...';
            } else if (cleanLine.toLowerCase().includes('theme')) {
                label = 'Theme';
                placeholder = 'Enter theme...';
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'text',
                label: label,
                required: false,
                placeholder: placeholder
            };
        }
        
        // Generic field if we can't parse specifics
        if (cleanLine.length > 10) {
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'text',
                label: cleanLine.slice(0, 30).replace(/[^\w\s]/g, '') || 'Input',
                required: false
            };
        }
        
        return null;
    }

    /**
     * Extract fields from square bracket notation (e.g., [Joke Topic Dropdown: Politics, Celebrities])
     */
    extractFromBracketNotation(response) {
        const fields = [];
        
        // Look for square bracket patterns like [Field Type: option1, option2, option3]
        const bracketPattern = /\[([^\]]+)\]/g;
        let match;
        
        while ((match = bracketPattern.exec(response)) !== null) {
            const bracketContent = match[1].trim();
            const field = this.parseBracketField(bracketContent, fields.length);
            if (field) {
                fields.push(field);
            }
        }
        
        return fields;
    }
    
    /**
     * Parse individual bracket field (e.g., "Joke Topic Dropdown: Politics, Celebrities, Current Events")
     */
    parseBracketField(bracketContent, index) {
        console.log('Parsing bracket field:', bracketContent);
        
        const fieldId = `field_${index}`;
        
        // Split by colon to get field description and options
        const parts = bracketContent.split(':');
        if (parts.length < 2) return null;
        
        const fieldDesc = parts[0].trim();
        const optionsText = parts[1].trim();
        
        // Extract field type and label
        let fieldType = 'text';
        let label = 'Input';
        
        if (fieldDesc.toLowerCase().includes('dropdown') || fieldDesc.toLowerCase().includes('select')) {
            fieldType = 'select';
            // Extract label (everything before the field type)
            label = fieldDesc.replace(/dropdown|select/gi, '').trim();
        } else if (fieldDesc.toLowerCase().includes('checkbox')) {
            fieldType = 'select'; // Using select for now since checkboxes are complex
            label = fieldDesc.replace(/checkbox/gi, '').trim();
        } else if (fieldDesc.toLowerCase().includes('text') || fieldDesc.toLowerCase().includes('input')) {
            fieldType = 'text';
            label = fieldDesc.replace(/text|input/gi, '').trim();
        } else {
            // Try to infer from content
            label = fieldDesc;
        }
        
        // Clean up label
        label = label.replace(/[^\w\s]/g, '').trim() || 'Input';
        
        if (fieldType === 'select') {
            // Parse options from comma-separated list
            const options = optionsText.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
            
            if (options.length === 0) {
                options.push('Option 1', 'Option 2', 'Option 3');
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'select',
                label: label,
                required: true,
                options: options
            };
        } else {
            // Text input
            let placeholder = 'Enter value...';
            
            if (label.toLowerCase().includes('topic')) {
                placeholder = 'Enter topic...';
            } else if (label.toLowerCase().includes('subject')) {
                placeholder = 'Enter subject...';
            } else if (label.toLowerCase().includes('theme')) {
                placeholder = 'Enter theme...';
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'text',
                label: label,
                required: false,
                placeholder: placeholder
            };
        }
    }

    /**
     * Extract fields from markdown format (e.g., **Suggested Fields:** - **Field Name** (type))
     */
    extractFromMarkdownFields(response) {
        const fields = [];
        
        // Look for **Suggested Fields:** section with markdown formatting
        const markdownPattern = /\*\*Suggested Fields?\*\*:?\s*([\s\S]*?)(?=\n\n|\n(?:\*\*[A-Z])|$)/i;
        const match = markdownPattern.exec(response);
        
        if (match) {
            const fieldsSection = match[1];
            console.log('Found markdown fields section:', fieldsSection);
            
            // Parse lines that start with - and contain **Field Name** (type)
            const fieldLines = fieldsSection.split('\n').filter(line => 
                line.trim().startsWith('-') && line.includes('**')
            );
            
            fieldLines.forEach((line, index) => {
                const field = this.parseMarkdownFieldLine(line, index);
                if (field) {
                    fields.push(field);
                }
            });
        }
        
        return fields;
    }
    
    /**
     * Parse individual markdown field line (e.g., "- **Joke Topic** (dropdown): Select your preferred topic")
     */
    parseMarkdownFieldLine(line, index) {
        console.log('Parsing markdown field:', line);
        
        const fieldId = `field_${index}`;
        
        // Extract field name and type from markdown format: - **Field Name** (type): description
        const markdownMatch = line.match(/-\s*\*\*([^*]+)\*\*\s*\(([^)]+)\):\s*(.*)/);
        
        if (!markdownMatch) {
            // Try simpler format: - **Field Name**: description
            const simpleMatch = line.match(/-\s*\*\*([^*]+)\*\*:\s*(.*)/);
            if (simpleMatch) {
                const label = simpleMatch[1].trim();
                return {
                    id: fieldId,
                    name: fieldId.replace('field_', ''),
                    type: 'text',
                    label: label,
                    required: false,
                    placeholder: 'Enter value...'
                };
            }
            return null;
        }
        
        const label = markdownMatch[1].trim();
        const typeStr = markdownMatch[2].trim().toLowerCase();
        const description = markdownMatch[3].trim();
        
        // Determine field type based on type string
        let fieldType = 'text';
        let options = [];
        
        if (typeStr.includes('dropdown') || typeStr.includes('select') || typeStr.includes('choice')) {
            fieldType = 'select';
            
            // Try to extract options from description
            const optionsMatch = description.match(/\(([^)]+)\)/);
            if (optionsMatch) {
                options = optionsMatch[1].split(/[,;]/).map(opt => opt.trim()).filter(opt => opt.length > 0);
            }
            
            // Default options if none found - use generic placeholders
            if (options.length === 0) {
                options = ['Option 1', 'Option 2', 'Option 3'];
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'select',
                label: label,
                required: true,
                options: options
            };
        } else if (typeStr.includes('checkbox') || typeStr.includes('multi')) {
            fieldType = 'select'; // Using select for now since checkboxes are complex
            
            // Extract multiple choice options
            const optionsMatch = description.match(/\(([^)]+)\)/);
            if (optionsMatch) {
                options = optionsMatch[1].split(/[,;]/).map(opt => opt.trim()).filter(opt => opt.length > 0);
            } else {
                options = ['Option 1', 'Option 2', 'Option 3'];
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'select',
                label: label,
                required: false,
                options: options
            };
        } else {
            // Text input
            let placeholder = 'Enter value...';
            
            if (description.includes('example') || description.includes('e.g.')) {
                // Extract placeholder from description
                const exampleMatch = description.match(/(?:example|e\.g\.)[:\s]+([^,.)]+)/i);
                if (exampleMatch) {
                    placeholder = `Enter ${exampleMatch[1].trim()}...`;
                }
            } else if (label.toLowerCase().includes('topic')) {
                placeholder = 'Enter topic...';
            } else if (label.toLowerCase().includes('subject')) {
                placeholder = 'Enter subject...';
            }
            
            return {
                id: fieldId,
                name: fieldId.replace('field_', ''),
                type: 'text',
                label: label,
                required: false,
                placeholder: placeholder
            };
        }
    }

    /**
     * Get suggested form fields based on prompt analysis
     * This is a helper method for the MVP - analyzes Claude's response for field suggestions
     * @param {string} claudeResponse - Claude's response about the AI tool
     * @returns {Array} - Suggested form fields
     */
    extractSuggestedFields(claudeResponse) {
        console.log('📋 Extracting fields from Claude response...');
        const fields = [];
        
        // Enhanced parsing for multiple formats
        let fieldsFound = false;
        
        // Look for numbered lists with field descriptions
        const numberedFields = this.extractFromNumberedList(claudeResponse);
        if (numberedFields.length > 0) {
            fields.push(...numberedFields);
            fieldsFound = true;
        }
        
        // Look for square bracket field patterns [Field Type: options]
        if (!fieldsFound) {
            const bracketFields = this.extractFromBracketNotation(claudeResponse);
            if (bracketFields.length > 0) {
                fields.push(...bracketFields);
                fieldsFound = true;
            }
        }
        
        // Look for markdown format: **Suggested Fields:** with - **Field Name** (type)
        if (!fieldsFound) {
            const markdownFields = this.extractFromMarkdownFields(claudeResponse);
            if (markdownFields.length > 0) {
                fields.push(...markdownFields);
                fieldsFound = true;
            }
        }
        
        // Look for traditional "Suggested Input Fields:" section
        if (!fieldsFound) {
            const suggestedFieldsMatch = claudeResponse.match(/Suggested Input Fields?:?\s*([\s\S]*?)(?=\n\n|\n(?:[A-Z])|$)/i);
            
            if (suggestedFieldsMatch) {
                const fieldsSection = suggestedFieldsMatch[1];
                console.log('Found fields section:', fieldsSection);
                
                // Parse each field line
                const fieldLines = fieldsSection.split('\n').filter(line => line.trim().startsWith('-'));
                
                fieldLines.forEach((line, index) => {
                    const field = this.parseFieldLine(line, index);
                    if (field) {
                        fields.push(field);
                    }
                });
                
                if (fieldLines.length > 0) fieldsFound = true;
            }
        }
        
        // Look for "Input fields:" section
        if (!fieldsFound) {
            const inputFieldsMatch = claudeResponse.match(/Input fields?:?\s*([\s\S]*?)(?=\n\n|\n(?:[A-Z])|$)/i);
            if (inputFieldsMatch) {
                const fieldsSection = inputFieldsMatch[1];
                const fieldLines = fieldsSection.split('\n').filter(line => line.trim().startsWith('-'));
                
                fieldLines.forEach((line, index) => {
                    const field = this.parseFieldLine(line, index);
                    if (field) {
                        fields.push(field);
                    }
                });
                fieldsFound = true;
            }
        }
        
        // Fallback: Look for common field indicators if no structured list found
        if (fields.length === 0) {
            console.log('No structured fields found, using fallback patterns...');
            const universalPatterns = [
                // Universal input patterns that work for any tool type
                { pattern: /topic|subject|theme|about|content/i, name: 'topic', type: 'text', label: 'Topic', placeholder: 'Enter topic...' },
                { pattern: /type|kind|category|style|mode/i, name: 'type', type: 'select', label: 'Type', options: ['Option 1', 'Option 2', 'Option 3'] },
                { pattern: /name|title|label/i, name: 'name', type: 'text', label: 'Name', placeholder: 'Enter name...' },
                { pattern: /description|details|notes/i, name: 'description', type: 'text', label: 'Description', placeholder: 'Enter description...' },
                { pattern: /priority|importance|level/i, name: 'priority', type: 'select', label: 'Priority', options: ['Low', 'Medium', 'High'] },
                { pattern: /time|duration|when|schedule/i, name: 'time', type: 'text', label: 'Time', placeholder: 'Enter time...' }
            ];

            universalPatterns.forEach((pattern, index) => {
                if (pattern.pattern.test(claudeResponse) && fields.length < 3) {
                    fields.push({
                        id: `field_${index}`,
                        name: pattern.name,
                        type: pattern.type,
                        label: pattern.label,
                        required: fields.length === 0, // First field is required
                        options: pattern.options,
                        placeholder: pattern.placeholder
                    });
                }
            });
        }

        // Always include at least one field
        if (fields.length === 0) {
            fields.push({
                id: 'field_0',
                name: 'input',
                type: 'textarea',
                label: 'Your Input',
                required: true
            });
        }

        console.log(`✅ Extracted ${fields.length} fields:`, fields.map(f => f.label));
        return fields.slice(0, 4); // Limit to 4 fields for MVP
    }

    /**
     * Parse individual field line from Claude's response
     */
    parseFieldLine(line, index) {
        console.log('Parsing field line:', line);
        
        // Extract field name and details - handle markdown formatting
        const cleanLine = line.replace(/^-\s*/, '').trim();
        
        // Extract field name from markdown format: **Field Name** (type): description
        const markdownMatch = cleanLine.match(/^\*\*([^*]+)\*\*\s*\(([^)]+)\):\s*(.*)$/);
        if (markdownMatch) {
            const rawLabel = markdownMatch[1].trim();
            const typeHint = markdownMatch[2].toLowerCase().trim();
            const description = markdownMatch[3].trim();
            
            // Clean the label (remove markdown formatting)
            const cleanLabel = rawLabel.replace(/\*\*/g, '');
            const cleanName = this.sanitizeFieldName(cleanLabel);
            
            // Determine field type from type hint
            let fieldType = 'text';
            let options = [];
            let placeholder = description;
            
            if (typeHint.includes('dropdown') || typeHint.includes('select')) {
                fieldType = 'select';
                // Extract options from description
                if (description.includes(',')) {
                    options = description.split(',').map(opt => opt.trim());
                } else {
                    // Default options based on field name
                    options = ['Option 1', 'Option 2', 'Option 3'];
                }
                placeholder = `Select ${cleanLabel.toLowerCase()}...`;
            } else if (typeHint.includes('textarea')) {
                fieldType = 'textarea';
                placeholder = description || `Enter ${cleanLabel.toLowerCase()}...`;
            } else if (typeHint.includes('text')) {
                fieldType = 'text';
                placeholder = description || `Enter ${cleanLabel.toLowerCase()}...`;
            } else if (typeHint.includes('checkbox')) {
                fieldType = 'checkbox';
            }
            
            return {
                id: cleanName,
                name: cleanName,
                type: fieldType,
                label: cleanLabel,
                required: index < 2,
                placeholder: placeholder,
                options: options.length > 0 ? options : undefined
            };
        }
        
        // Fallback: Look for patterns like "Genre (dropdown): Fantasy, Sci-Fi, Mystery"
        const dropdownMatch = cleanLine.match(/^([^(]+)\s*\(dropdown\):\s*(.+)$/i);
        if (dropdownMatch) {
            const rawLabel = dropdownMatch[1].trim();
            const optionsText = dropdownMatch[2].trim();
            const options = optionsText.split(',').map(opt => opt.trim());
            
            const cleanLabel = rawLabel.replace(/\*\*/g, '');
            const cleanName = this.sanitizeFieldName(cleanLabel);
            
            return {
                id: cleanName,
                name: cleanName,
                type: 'select',
                label: cleanLabel,
                required: index < 2,
                options: options
            };
        }
        
        // Look for text fields like "Main Character (text): Description"
        const textMatch = cleanLine.match(/^([^(]+)\s*\(text\):\s*(.*)$/i);
        if (textMatch) {
            const rawLabel = textMatch[1].trim();
            const cleanLabel = rawLabel.replace(/\*\*/g, '');
            const cleanName = this.sanitizeFieldName(cleanLabel);
            
            return {
                id: cleanName,
                name: cleanName,
                type: 'text',
                label: cleanLabel,
                required: index < 2,
                placeholder: `Enter ${cleanLabel.toLowerCase()}...`
            };
        }
        
        // Generic field parsing as fallback
        const genericMatch = cleanLine.match(/^([^:]+)(?::\s*(.*))?$/);
        if (genericMatch) {
            const rawLabel = genericMatch[1].trim();
            const description = genericMatch[2] || '';
            
            const cleanLabel = rawLabel.replace(/\*\*/g, '');
            const cleanName = this.sanitizeFieldName(cleanLabel);
            
            // Determine field type based on content
            let type = 'text';
            let options = null;
            
            if (cleanLabel.toLowerCase().includes('genre') || description.includes(',')) {
                type = 'select';
                if (description.includes(',')) {
                    options = description.split(',').map(opt => opt.trim());
                } else {
                    options = ['Fantasy', 'Sci-Fi', 'Mystery', 'Romance', 'Horror'];
                }
            } else if (cleanLabel.toLowerCase().includes('length')) {
                type = 'select';
                options = ['Short (500 words)', 'Medium (1000 words)', 'Long (2000 words)'];
            }
            
            return {
                id: cleanName,
                name: cleanName,
                type: type,
                label: cleanLabel,
                required: index < 2,
                options: options,
                placeholder: `Enter ${cleanLabel.toLowerCase()}...`
            };
        }
        
        return null;
    }
    
    /**
     * Clean field name to create valid HTML IDs and form names
     */
    sanitizeFieldName(name) {
        if (!name) return 'field';
        
        return name
            .toLowerCase()
            .replace(/\*\*/g, '') // Remove markdown formatting
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters except spaces
            .trim()
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .substring(0, 30) // Limit length
            || 'field';
    }

    /**
     * Demo response for MVP testing when Claude API isn't available
     * @param {string} message - User message
     * @returns {string} - Demo response
     */
    getDemoResponse(message) {
        console.log('🎭 Using demo mode - Claude API not available');
        
        // Check for specific tool types and create tailored responses
        if (message.toLowerCase().includes('sarcastic') && message.toLowerCase().includes('comedian')) {
            return `Perfect! Let's create a sarcastic comedian AI tool. Here's what I recommend:

**System Prompt:**
"You are a witty, sarcastic comedian with perfect timing and razor-sharp observations. Your job is to take any topic and turn it into clever, sarcastic commentary that makes people laugh while making them think. Use dry humor, clever wordplay, and unexpected angles. Keep it playful and entertaining, never mean-spirited."

**Suggested Input Fields:**
- **Topic** (text): What should I roast or comment on?
- **Context** (textarea): Any specific details or background?
- **Style** (dropdown): Dry Wit, Observational, Self-Deprecating, Absurdist
- **Length** (dropdown): Quick Zinger, Short Bit, Full Routine

This will create a hilarious sarcastic comedian that can riff on any topic users throw at it!`;
        }
        
        // Check for different types of tool requests
        if (message.toLowerCase().includes('story') || message.toLowerCase().includes('writing')) {
            return `Great! I can help you create a story writing tool. Here's what I suggest:

**System Prompt:**
"You are a creative writing assistant. Generate engaging stories based on user inputs. Focus on vivid descriptions, compelling characters, and interesting plot developments."

**Suggested Input Fields:**
- **Genre** (dropdown): Fantasy, Sci-Fi, Mystery, Romance, Horror
- **Main Character** (text): Description of the protagonist
- **Setting** (text): Where and when the story takes place
- **Length** (dropdown): Short (500 words), Medium (1000 words), Long (2000 words)

This will create a powerful story generation tool that users can deploy and share!`;
        }
        
        if (message.toLowerCase().includes('email') || message.toLowerCase().includes('marketing')) {
            return `Perfect! Let's build an email marketing tool. Here's my recommendation:

**System Prompt:**
"You are a professional email marketing specialist. Create compelling, conversion-focused emails that engage readers and drive action. Always include clear call-to-actions and maintain a professional tone."

**Suggested Input Fields:**
- **Email Purpose** (dropdown): Newsletter, Promotion, Welcome, Follow-up
- **Target Audience** (text): Description of your audience
- **Key Message** (textarea): Main points to communicate
- **Call to Action** (text): What action should readers take

This will generate professional marketing emails that convert!`;
        }
        
        // Default response - encourage specificity
        return `I'd be happy to help you create an AI tool! To give you the most effective system prompt and input fields, I need a bit more detail.

Could you tell me more about:
- What specific task should your AI tool perform?
- Who are the intended users?
- What kind of output should it generate?

For example, you might say:
- "I want to create a recipe suggestion tool that helps people cook with ingredients they have"
- "I need a writing coach that helps improve business emails"  
- "I want to build a travel planner that creates custom itineraries"

Once you give me more details about your specific tool idea, I can create a tailored **System Prompt** and suggest the perfect **Input Fields** for your users!`;
    }

    /**
     * Generate AI response (alias for chat method for v6 compatibility)
     * @param {string} prompt - The prompt to send to AI
     * @param {string} model - The AI model to use (optional)
     * @returns {Promise<string>} - AI response
     */
    async generateResponse(prompt, model = null) {
        try {
            // Use the existing chat method with empty conversation history
            return await this.chat(prompt, [], null);
        } catch (error) {
            console.error('Error generating AI response:', error);
            throw error;
        }
    }

    /**
     * Health check for Claude API
     * @returns {Promise<boolean>} - Whether Claude API is accessible
     */
    async healthCheck() {
        try {
            if (this.isDemoMode()) {
                // Demo mode is always "healthy"
                return true;
            }

            // Simple test message
            await this.chat('Hello, this is a connection test.');
            return true;
        } catch (error) {
            console.error('AI service health check failed:', error.message);
            return false;
        }
    }

    /**
     * Reload configuration from environment variables
     * Useful after updating AI configuration
     */
    reloadConfiguration() {
        console.log('🔄 Reloading AI configuration...');
        this.loadConfiguration();
    }
}

module.exports = new AIService();