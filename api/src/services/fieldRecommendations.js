const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

class FieldRecommendationService {
    
    /**
     * Get field recommendations for a specific expert type
     * @param {string} expertType - The type of expert (e.g., 'story_writer', 'business_consultant')
     * @returns {Object} Field recommendations and system prompt template
     */
    async getRecommendationsForExpert(expertType) {
        try {
            const query = `
                SELECT field_suggestions, system_prompt_template 
                FROM field_templates_v5 
                WHERE expert_type = $1
            `;
            
            const result = await pool.query(query, [expertType]);
            
            if (result.rows.length === 0) {
                // Return default generic recommendations if no template exists
                return this.getDefaultRecommendations(expertType);
            }
            
            const template = result.rows[0];
            return {
                expertType: expertType,
                fieldSuggestions: template.field_suggestions,
                systemPromptTemplate: template.system_prompt_template,
                success: true
            };
            
        } catch (error) {
            console.error('Error getting field recommendations:', error);
            throw error;
        }
    }
    
    /**
     * Get all available expert types with their field templates
     * @returns {Array} List of all expert types and their field counts
     */
    async getAllExpertTypes() {
        try {
            const query = `
                SELECT 
                    expert_type,
                    jsonb_array_length(field_suggestions) as field_count,
                    created_at
                FROM field_templates_v5
                ORDER BY expert_type
            `;
            
            const result = await pool.query(query);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting expert types:', error);
            throw error;
        }
    }
    
    /**
     * Create or update field template for an expert type
     * @param {string} expertType - The expert type
     * @param {Array} fieldSuggestions - Array of field configurations
     * @param {string} systemPromptTemplate - System prompt with placeholders
     */
    async saveFieldTemplate(expertType, fieldSuggestions, systemPromptTemplate) {
        try {
            const query = `
                INSERT INTO field_templates_v5 (expert_type, field_suggestions, system_prompt_template)
                VALUES ($1, $2, $3)
                ON CONFLICT (expert_type) 
                DO UPDATE SET 
                    field_suggestions = EXCLUDED.field_suggestions,
                    system_prompt_template = EXCLUDED.system_prompt_template,
                    created_at = NOW()
                RETURNING *
            `;
            
            const result = await pool.query(query, [
                expertType,
                JSON.stringify(fieldSuggestions),
                systemPromptTemplate
            ]);
            
            return result.rows[0];
            
        } catch (error) {
            console.error('Error saving field template:', error);
            throw error;
        }
    }
    
    /**
     * Generate default field recommendations for unknown expert types
     * @param {string} expertType - The expert type
     * @returns {Object} Default field configuration
     */
    getDefaultRecommendations(expertType) {
        return {
            expertType: expertType,
            fieldSuggestions: [
                {
                    field_name: "user_input",
                    field_type: "textarea",
                    field_label: "Your Request",
                    placeholder: `Describe what you'd like the ${expertType} to help you with`,
                    is_required: true,
                    description: `Tell the ${expertType} what you need assistance with`
                },
                {
                    field_name: "additional_details",
                    field_type: "textarea",
                    field_label: "Additional Details",
                    placeholder: "Any additional context or specific requirements",
                    is_required: false,
                    description: "Provide any additional information that might be helpful"
                }
            ],
            systemPromptTemplate: `You are an expert ${expertType}. Help the user with their request: {user_input}. Additional context: {additional_details}. Provide detailed, helpful, and professional assistance.`,
            success: true,
            isDefault: true
        };
    }
    
    /**
     * Process field selections and generate system prompt
     * @param {Array} selectedFields - Fields selected by admin
     * @param {string} basePrompt - Base system prompt template
     * @returns {Object} Processed fields and final prompt
     */
    processSelectedFields(selectedFields, basePrompt) {
        try {
            // Add field_order to selected fields
            const processedFields = selectedFields.map((field, index) => ({
                ...field,
                field_order: index + 1
            }));
            
            // Extract field names for prompt validation
            const fieldNames = processedFields.map(field => field.field_name);
            
            // Validate that all placeholder fields in prompt have corresponding form fields
            const placeholderPattern = /\{(\w+)\}/g;
            const placeholders = [];
            let match;
            
            while ((match = placeholderPattern.exec(basePrompt)) !== null) {
                placeholders.push(match[1]);
            }
            
            const missingFields = placeholders.filter(placeholder => 
                !fieldNames.includes(placeholder)
            );
            
            if (missingFields.length > 0) {
                console.warn('Missing fields for placeholders:', missingFields);
            }
            
            return {
                fields: processedFields,
                systemPrompt: basePrompt,
                placeholders: placeholders,
                missingFields: missingFields,
                success: true
            };
            
        } catch (error) {
            console.error('Error processing selected fields:', error);
            throw error;
        }
    }
}

module.exports = new FieldRecommendationService();