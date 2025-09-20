// ========================================
// CLAUDE SERVICE v2.0.0rc - Enhanced AI Integration
// Advanced AI-Powered Tool Generation Engine
// ========================================

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
    constructor() {
        this.apiKey = process.env.CLAUDE_API_KEY;
        
        if (!this.apiKey) {
            console.error('WARNING: CLAUDE_API_KEY not found in environment variables');
        }
        
        // Initialize Anthropic client
        this.anthropic = new Anthropic({
            apiKey: this.apiKey
        });

        // Model configuration
        this.models = {
            opus: 'claude-3-opus-20240229',
            sonnet: 'claude-3-sonnet-20240229',
            haiku: 'claude-3-haiku-20240307'
        };

        // Default model settings
        this.defaultModel = this.models.opus;
        this.defaultMaxTokens = 2000;
        this.defaultTemperature = 0.3;

        // Rate limiting
        this.requestQueue = [];
        this.processing = false;
        this.requestDelay = 1000; // 1 second between requests
    }

    /**
     * Generate content using Claude API
     */
    async generateContent(prompt, options = {}) {
        const {
            model = this.defaultModel,
            max_tokens = this.defaultMaxTokens,
            temperature = this.defaultTemperature,
            system = null,
            stream = false
        } = options;

        try {
            // Add to queue if rate limiting
            if (this.processing) {
                return this.queueRequest(prompt, options);
            }

            this.processing = true;

            const messages = [
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const requestParams = {
                model,
                max_tokens,
                temperature,
                messages
            };

            if (system) {
                requestParams.system = system;
            }

            const response = await this.anthropic.messages.create(requestParams);

            this.processing = false;
            
            // Process next queued request
            setTimeout(() => this.processQueue(), this.requestDelay);

            return response.content[0].text;

        } catch (error) {
            this.processing = false;
            console.error('Claude API error:', error);
            
            // Fallback to simpler response on error
            if (error.status === 429) {
                // Rate limited - add to queue
                return this.queueRequest(prompt, options);
            }
            
            throw new Error(`AI generation failed: ${error.message}`);
        }
    }

    /**
     * Generate tool structure with advanced AI analysis
     */
    async generateToolStructure(description, context = {}) {
        const systemPrompt = `You are an expert AI tool architect specializing in creating intuitive, professional tools.
Your expertise includes:
- User experience design and information architecture
- Form design and validation patterns
- Assessment methodologies and scoring systems
- Business logic and workflow optimization
- Accessibility and usability best practices

Always respond with valid JSON that can be parsed directly.`;

        const prompt = `Analyze this tool request and create a comprehensive structure:

Tool Description: "${description}"
Context: ${JSON.stringify(context)}

Create a detailed tool structure with:
1. Multiple logical steps that guide users through the process
2. Appropriate fields for each step with proper types and validation
3. Clear labeling and helpful descriptions
4. Weighted calculations if this is an assessment tool
5. Premium field suggestions for advanced features

Response format (JSON):
{
  "toolType": "assessment|creative|utility|business|educational",
  "complexity": 1-5,
  "steps": [
    {
      "name": "step_identifier",
      "title": "Display Title",
      "subtitle": "Brief description",
      "order": 1,
      "required": true,
      "fields": []
    }
  ],
  "fields": [
    {
      "name": "field_identifier",
      "label": "Display Label",
      "type": "text|number|select|multiselect|textarea|date|scale",
      "placeholder": "Placeholder text",
      "description": "Help text",
      "required": boolean,
      "order": 1,
      "weight": 0-100,
      "isPremium": boolean,
      "stepId": "step_identifier",
      "validation": {
        "min": number,
        "max": number,
        "pattern": "regex",
        "customMessage": "Error message"
      },
      "choices": [
        {
          "text": "Display Text",
          "value": "value",
          "weight": 0-100,
          "explanation": "Why this matters"
        }
      ]
    }
  ],
  "calculations": {
    "enabled": boolean,
    "type": "weighted|probability|scoring|decision_tree",
    "baseScore": 50,
    "interpretation": {
      "ranges": [
        {"min": 0, "max": 20, "label": "Very Low"},
        {"min": 21, "max": 40, "label": "Low"},
        {"min": 41, "max": 60, "label": "Moderate"},
        {"min": 61, "max": 80, "label": "High"},
        {"min": 81, "max": 100, "label": "Very High"}
      ]
    }
  },
  "aiConfiguration": {
    "role": "Expert role description",
    "persona": "Detailed persona",
    "systemPrompt": "System instructions for AI responses",
    "responseStyle": "professional|casual|academic|friendly"
  },
  "recommendations": [
    "Specific implementation suggestions",
    "Best practices for this type of tool"
  ]
}

Ensure the structure is logical, user-friendly, and professional.`;

        try {
            const response = await this.generateContent(prompt, {
                system: systemPrompt,
                temperature: 0.3,
                max_tokens: 3000
            });

            // Parse and validate JSON response
            const structure = this.parseJSONResponse(response);
            return this.validateToolStructure(structure);

        } catch (error) {
            console.error('Tool structure generation error:', error);
            // Return a default structure on error
            return this.getDefaultToolStructure(description);
        }
    }

    /**
     * Generate field recommendations based on context
     */
    async generateFieldRecommendations(project, existingFields, count = 5) {
        const prompt = `You are enhancing a ${project.tool_type} tool: "${project.name}"
Current description: ${project.description}
Existing fields: ${existingFields.map(f => f.label).join(', ')}

Generate ${count} additional field recommendations that would improve this tool.
Consider:
- What information is missing that would improve accuracy/usefulness
- Fields that would enhance personalization
- Advanced features for premium users
- Validation and data quality

For each field, provide:
{
  "name": "unique_identifier",
  "label": "Professional Display Label",
  "type": "appropriate_type",
  "description": "Clear help text",
  "placeholder": "Example input",
  "required": boolean,
  "weight": 0-100 (importance),
  "isPremium": boolean (true for advanced),
  "validation": {...},
  "rationale": "Why this field adds value"
}

Return an array of ${count} field objects. Ensure variety in field types and purposes.`;

        try {
            const response = await this.generateContent(prompt, {
                temperature: 0.5,
                max_tokens: 2000
            });

            const recommendations = this.parseJSONResponse(response);
            return Array.isArray(recommendations) ? recommendations : [recommendations];

        } catch (error) {
            console.error('Field recommendation error:', error);
            return this.getDefaultFieldRecommendations(count);
        }
    }

    /**
     * Generate professional report content
     */
    async generateReport(projectConfig, responses, calculationResult) {
        const systemPrompt = `You are ${projectConfig.ai_role}.
${projectConfig.ai_persona_description}
${projectConfig.system_prompt}

Generate professional, actionable reports based on user input.`;

        const prompt = `Based on the following responses and analysis, generate a comprehensive report:

Tool: ${projectConfig.name}
User Responses: ${JSON.stringify(responses)}
Calculation Result: ${JSON.stringify(calculationResult)}

Create a professional report that includes:
1. Executive Summary
2. Detailed Analysis
3. Key Findings
4. Personalized Recommendations
5. Action Items
6. Next Steps

Format the response as clean HTML that can be displayed directly.
Use appropriate headings, lists, and emphasis.
Be specific, actionable, and professional.`;

        try {
            const report = await this.generateContent(prompt, {
                system: systemPrompt,
                temperature: 0.4,
                max_tokens: 2500
            });

            return this.formatReport(report);

        } catch (error) {
            console.error('Report generation error:', error);
            return this.getDefaultReport(calculationResult);
        }
    }

    /**
     * Generate simple content for non-calculation tools
     */
    async generateSimpleContent(projectConfig, responses) {
        const systemPrompt = `You are ${projectConfig.ai_role}.
${projectConfig.ai_persona_description}
${projectConfig.system_prompt}`;

        // Build context from responses
        const context = Object.entries(responses)
            .map(([fieldId, value]) => `${fieldId}: ${value}`)
            .join('\n');

        const prompt = `Based on the following user input, generate appropriate content:

Tool Purpose: ${projectConfig.description}
User Input:
${context}

Generate the requested content in a professional, engaging format.
Be creative, helpful, and aligned with the tool's purpose.`;

        try {
            const content = await this.generateContent(prompt, {
                system: systemPrompt,
                temperature: 0.7,
                max_tokens: 2000
            });

            return {
                content: this.formatContent(content),
                additionalSuggestions: await this.generateSuggestions(projectConfig, responses)
            };

        } catch (error) {
            console.error('Content generation error:', error);
            return {
                content: 'Content generation temporarily unavailable.',
                additionalSuggestions: null
            };
        }
    }

    /**
     * Generate contextual suggestions
     */
    async generateSuggestions(projectConfig, responses) {
        const prompt = `Based on the user's input for "${projectConfig.name}", provide 3-5 helpful suggestions or tips.
Keep them brief, actionable, and relevant.
Format as a bulleted list.`;

        try {
            const suggestions = await this.generateContent(prompt, {
                temperature: 0.5,
                max_tokens: 500
            });

            return suggestions;

        } catch (error) {
            console.error('Suggestion generation error:', error);
            return null;
        }
    }

    /**
     * Validate tool complexity and feasibility
     */
    async validateToolFeasibility(description) {
        const prompt = `Analyze this tool request for feasibility:
"${description}"

Evaluate:
1. Technical feasibility (can it be built as a form-based tool?)
2. Complexity level (1-5 scale)
3. Potential limitations
4. Legal or ethical concerns
5. Recommended approach

Respond with JSON:
{
  "isFeasible": boolean,
  "complexity": 1-5,
  "limitations": ["list of limitations"],
  "concerns": ["list of concerns"],
  "recommendations": ["list of recommendations"],
  "alternativeApproach": "suggestion if not feasible"
}`;

        try {
            const response = await this.generateContent(prompt, {
                temperature: 0.2,
                max_tokens: 1000
            });

            return this.parseJSONResponse(response);

        } catch (error) {
            console.error('Feasibility check error:', error);
            return {
                isFeasible: true,
                complexity: 3,
                limitations: [],
                concerns: [],
                recommendations: ['Proceed with standard implementation']
            };
        }
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Parse JSON response from Claude
     */
    parseJSONResponse(response) {
        try {
            // Clean the response
            let cleaned = response.trim();
            
            // Remove markdown code blocks if present
            cleaned = cleaned.replace(/```json\n?/gi, '');
            cleaned = cleaned.replace(/```\n?/gi, '');
            
            // Remove any leading/trailing text
            const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
                cleaned = jsonMatch[0];
            }
            
            return JSON.parse(cleaned);
            
        } catch (error) {
            console.error('JSON parse error:', error);
            console.error('Original response:', response);
            throw new Error('Failed to parse AI response');
        }
    }

    /**
     * Validate tool structure
     */
    validateToolStructure(structure) {
        // Ensure required fields exist
        if (!structure.steps || !Array.isArray(structure.steps)) {
            structure.steps = [this.getDefaultStep()];
        }
        
        if (!structure.fields || !Array.isArray(structure.fields)) {
            structure.fields = [];
        }
        
        // Validate each step
        structure.steps = structure.steps.map((step, index) => ({
            name: step.name || `step_${index + 1}`,
            title: step.title || `Step ${index + 1}`,
            subtitle: step.subtitle || '',
            order: step.order || index + 1,
            required: step.required !== false,
            fields: step.fields || []
        }));
        
        // Validate each field
        structure.fields = structure.fields.map((field, index) => ({
            name: field.name || `field_${index + 1}`,
            label: field.label || 'Field',
            type: field.type || 'text',
            placeholder: field.placeholder || '',
            description: field.description || field.helpText || '',
            required: field.required || false,
            order: field.order || index + 1,
            weight: field.weight || 0,
            isPremium: field.isPremium || false,
            stepId: field.stepId || structure.steps[0]?.name,
            validation: field.validation || {},
            choices: field.choices || []
        }));
        
        return structure;
    }

    /**
     * Format report HTML
     */
    formatReport(content) {
        // Ensure content is properly formatted HTML
        if (!content.includes('<')) {
            // Convert plain text to HTML
            const lines = content.split('\n');
            let html = '';
            
            lines.forEach(line => {
                if (line.match(/^#+\s/)) {
                    const level = line.match(/^#+/)[0].length;
                    const text = line.replace(/^#+\s/, '');
                    html += `<h${level} class="text-xl font-semibold mb-3">${text}</h${level}>`;
                } else if (line.match(/^\*\s/)) {
                    html += `<li>${line.replace(/^\*\s/, '')}</li>`;
                } else if (line.trim()) {
                    html += `<p class="mb-3">${line}</p>`;
                }
            });
            
            return `<div class="prose max-w-none">${html}</div>`;
        }
        
        return content;
    }

    /**
     * Format general content
     */
    formatContent(content) {
        // Add basic formatting
        return `<div class="generated-content space-y-4">
            ${content.split('\n\n').map(para => 
                `<p class="text-gray-700">${para}</p>`
            ).join('')}
        </div>`;
    }

    /**
     * Queue request for rate limiting
     */
    async queueRequest(prompt, options) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ prompt, options, resolve, reject });
            
            // Process queue if not already processing
            if (!this.processing) {
                setTimeout(() => this.processQueue(), this.requestDelay);
            }
        });
    }

    /**
     * Process queued requests
     */
    async processQueue() {
        if (this.requestQueue.length === 0) {
            return;
        }
        
        const request = this.requestQueue.shift();
        
        try {
            const result = await this.generateContent(request.prompt, request.options);
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        }
    }

    /**
     * Get default tool structure
     */
    getDefaultToolStructure(description) {
        return {
            toolType: 'utility',
            complexity: 2,
            steps: [
                {
                    name: 'main_step',
                    title: 'Information',
                    subtitle: 'Please provide the following information',
                    order: 1,
                    required: true,
                    fields: []
                }
            ],
            fields: [
                {
                    name: 'input_field',
                    label: 'Your Input',
                    type: 'textarea',
                    placeholder: 'Enter your information here',
                    description: 'Provide the details requested',
                    required: true,
                    order: 1,
                    weight: 0,
                    isPremium: false,
                    stepId: 'main_step',
                    validation: {}
                }
            ],
            calculations: {
                enabled: false
            },
            aiConfiguration: {
                role: 'AI Assistant',
                persona: 'Helpful and professional assistant',
                systemPrompt: `You are a helpful assistant for: ${description}`,
                responseStyle: 'professional'
            },
            recommendations: []
        };
    }

    /**
     * Get default step
     */
    getDefaultStep() {
        return {
            name: 'step_1',
            title: 'Basic Information',
            subtitle: 'Let\'s start with some basic details',
            order: 1,
            required: true,
            fields: []
        };
    }

    /**
     * Get default field recommendations
     */
    getDefaultFieldRecommendations(count) {
        const fieldTypes = ['text', 'number', 'select', 'textarea', 'date'];
        const recommendations = [];
        
        for (let i = 0; i < count; i++) {
            recommendations.push({
                name: `additional_field_${i + 1}`,
                label: `Additional Field ${i + 1}`,
                type: fieldTypes[i % fieldTypes.length],
                description: 'Additional information',
                placeholder: 'Enter value',
                required: false,
                weight: 10,
                isPremium: i >= 3,
                validation: {},
                rationale: 'Provides additional context'
            });
        }
        
        return recommendations;
    }

    /**
     * Get default report
     */
    getDefaultReport(calculationResult) {
        return `
            <div class="report">
                <h2 class="text-2xl font-bold mb-4">Analysis Results</h2>
                <div class="mb-6">
                    <p class="text-lg">Score: <strong>${calculationResult.score || 'N/A'}</strong></p>
                    <p class="text-gray-600">${calculationResult.interpretation || 'Analysis complete'}</p>
                </div>
                ${calculationResult.recommendations ? `
                <div>
                    <h3 class="text-xl font-semibold mb-3">Recommendations</h3>
                    <ul class="list-disc list-inside space-y-2">
                        ${calculationResult.recommendations.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>` : ''}
            </div>
        `;
    }
}

module.exports = ClaudeService;
