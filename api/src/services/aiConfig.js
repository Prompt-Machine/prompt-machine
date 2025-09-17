const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const { Pool } = require('pg');

const execAsync = util.promisify(exec);

/**
 * AI Configuration Service
 * Manages multiple AI providers, API keys, and model configurations
 */
class AIConfigService {
    constructor() {
        this.envPath = path.resolve(__dirname, '../../../.env');
        this.lockFilePath = path.resolve(process.cwd(), '.restart-lock');
        this.restartInProgress = false;
        
        // Database connection for AI configuration
        this.pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: { rejectUnauthorized: false }
        });
        this.supportedProviders = {
            anthropic: {
                name: 'Anthropic (Claude)',
                envKey: 'CLAUDE_API_KEY',
                apiUrl: 'https://api.anthropic.com/v1/messages',
                testUrl: 'https://api.anthropic.com/v1/messages',
                headers: {
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01'
                },
                keyFormat: 'sk-ant-api03-*',
                defaultModels: [
                    'claude-3-5-sonnet-20241022',
                    'claude-3-5-sonnet-20240620', 
                    'claude-3-sonnet-20240229',
                    'claude-3-haiku-20240307'
                ]
            },
            openai: {
                name: 'OpenAI',
                envKey: 'OPENAI_API_KEY',
                apiUrl: 'https://api.openai.com/v1/chat/completions',
                testUrl: 'https://api.openai.com/v1/models',
                headers: {
                    'Content-Type': 'application/json'
                },
                keyFormat: 'sk-*',
                defaultModels: [
                    'gpt-4-turbo-preview',
                    'gpt-4',
                    'gpt-3.5-turbo'
                ]
            },
            google: {
                name: 'Google (Gemini)',
                envKey: 'GOOGLE_API_KEY',
                apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
                testUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
                headers: {
                    'Content-Type': 'application/json'
                },
                keyFormat: 'AIza*',
                defaultModels: [
                    'gemini-1.5-pro',
                    'gemini-1.5-flash',
                    'gemini-pro'
                ]
            }
        };
    }

    /**
     * Get AI configuration from database for a specific user
     * @param {string} userId - User ID to get config for
     * @returns {Object} Database AI configuration
     */
    async getDatabaseConfig(userId) {
        try {
            const result = await this.pool.query(
                'SELECT * FROM ai_configurations WHERE user_id = $1 ORDER BY created_at DESC',
                [userId]
            );
            return result.rows;
        } catch (error) {
            console.error('Error fetching database AI config:', error);
            return [];
        }
    }

    /**
     * Save AI configuration to database
     * @param {string} userId - User ID
     * @param {string} providerId - Provider ID
     * @param {string} apiKey - API key
     * @param {string} selectedModel - Selected model
     * @param {Array} availableModels - Available models
     */
    async saveToDatabase(userId, providerId, apiKey, selectedModel, availableModels) {
        try {
            await this.pool.query(`
                INSERT INTO ai_configurations (user_id, provider_name, api_key, is_active, selected_model, available_models)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (user_id, provider_name)
                DO UPDATE SET 
                    api_key = EXCLUDED.api_key,
                    is_active = EXCLUDED.is_active,
                    selected_model = EXCLUDED.selected_model,
                    available_models = EXCLUDED.available_models,
                    updated_at = NOW()
            `, [userId, providerId, apiKey, true, selectedModel, JSON.stringify(availableModels)]);
            
            console.log(`✅ Saved ${providerId} config to database for user ${userId}`);
        } catch (error) {
            console.error('Error saving AI config to database:', error);
        }
    }

    /**
     * Get current AI configuration from database and environment
     * @param {string} userId - Optional user ID for database config
     * @returns {Object} Current AI provider configurations
     */
    async getCurrentConfig(userId = null) {
        try {
            const config = {};

            // Get database configuration - use userId if provided, otherwise get system config
            let dbConfigs = [];
            if (userId) {
                dbConfigs = await this.getDatabaseConfig(userId);
            } else {
                // For system/public use, get the most recent configuration from any user
                try {
                    const result = await this.pool.query(
                        'SELECT * FROM ai_configurations WHERE is_active = true ORDER BY updated_at DESC LIMIT 10'
                    );
                    dbConfigs = result.rows;
                } catch (error) {
                    console.error('Error fetching system AI config:', error);
                }
            }

            // Parse current environment variables and merge with database config
            for (const [providerId, provider] of Object.entries(this.supportedProviders)) {
                // Find database config for this provider
                const dbConfig = dbConfigs.find(cfg => cfg.provider_name === providerId);
                
                // Get API key from database or environment
                let apiKey = null;
                let hasKey = false;
                
                if (dbConfig && dbConfig.api_key) {
                    apiKey = dbConfig.api_key;
                    hasKey = true;
                } else {
                    // Fallback to environment
                    const envContent = await fs.readFile(this.envPath, 'utf8');
                    const envKeyRegex = new RegExp(`^${provider.envKey}=(.*)$`, 'm');
                    const match = envContent.match(envKeyRegex);
                    if (match && match[1] && match[1].trim() !== '') {
                        apiKey = match[1];
                        hasKey = true;
                    }
                }
                
                // If we have a valid API key, try to get live models
                let models = provider.defaultModels;
                let modelsSource = 'default';
                
                if (hasKey && apiKey) {
                    try {
                        console.log(`🔍 Fetching live models for ${provider.name}...`);
                        const testResult = await this.testApiKey(providerId, apiKey);
                        if (testResult.success && testResult.models) {
                            models = testResult.models;
                            modelsSource = 'live';
                            console.log(`✅ Got ${models.length} live models for ${provider.name}`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ Failed to fetch live models for ${provider.name}:`, error.message);
                        // Fall back to database or default models
                        if (dbConfig?.available_models) {
                            models = typeof dbConfig.available_models === 'string' 
                                ? JSON.parse(dbConfig.available_models) 
                                : dbConfig.available_models;
                            modelsSource = 'database';
                        }
                    }
                } else if (dbConfig?.available_models) {
                    models = typeof dbConfig.available_models === 'string' 
                        ? JSON.parse(dbConfig.available_models) 
                        : dbConfig.available_models;
                    modelsSource = 'database';
                }

                config[providerId] = {
                    name: provider.name,
                    envKey: provider.envKey,
                    keyFormat: provider.keyFormat,
                    hasKey: hasKey,
                    keyPreview: apiKey ? this.maskApiKey(apiKey) : null,
                    isActive: dbConfig?.is_active || false,
                    models: models,
                    modelsSource: modelsSource, // Track where models came from
                    selectedModel: dbConfig?.selected_model || null,
                    lastUpdated: dbConfig?.updated_at || null
                };
            }

            // Find the currently active provider and model
            const activeProvider = Object.entries(config).find(([id, cfg]) => cfg.isActive);
            const currentModel = activeProvider ? activeProvider[1].selectedModel : null;
            
            return {
                success: true,
                providers: config,
                currentModel: currentModel,
                activeProvider: activeProvider ? activeProvider[0] : null
            };

        } catch (error) {
            console.error('Error reading AI config:', error);
            return {
                success: false,
                error: 'Failed to read current configuration',
                providers: {}
            };
        }
    }

    /**
     * Test API key for a specific provider
     * @param {string} providerId - Provider identifier
     * @param {string} apiKey - API key to test
     * @returns {Object} Test result with available models
     */
    async testApiKey(providerId, apiKey) {
        const provider = this.supportedProviders[providerId];
        if (!provider) {
            return { success: false, error: 'Unknown provider' };
        }

        try {
            console.log(`🧪 Testing ${provider.name} API key...`);

            let response;
            const headers = {
                ...provider.headers
            };

            // Set authentication header based on provider
            if (providerId === 'anthropic') {
                headers['x-api-key'] = apiKey;
                
                // Try multiple models until one works
                let lastError = null;
                for (const model of provider.defaultModels) {
                    try {
                        console.log(`  Trying model: ${model}`);
                        response = await axios.post(provider.testUrl, {
                            model: model,
                            max_tokens: 5,
                            messages: [{ role: 'user', content: 'Hi' }]
                        }, { headers, timeout: 10000 });
                        
                        console.log(`  ✅ Model ${model} works!`);
                        break; // Success - exit the loop
                        
                    } catch (modelError) {
                        lastError = modelError;
                        console.log(`  ❌ Model ${model} failed: ${modelError.response?.status || 'unknown'}`);
                        continue; // Try next model
                    }
                }
                
                // If no model worked, throw the last error
                if (!response) {
                    throw lastError;
                }

            } else if (providerId === 'openai') {
                headers['Authorization'] = `Bearer ${apiKey}`;
                
                // Test by listing models
                response = await axios.get(provider.testUrl, { 
                    headers, 
                    timeout: 10000 
                });

            } else if (providerId === 'google') {
                // Test by listing models with API key as query param
                response = await axios.get(`${provider.testUrl}?key=${apiKey}`, {
                    timeout: 10000
                });
            }

            // Extract available models based on provider
            let availableModels = [];
            
            if (providerId === 'anthropic') {
                // For Claude, we test each model individually and return working ones
                const workingModels = [];
                const modelsToTest = [
                    'claude-3-5-sonnet-20241022',
                    'claude-3-5-sonnet-20240620',
                    'claude-3-5-haiku-20241022',
                    'claude-3-sonnet-20240229',
                    'claude-3-haiku-20240307',
                    'claude-3-opus-20240229'
                ];
                
                console.log(`  Testing ${modelsToTest.length} Claude models...`);
                for (const model of modelsToTest) {
                    try {
                        const testResponse = await axios.post(provider.testUrl, {
                            model: model,
                            max_tokens: 1,
                            messages: [{ role: 'user', content: 'Hi' }]
                        }, { headers, timeout: 8000 });
                        
                        workingModels.push(model);
                        console.log(`    ✅ ${model} available`);
                    } catch (e) {
                        const status = e.response?.status;
                        if (status === 404) {
                            console.log(`    ❌ ${model} not available (404)`);
                        } else if (status === 400) {
                            // Model exists but request was invalid - still count as available
                            workingModels.push(model);
                            console.log(`    ✅ ${model} available (400 - model exists)`);
                        } else {
                            console.log(`    ❌ ${model} error: ${status || 'unknown'}`);
                        }
                    }
                }
                availableModels = workingModels.length > 0 ? workingModels : provider.defaultModels;
                
            } else if (providerId === 'openai' && response.data && response.data.data) {
                // Get actual available models from OpenAI API
                const allModels = response.data.data;
                const gptModels = allModels
                    .filter(model => 
                        model.id.startsWith('gpt-') && 
                        !model.id.includes('instruct') // Filter out instruct models
                    )
                    .map(model => model.id)
                    .sort((a, b) => {
                        // Prioritize newer models
                        if (a.includes('4') && !b.includes('4')) return -1;
                        if (!a.includes('4') && b.includes('4')) return 1;
                        return a.localeCompare(b);
                    });
                
                availableModels = gptModels.length > 0 ? gptModels : provider.defaultModels;
                console.log(`  Found ${availableModels.length} OpenAI models: ${availableModels.slice(0, 3).join(', ')}${availableModels.length > 3 ? '...' : ''}`);
                
            } else if (providerId === 'google' && response.data && response.data.models) {
                // Get actual available models from Google API
                const allModels = response.data.models;
                const geminiModels = allModels
                    .filter(model => 
                        model.name.includes('gemini') && 
                        model.supportedGenerationMethods?.includes('generateContent')
                    )
                    .map(model => model.name.replace('models/', ''))
                    .sort();
                
                availableModels = geminiModels.length > 0 ? geminiModels : provider.defaultModels;
                console.log(`  Found ${availableModels.length} Google models: ${availableModels.slice(0, 3).join(', ')}${availableModels.length > 3 ? '...' : ''}`);
                
            } else {
                // Fallback to default models if API response parsing fails
                availableModels = provider.defaultModels;
                console.log(`  Using default models for ${provider.name}`);
            }

            console.log(`✅ ${provider.name} API key is valid`);
            return {
                success: true,
                provider: provider.name,
                models: availableModels,
                keyValid: true
            };

        } catch (error) {
            console.error(`❌ ${provider.name} API test failed:`, error.message);
            
            let errorMessage = 'API key test failed';
            if (error.response) {
                const status = error.response.status;
                if (status === 401 || status === 403) {
                    errorMessage = 'Invalid API key';
                } else if (status === 429) {
                    errorMessage = 'Rate limit exceeded';
                } else if (status === 404) {
                    errorMessage = 'API endpoint not found (check model name)';
                }
            }

            return {
                success: false,
                error: errorMessage,
                keyValid: false
            };
        }
    }

    /**
     * Update API key for a provider
     * @param {string} providerId - Provider identifier
     * @param {string} apiKey - New API key
     * @param {string} selectedModel - Selected model for this provider
     * @returns {Object} Update result
     */
    async updateApiKey(providerId, apiKey, selectedModel = null, userId = null) {
        const provider = this.supportedProviders[providerId];
        if (!provider) {
            return { success: false, error: 'Unknown provider' };
        }

        try {
            // First test the API key
            const testResult = await this.testApiKey(providerId, apiKey);
            if (!testResult.success) {
                return testResult;
            }

            // Read current .env file
            let envContent = await fs.readFile(this.envPath, 'utf8');

            // Update or add the API key
            const keyRegex = new RegExp(`^${provider.envKey}=.*$`, 'm');
            const keyLine = `${provider.envKey}=${apiKey}`;

            if (keyRegex.test(envContent)) {
                envContent = envContent.replace(keyRegex, keyLine);
            } else {
                envContent += `\n${keyLine}`;
            }

            // Update the selected model if provided
            if (selectedModel && testResult.models.includes(selectedModel)) {
                const modelRegex = /^AI_MODEL=.*$/m;
                const modelLine = `AI_MODEL=${selectedModel}`;
                
                if (modelRegex.test(envContent)) {
                    envContent = envContent.replace(modelRegex, modelLine);
                } else {
                    envContent += `\nAI_MODEL=${selectedModel}`;
                }

                // Also update provider-specific model env var
                const providerModelKey = `${provider.envKey.replace('_API_KEY', '')}_MODEL`;
                const providerModelRegex = new RegExp(`^${providerModelKey}=.*$`, 'm');
                const providerModelLine = `${providerModelKey}=${selectedModel}`;

                if (providerModelRegex.test(envContent)) {
                    envContent = envContent.replace(providerModelRegex, providerModelLine);
                } else {
                    envContent += `\n${providerModelLine}`;
                }
            }

            // Write back to .env file
            await fs.writeFile(this.envPath, envContent, 'utf8');

            // Save to database if userId provided
            if (userId) {
                await this.saveToDatabase(userId, providerId, apiKey, selectedModel, testResult.models);
            }

            console.log(`✅ Updated ${provider.name} configuration`);
            return {
                success: true,
                provider: provider.name,
                message: 'API key updated successfully',
                models: testResult.models,
                selectedModel: selectedModel
            };

        } catch (error) {
            console.error('Error updating API key:', error);
            return {
                success: false,
                error: 'Failed to update configuration file'
            };
        }
    }

    /**
     * Set active AI provider and model
     * @param {string} providerId - Provider to activate
     * @param {string} model - Model to use
     * @returns {Object} Activation result
     */
    async setActiveProvider(providerId, model) {
        const provider = this.supportedProviders[providerId];
        if (!provider) {
            return { success: false, error: 'Unknown provider' };
        }

        try {
            let envContent = await fs.readFile(this.envPath, 'utf8');

            // Set active model
            const modelRegex = /^AI_MODEL=.*$/m;
            const modelLine = `AI_MODEL=${model}`;
            
            if (modelRegex.test(envContent)) {
                envContent = envContent.replace(modelRegex, modelLine);
            } else {
                envContent += `\nAI_MODEL=${model}`;
            }

            // Set active provider
            const providerRegex = /^AI_PROVIDER=.*$/m;
            const providerLine = `AI_PROVIDER=${providerId}`;
            
            if (providerRegex.test(envContent)) {
                envContent = envContent.replace(providerRegex, providerLine);
            } else {
                envContent += `\nAI_PROVIDER=${providerId}`;
            }

            await fs.writeFile(this.envPath, envContent, 'utf8');

            return {
                success: true,
                message: `Activated ${provider.name} with model ${model}`,
                activeProvider: providerId,
                activeModel: model
            };

        } catch (error) {
            console.error('Error setting active provider:', error);
            return {
                success: false,
                error: 'Failed to update configuration'
            };
        }
    }

    /**
     * Restart API server to pick up environment changes
     * @returns {Object} Restart result
     */
    async restartAPIServer() {
        try {
            // Check if another restart is already in progress using file lock
            if (await this.isRestartLocked()) {
                console.log('⏳ API server restart already in progress (locked), skipping...');
                return {
                    success: true,
                    message: 'API server restart already in progress'
                };
            }

            // Create lock file
            await this.createRestartLock();
            
            console.log('🔄 Restarting API server to apply environment changes...');
            
            // Add a delay to prevent rapid restarts
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Restart PM2 process with updated environment
            const { stdout, stderr } = await execAsync('pm2 restart prompt-machine-api --update-env');
            
            console.log('✅ API server restarted successfully');
            return {
                success: true,
                message: 'API server restarted successfully',
                details: stdout
            };
            
        } catch (error) {
            console.error('❌ Failed to restart API server:', error.message);
            return {
                success: false,
                error: 'Failed to restart API server',
                details: error.message
            };
        } finally {
            // Remove lock file after a delay to allow for the restart to complete
            setTimeout(async () => {
                await this.removeRestartLock();
            }, 8000);
        }
    }

    /**
     * Check if restart is currently locked
     */
    async isRestartLocked() {
        try {
            const stat = await fs.stat(this.lockFilePath);
            const now = Date.now();
            const lockAge = now - stat.mtime.getTime();
            
            // If lock is older than 30 seconds, consider it stale and remove it
            if (lockAge > 30000) {
                console.log('🧹 Removing stale restart lock file');
                await this.removeRestartLock();
                return false;
            }
            
            return true;
        } catch (error) {
            // File doesn't exist, so no lock
            return false;
        }
    }

    /**
     * Create restart lock file
     */
    async createRestartLock() {
        try {
            await fs.writeFile(this.lockFilePath, Date.now().toString(), 'utf8');
        } catch (error) {
            console.warn('⚠️ Failed to create restart lock:', error.message);
        }
    }

    /**
     * Remove restart lock file
     */
    async removeRestartLock() {
        try {
            await fs.unlink(this.lockFilePath);
        } catch (error) {
            // File might not exist, which is fine
        }
    }

    /**
     * Update API key and restart server
     * @param {string} providerId - Provider identifier
     * @param {string} apiKey - New API key
     * @param {string} selectedModel - Selected model for this provider
     * @returns {Object} Update result with restart
     */
    async updateApiKeyAndRestart(providerId, apiKey, selectedModel = null, userId = null) {
        try {
            // First update the API key
            const updateResult = await this.updateApiKey(providerId, apiKey, selectedModel, userId);
            
            if (!updateResult.success) {
                return updateResult;
            }

            // Then restart the API server
            const restartResult = await this.restartAPIServer();
            
            if (!restartResult.success) {
                console.warn('⚠️ API key updated but server restart failed');
                return {
                    success: true,
                    warning: 'API key updated but server restart failed. Please restart manually.',
                    ...updateResult
                };
            }

            // Wait a moment for the server to fully restart
            await new Promise(resolve => setTimeout(resolve, 1000));

            return {
                success: true,
                message: `${updateResult.message} and API server restarted`,
                models: updateResult.models,
                selectedModel: updateResult.selectedModel,
                restarted: true
            };

        } catch (error) {
            console.error('Error updating API key and restarting:', error);
            return {
                success: false,
                error: 'Failed to update configuration and restart server'
            };
        }
    }

    /**
     * Set active provider without restart (faster activation)
     * @param {string} providerId - Provider to activate
     * @param {string} model - Model to use
     * @returns {Object} Activation result
     */
    async setActiveProviderAndRestart(providerId, model) {
        try {
            // Set the active provider in .env file
            const setResult = await this.setActiveProvider(providerId, model);
            
            if (!setResult.success) {
                return setResult;
            }

            // For activation, we don't need to restart the server
            // The environment variables will be read fresh on next request
            console.log('✅ Provider activated without server restart for faster response');

            return {
                success: true,
                message: `Activated ${this.supportedProviders[providerId].name} with model ${model}`,
                activeProvider: setResult.activeProvider,
                activeModel: setResult.activeModel,
                restarted: false
            };

        } catch (error) {
            console.error('Error setting active provider:', error);
            return {
                success: false,
                error: 'Failed to activate provider'
            };
        }
    }

    /**
     * Get supported AI providers
     * @returns {Object} Available providers
     */
    getSupportedProviders() {
        return Object.keys(this.supportedProviders).map(id => ({
            id,
            name: this.supportedProviders[id].name,
            keyFormat: this.supportedProviders[id].keyFormat,
            defaultModels: this.supportedProviders[id].defaultModels
        }));
    }

    /**
     * Mask API key for display
     * @param {string} apiKey - Full API key
     * @returns {string} Masked API key
     */
    maskApiKey(apiKey) {
        if (!apiKey || apiKey.length < 8) return '***';
        return apiKey.substring(0, 8) + '***' + apiKey.substring(apiKey.length - 4);
    }

    /**
     * Remove API key for a provider
     * @param {string} providerId - Provider identifier
     * @returns {Object} Removal result
     */
    async removeApiKey(providerId) {
        const provider = this.supportedProviders[providerId];
        if (!provider) {
            return { success: false, error: 'Unknown provider' };
        }

        try {
            let envContent = await fs.readFile(this.envPath, 'utf8');

            // Remove the API key line
            const keyRegex = new RegExp(`^${provider.envKey}=.*$\\n?`, 'm');
            envContent = envContent.replace(keyRegex, '');

            await fs.writeFile(this.envPath, envContent, 'utf8');

            return {
                success: true,
                message: `Removed ${provider.name} API key`
            };

        } catch (error) {
            console.error('Error removing API key:', error);
            return {
                success: false,
                error: 'Failed to update configuration'
            };
        }
    }
}

module.exports = new AIConfigService();