const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
    user: 'promptmachine_userbeta',
    host: 'sql.prompt-machine.com',
    database: 'promptmachine_dbbeta',
    password: '94oE1q7K',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

/**
 * Tool Generator Service
 * Generates HTML/CSS/JS for deployed AI tools based on prompt configurations
 */
class ToolGenerator {
    constructor() {
        this.toolsDir = path.join(process.cwd(), '../deployed-tools');
    }

    /**
     * Generate complete HTML tool from prompt configuration
     * @param {Object} project - Project details
     * @param {Object} prompt - Prompt configuration with fields
     * @returns {Object} - Generated HTML, CSS, and JS content
     */
    async generateTool(project, prompt) {
        const fields = prompt.fields || [];
        const systemPrompt = prompt.system_prompt || `You are ${project.name}, an AI assistant.`;

        // Generate form HTML
        const formHTML = this.generateFormHTML(fields);
        
        // Generate complete tool HTML with advertising
        const html = await this.generateCompleteHTML(project, systemPrompt, formHTML);
        
        // Generate CSS styles
        const css = this.generateCSS();
        
        // Generate JavaScript functionality
        const js = this.generateJavaScript(project, fields, systemPrompt);

        return {
            html,
            css,
            js,
            fields
        };
    }

    /**
     * Generate form HTML based on field configuration
     * @param {Array} fields - Field definitions from prompt
     * @returns {string} - HTML form elements
     */
    generateFormHTML(fields) {
        if (fields.length === 0) {
            return `
                <div class="field-group">
                    <label for="input">Your Request</label>
                    <textarea id="input" name="input" rows="4" placeholder="Tell me what you need help with..." required></textarea>
                </div>
            `;
        }

        return fields.map(field => {
            const fieldId = this.sanitizeFieldName(field.name);
            const required = field.required ? 'required' : '';
            
            // Clean field label - remove markdown formatting and type hints
            const cleanLabel = (field.label || field.name || 'Field')
                .replace(/\*\*/g, '')  // Remove markdown bold
                .replace(/\s*\([^)]+\)\s*$/g, '')  // Remove (type) hints at end
                .trim();
            
            switch (field.type) {
                case 'text':
                    return `
                        <div class="field-group">
                            <label for="${fieldId}">${cleanLabel}</label>
                            <input type="text" id="${fieldId}" name="${fieldId}" placeholder="${field.placeholder || ''}" ${required}>
                        </div>
                    `;
                
                case 'textarea':
                    return `
                        <div class="field-group">
                            <label for="${fieldId}">${cleanLabel}</label>
                            <textarea id="${fieldId}" name="${fieldId}" rows="4" placeholder="${field.placeholder || ''}" ${required}></textarea>
                        </div>
                    `;
                
                case 'select':
                    const options = (field.options || []).map(option => 
                        `<option value="${option}">${option}</option>`
                    ).join('');
                    
                    return `
                        <div class="field-group">
                            <label for="${fieldId}">${cleanLabel}</label>
                            <select id="${fieldId}" name="${fieldId}" ${required}>
                                <option value="">Choose ${cleanLabel}...</option>
                                ${options}
                            </select>
                        </div>
                    `;
                
                case 'checkbox':
                    return `
                        <div class="field-group checkbox-group">
                            <label>
                                <input type="checkbox" id="${fieldId}" name="${fieldId}" value="yes">
                                ${cleanLabel}
                            </label>
                        </div>
                    `;
                
                default:
                    return `
                        <div class="field-group">
                            <label for="${fieldId}">${cleanLabel}</label>
                            <input type="text" id="${fieldId}" name="${fieldId}" ${required}>
                        </div>
                    `;
            }
        }).join('\n');
    }

    /**
     * Generate rich metadata for SEO and user engagement
     * @param {Object} project - Project details
     * @param {string} systemPrompt - AI system prompt
     * @returns {Object} - Metadata object
     */
    generateToolMetadata(project, systemPrompt) {
        const toolName = project.name;
        const description = project.description || '';
        
        // Generate compelling SEO title
        let title = `${toolName} - Free AI-Powered Tool | Instant Results`;
        if (toolName.toLowerCase().includes('email')) {
            title = `${toolName} - Free AI Email Generator | Create Perfect Emails Instantly`;
        } else if (toolName.toLowerCase().includes('story') || toolName.toLowerCase().includes('writing')) {
            title = `${toolName} - AI Story & Content Generator | Free Creative Writing Tool`;
        } else if (toolName.toLowerCase().includes('marketing')) {
            title = `${toolName} - Free AI Marketing Tool | Boost Your Business`;
        }

        // Generate compelling meta description
        let metaDescription = description || `Use ${toolName} to get instant, professional results with AI. Free to use, no registration required. Create amazing content in seconds with our advanced AI technology.`;
        if (metaDescription.length > 155) {
            metaDescription = metaDescription.slice(0, 152) + '...';
        }

        // Generate intelligent tool-specific headline based on purpose
        const toolPurpose = this.detectToolPurpose(toolName, systemPrompt);
        let headline = this.generateHeadline(toolName, toolPurpose);

        // Generate benefits
        const benefits = this.generateToolBenefits(toolName, systemPrompt);
        
        // Generate use cases
        const useCases = this.generateUseCases(toolName, systemPrompt);

        return {
            title,
            description: metaDescription,
            headline,
            benefits,
            useCases,
            keywords: this.generateKeywords(toolName)
        };
    }

    /**
     * Get tool category for content generation
     */
    getToolCategory(toolName) {
        if (toolName.toLowerCase().includes('email')) return 'Email Communication';
        if (toolName.toLowerCase().includes('story') || toolName.toLowerCase().includes('writing')) return 'Content Creation';
        if (toolName.toLowerCase().includes('marketing')) return 'Marketing Strategy';
        if (toolName.toLowerCase().includes('social')) return 'Social Media';
        return 'Business Process';
    }

    /**
     * Detect the purpose/category of a tool based on its name and system prompt
     */
    detectToolPurpose(toolName, systemPrompt) {
        const combined = `${toolName} ${systemPrompt || ''}`.toLowerCase();
        
        // Detect broad categories based on keywords
        if (combined.match(/todo|task|remind|schedule|plan|organize|calendar|alarm|timer/)) {
            return 'productivity';
        } else if (combined.match(/joke|comedy|funny|humor|sarcastic|wit/)) {
            return 'entertainment';
        } else if (combined.match(/story|write|creative|content|blog|article/)) {
            return 'creative';
        } else if (combined.match(/email|message|communication|letter|business/)) {
            return 'communication';
        } else if (combined.match(/calculate|math|convert|formula|number|finance/)) {
            return 'utility';
        } else if (combined.match(/health|fitness|wellness|medical|nutrition/)) {
            return 'health';
        } else if (combined.match(/learn|teach|education|quiz|study|training/)) {
            return 'educational';
        } else if (combined.match(/game|play|puzzle|quiz|entertainment/)) {
            return 'entertainment';
        } else if (combined.match(/counsel|advice|therapy|relationship|support/)) {
            return 'advisory';
        } else if (combined.match(/analyze|research|data|report|analytics/)) {
            return 'analytical';
        }
        
        return 'general';
    }

    /**
     * Generate appropriate headline based on tool purpose
     */
    generateHeadline(toolName, purpose) {
        switch (purpose) {
            case 'productivity':
                return `Boost Your Productivity with ${toolName}`;
            case 'entertainment':
                return `Get Instant Entertainment with ${toolName}`;
            case 'creative':
                return `Unleash Your Creativity with ${toolName}`;
            case 'communication':
                return `Perfect Communication with ${toolName}`;
            case 'utility':
                return `Quick & Accurate Results with ${toolName}`;
            case 'health':
                return `Improve Your Health with ${toolName}`;
            case 'educational':
                return `Learn Smarter with ${toolName}`;
            case 'advisory':
                return `Get Expert Guidance with ${toolName}`;
            case 'analytical':
                return `Smart Analysis with ${toolName}`;
            default:
                return `${toolName} - Instant AI Results`;
        }
    }

    /**
     * Generate tool benefits based on name and system prompt
     */
    generateToolBenefits(toolName, systemPrompt) {
        const benefits = [
            '🚀 Instant results in seconds',
            '🆓 Completely free to use',
            '🧠 Advanced AI technology',
            '📱 Works on any device'
        ];

        const purpose = this.detectToolPurpose(toolName, systemPrompt);
        
        switch (purpose) {
            case 'productivity':
                benefits.push(
                    '⏰ Save valuable time',
                    '📋 Stay organized',
                    '✅ Never miss important tasks'
                );
                break;
            case 'entertainment':
                benefits.push(
                    '😂 Endless entertainment',
                    '🎭 Perfect for any occasion',
                    '💬 Break the ice anywhere'
                );
                break;
            case 'creative':
                benefits.push(
                    '✍️ Overcome creative blocks',
                    '📚 Unlimited fresh ideas',
                    '🎨 Customizable content'
                );
                break;
            case 'communication':
                benefits.push(
                    '📧 Professional messaging',
                    '🎯 Clear communication',
                    '💼 Business-ready content'
                );
                break;
            case 'utility':
                benefits.push(
                    '🔢 Precise calculations',
                    '📊 Accurate results',
                    '⚡ Lightning-fast processing'
                );
                break;
            case 'health':
                benefits.push(
                    '💪 Improve wellbeing',
                    '📈 Track your progress',
                    '🎯 Personalized guidance'
                );
                break;
            case 'educational':
                benefits.push(
                    '🎓 Learn effectively',
                    '📖 Interactive learning',
                    '🧠 Boost knowledge retention'
                );
                break;
            case 'advisory':
                benefits.push(
                    '💡 Expert guidance',
                    '🤝 Personalized support',
                    '📈 Better decision making'
                );
                break;
            case 'analytical':
                benefits.push(
                    '📊 Deep insights',
                    '🔍 Data-driven results',
                    '📈 Actionable recommendations'
                );
                break;
            default:
                benefits.push(
                    '⚡ Lightning-fast processing',
                    '🎯 Tailored to your needs',
                    '✨ Professional quality results'
                );
        }

        return benefits;
    }

    /**
     * Generate use cases for the tool
     */
    generateUseCases(toolName, systemPrompt) {
        const purpose = this.detectToolPurpose(toolName, systemPrompt || '');
        
        switch (purpose) {
            case 'productivity':
                return [
                    'Daily task management',
                    'Project planning',
                    'Meeting reminders',
                    'Deadline tracking',
                    'Goal setting'
                ];
            case 'entertainment':
                return [
                    'Social events and parties',
                    'Content creation',
                    'Breaking the ice',
                    'Entertainment shows',
                    'Personal enjoyment'
                ];
            case 'creative':
                return [
                    'Creative writing projects',
                    'Blog post content',
                    'Social media stories',
                    'Marketing narratives',
                    'Educational content'
                ];
            case 'communication':
                return [
                    'Professional correspondence',
                    'Customer communications',
                    'Marketing messages',
                    'Internal team updates',
                    'Client follow-ups'
                ];
            case 'utility':
                return [
                    'Quick calculations',
                    'Data conversion',
                    'Problem solving',
                    'Research assistance',
                    'Analysis tasks'
                ];
            case 'health':
                return [
                    'Wellness tracking',
                    'Health planning',
                    'Fitness guidance',
                    'Nutritional advice',
                    'Habit formation'
                ];
            case 'educational':
                return [
                    'Study assistance',
                    'Skill development',
                    'Knowledge testing',
                    'Learning reinforcement',
                    'Training materials'
                ];
            case 'advisory':
                return [
                    'Personal guidance',
                    'Decision support',
                    'Problem resolution',
                    'Relationship advice',
                    'Life coaching'
                ];
            case 'analytical':
                return [
                    'Data analysis',
                    'Research projects',
                    'Report generation',
                    'Trend identification',
                    'Performance evaluation'
                ];
            default:
                return [
                    `${toolName.split(' ')[0]} generation`,
                    'Creative content creation',
                    'Personal projects',
                    'Professional use',
                    'Custom solutions'
                ];
        }
    }

    /**
     * Generate SEO keywords
     */
    generateKeywords(toolName) {
        const baseKeywords = ['AI tool', 'free AI', 'artificial intelligence', 'automation', 'instant results'];
        
        if (toolName.toLowerCase().includes('email')) {
            return [...baseKeywords, 'email generator', 'email marketing', 'email templates', 'business emails'].join(', ');
        } else if (toolName.toLowerCase().includes('story')) {
            return [...baseKeywords, 'story generator', 'creative writing', 'content creation', 'storytelling'].join(', ');
        } else if (toolName.toLowerCase().includes('marketing')) {
            return [...baseKeywords, 'marketing tool', 'content marketing', 'digital marketing', 'campaign creation'].join(', ');
        }
        
        return [...baseKeywords, toolName.toLowerCase().replace(/\s+/g, ' ')].join(', ');
    }

    /**
     * Get advertising settings for a tool
     */
    async getAdvertisingSettings(toolId) {
        try {
            const result = await pool.query(
                'SELECT * FROM tool_advertising WHERE tool_id = $1 AND enabled = true',
                [toolId]
            );
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error fetching advertising settings:', error);
            return null;
        }
    }

    /**
     * Generate advertising code for injection
     */
    generateAdvertisingCode(adSettings) {
        if (!adSettings) {
            return { headerCode: '', bodyCode: '', adPlacements: {} };
        }

        let headerCode = '';
        let bodyCode = '';
        let adPlacements = {
            header: '',
            footer: '',
            sidebar: ''
        };

        // Google Ads integration
        if (adSettings.provider === 'google-ads' && adSettings.google_ads_client_id) {
            headerCode += `
    <!-- Google AdSense -->
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adSettings.google_ads_client_id}"
            crossorigin="anonymous"></script>
    <script>
        (adsbygoogle = window.adsbygoogle || []).push({
            google_ad_client: "${adSettings.google_ads_client_id}",
            enable_page_level_ads: true
        });
    </script>`;

            // Generate ad units for different placements
            if (adSettings.show_header_ad && adSettings.google_ads_slot_id) {
                adPlacements.header = `
    <!-- Header Ad -->
    <div class="text-center py-4 border-b">
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${adSettings.google_ads_client_id}"
             data-ad-slot="${adSettings.google_ads_slot_id}"
             data-ad-format="horizontal"
             data-full-width-responsive="true"></ins>
        <script>
             (adsbygoogle = window.adsbygoogle || []).push({});
        </script>
    </div>`;
            }

            if (adSettings.show_footer_ad && adSettings.google_ads_slot_id) {
                adPlacements.footer = `
    <!-- Footer Ad -->
    <div class="text-center py-4 border-t mt-8">
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${adSettings.google_ads_client_id}"
             data-ad-slot="${adSettings.google_ads_slot_id}"
             data-ad-format="horizontal"
             data-full-width-responsive="true"></ins>
        <script>
             (adsbygoogle = window.adsbygoogle || []).push({});
        </script>
    </div>`;
            }

            if (adSettings.show_sidebar_ad && adSettings.google_ads_slot_id) {
                adPlacements.sidebar = `
    <!-- Sidebar Ad -->
    <div class="text-center p-4">
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${adSettings.google_ads_client_id}"
             data-ad-slot="${adSettings.google_ads_slot_id}"
             data-ad-format="rectangle"
             data-full-width-responsive="true"></ins>
        <script>
             (adsbygoogle = window.adsbygoogle || []).push({});
        </script>
    </div>`;
            }
        }

        // Custom advertising code
        if (adSettings.provider === 'custom') {
            if (adSettings.custom_header_code) {
                headerCode += `\n    <!-- Custom Header Ad Code -->\n    ${adSettings.custom_header_code}`;
            }
            if (adSettings.custom_body_code) {
                bodyCode += `\n    <!-- Custom Body Ad Code -->\n    ${adSettings.custom_body_code}`;
            }
        }

        return { headerCode, bodyCode, adPlacements };
    }

    /**
     * Generate status checking script for tool enable/disable functionality
     * @param {Object} project - Project details
     * @returns {string} - JavaScript code for status checking
     */
    generateStatusCheckScript(project) {
        return `
    <!-- Tool Status Check Script -->
    <script>
        // Check if tool is enabled before allowing access
        (function() {
            'use strict';
            
            // Tool status check configuration
            const TOOL_ID = '${project.id}';
            const SUBDOMAIN = '${project.subdomain}';
            const API_BASE = window.location.protocol + '//' + window.location.hostname.replace('${project.subdomain}.tool.', 'api.');
            
            // Status check function
            async function checkToolStatus() {
                try {
                    // Make request to check tool status
                    const response = await fetch(API_BASE + '/v3/tools/' + TOOL_ID + '/status', {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    const data = await response.json();
                    
                    // If tool is disabled, show maintenance page
                    if (!data.enabled) {
                        showMaintenancePage(data.message || 'This tool is temporarily unavailable.');
                        return false;
                    }
                    
                    return true;
                    
                } catch (error) {
                    console.warn('Tool status check failed:', error);
                    // On error, allow access (graceful degradation)
                    return true;
                }
            }
            
            // Show maintenance page
            function showMaintenancePage(message) {
                document.body.innerHTML = \`
                    <div style="min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <div style="background: white; padding: 3rem; border-radius: 1rem; box-shadow: 0 20px 40px rgba(0,0,0,0.1); 
                                    max-width: 500px; text-align: center; margin: 2rem;">
                            <div style="font-size: 4rem; margin-bottom: 1rem;">🔧</div>
                            <h1 style="font-size: 1.75rem; font-weight: 700; color: #1f2937; margin-bottom: 1rem;">
                                Tool Temporarily Unavailable
                            </h1>
                            <p style="color: #6b7280; margin-bottom: 2rem; line-height: 1.6;">
                                \${message}
                            </p>
                            <div style="background: #f3f4f6; padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 2rem;">
                                <h3 style="font-size: 1rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem;">
                                    Why am I seeing this?
                                </h3>
                                <p style="font-size: 0.875rem; color: #6b7280; margin: 0;">
                                    The tool owner has temporarily disabled public access. This could be for maintenance, updates, or other operational reasons.
                                </p>
                            </div>
                            <div style="padding: 1rem; background: #ecfdf5; border: 1px solid #10b981; border-radius: 0.5rem;">
                                <p style="font-size: 0.875rem; color: #065f46; margin: 0;">
                                    ✓ Check back later - the tool will be available again soon!
                                </p>
                            </div>
                        </div>
                    </div>
                \`;
            }
            
            // Run status check when page loads
            window.addEventListener('DOMContentLoaded', function() {
                checkToolStatus().then(function(isEnabled) {
                    if (isEnabled) {
                        // Tool is enabled, show normal content
                        console.log('✅ Tool is enabled and ready to use');
                    }
                });
            });
            
        })();
    </script>`;
    }

    /**
     * Generate complete HTML document
     * @param {Object} project - Project details
     * @param {string} systemPrompt - AI system prompt
     * @param {string} formHTML - Generated form HTML
     * @returns {string} - Complete HTML document
     */
    async generateCompleteHTML(project, systemPrompt, formHTML) {
        // Generate rich SEO content based on the tool
        const toolMeta = this.generateToolMetadata(project, systemPrompt);
        
        // Get advertising settings and generate ad code
        const adSettings = await this.getAdvertisingSettings(project.id);
        const adCode = this.generateAdvertisingCode(adSettings);
        
        // Generate status checking script
        const statusCheckScript = this.generateStatusCheckScript(project);
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${toolMeta.title}</title>
    <meta name="description" content="${toolMeta.description}">
    <meta name="keywords" content="${toolMeta.keywords}">
    <meta name="author" content="Prompt Machine">
    <meta name="robots" content="index, follow">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="${project.name} - Free AI Tool">
    <meta property="og:description" content="${project.name} - Advanced AI-powered tool for instant results. Free to use, no registration required.">
    <meta property="og:url" content="https://${project.subdomain || project.slug}.tool.prompt-machine.com">
    <meta property="og:site_name" content="Prompt Machine Tools">
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:title" content="${project.name} - Free AI Tool">
    <meta property="twitter:description" content="${project.name} - Advanced AI-powered tool for instant results. Free to use, no registration required.">
    
    <!-- Canonical URL -->
    <link rel="canonical" href="https://${project.subdomain || project.slug}.tool.prompt-machine.com">
    
    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
    
    <link rel="stylesheet" href="style.css">
    
    <!-- Google AdSense (placeholder for future implementation) -->
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
    
    <!-- Tailwind CSS for quick styling -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Enhanced Structured Data for SEO -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "${toolMeta.title}",
        "description": "${toolMeta.description}",
        "url": "https://${project.subdomain || project.slug}.tool.prompt-machine.com",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Browser",
        "keywords": "${toolMeta.keywords}",
        "author": {
            "@type": "Organization",
            "name": "Prompt Machine",
            "url": "https://prompt-machine.com"
        },
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock"
        },
        "featureList": ${JSON.stringify(toolMeta.benefits)},
        "applicationSubCategory": "${this.getToolCategory(project.name)}",
        "browserRequirements": "Requires JavaScript. Works on mobile and desktop.",
        "softwareVersion": "1.0",
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.8",
            "ratingCount": "1247",
            "bestRating": "5",
            "worstRating": "1"
        }
    }
    </script>${adCode.headerCode}
</head>
<body class="bg-gray-50 min-h-screen">${adCode.bodyCode}
${statusCheckScript}
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
        <div class="container mx-auto px-4 py-6">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900">${project.name}</h1>
                    <p class="text-gray-600 mt-1">Powered by AI</p>
                </div>
                <div class="text-sm text-gray-500">
                    Free AI Tool
                </div>
            </div>
        </div>
    </header>${adCode.adPlacements.header || ''}

    <main class="container mx-auto px-4 py-8">
        <div class="max-w-4xl mx-auto">
            <!-- Hero Section -->
            <div class="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-8 mb-8 shadow-xl">
                <div class="text-center">
                    <h1 class="text-4xl md:text-5xl font-bold mb-4">${toolMeta.headline}</h1>
                    <p class="text-xl mb-6 text-blue-100">${toolMeta.description}</p>
                    <div class="flex justify-center items-center space-x-4 text-blue-100">
                        <span class="flex items-center"><svg class="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Free Forever</span>
                        <span class="flex items-center"><svg class="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"></path></svg> No Registration</span>
                        <span class="flex items-center"><svg class="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"></path></svg> Instant Results</span>
                    </div>
                </div>
            </div>

            <!-- Benefits & Features Section -->
            <div class="grid md:grid-cols-2 gap-8 mb-8">
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <span class="text-3xl mr-3">✨</span> Key Benefits
                    </h2>
                    <ul class="space-y-3">
                        ${toolMeta.benefits.map(benefit => `<li class="flex items-center text-gray-700"><span class="text-green-500 mr-2 text-xl">●</span>${benefit}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <span class="text-3xl mr-3">🎯</span> Perfect For
                    </h2>
                    <ul class="space-y-3">
                        ${toolMeta.useCases.map(useCase => `<li class="flex items-center text-gray-700"><span class="text-blue-500 mr-2 text-xl">▸</span>${useCase}</li>`).join('')}
                    </ul>
                </div>
            </div>

            <!-- Instructions Section -->
            <div class="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 mb-8 border border-green-200">
                <div class="text-center">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">🚀 How It Works</h2>
                    <div class="grid md:grid-cols-3 gap-6 mt-6">
                        <div class="text-center">
                            <div class="bg-blue-500 text-white rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold mx-auto mb-3">1</div>
                            <h3 class="font-semibold text-gray-800 mb-2">Enter Details</h3>
                            <p class="text-gray-600 text-sm">Fill out the form with your specific requirements</p>
                        </div>
                        <div class="text-center">
                            <div class="bg-purple-500 text-white rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold mx-auto mb-3">2</div>
                            <h3 class="font-semibold text-gray-800 mb-2">AI Processing</h3>
                            <p class="text-gray-600 text-sm">Our advanced AI analyzes and generates your content</p>
                        </div>
                        <div class="text-center">
                            <div class="bg-green-500 text-white rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold mx-auto mb-3">3</div>
                            <h3 class="font-semibold text-gray-800 mb-2">Get Results</h3>
                            <p class="text-gray-600 text-sm">Copy your professionally crafted content instantly</p>
                        </div>
                    </div>
                    
                    <div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p class="text-amber-800">
                            <span class="font-semibold">💡 Pro Tip:</span> The more specific details you provide, the better your results will be!
                        </p>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Input Form -->
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <h2 class="text-xl font-semibold mb-4 flex items-center">
                        <span class="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold mr-3">1</span>
                        Enter Your Details
                    </h2>
                    
                    <form id="aiForm" class="space-y-4">
                        ${formHTML}
                        
                        <button type="submit" id="generateButton" class="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            Generate Response
                        </button>
                    </form>
                    
                    <div id="errorMessage" class="mt-4 p-4 bg-red-100 text-red-700 rounded hidden"></div>
                    <div id="loadingMessage" class="mt-4 p-4 bg-blue-100 text-blue-700 rounded hidden">
                        <div class="flex items-center">
                            <div class="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mr-3"></div>
                            AI is thinking...
                        </div>
                    </div>
                </div>

                <!-- AI Response -->
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <h2 class="text-xl font-semibold mb-4 flex items-center">
                        <span class="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold mr-3">2</span>
                        AI Generated Result
                    </h2>
                    
                    <div id="responseArea" class="min-h-64 p-4 bg-gray-50 rounded-lg">
                        <div class="text-gray-500 italic text-center py-8">
                            Fill out the form and click "Generate Response" to see AI output here.
                        </div>
                    </div>
                    
                    <div class="mt-4 flex space-x-3">
                        <button id="copyButton" onclick="copyResponse()" class="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 hidden">
                            Copy Response
                        </button>
                        <button id="clearButton" onclick="clearResponse()" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 hidden">
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            <!-- AdSense Ad Placeholder -->
            <div class="mt-8 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <div class="text-gray-500">
                    <p class="font-medium">Advertisement</p>
                    <p class="text-sm mt-1">Google AdSense ads will appear here</p>
                </div>
            </div>
            <!-- FAQ Section -->
            <div class="bg-gray-50 rounded-lg p-8 mt-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">❓ Frequently Asked Questions</h2>
                <div class="grid md:grid-cols-2 gap-6">
                    <div>
                        <h3 class="font-semibold text-gray-800 mb-2">Is this tool really free?</h3>
                        <p class="text-gray-600 text-sm">Yes! ${project.name} is completely free to use with no hidden costs, registration requirements, or usage limits.</p>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-800 mb-2">How does the AI work?</h3>
                        <p class="text-gray-600 text-sm">Our advanced AI analyzes your input and generates high-quality, contextually appropriate content based on your specific requirements.</p>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-800 mb-2">Can I use the generated content commercially?</h3>
                        <p class="text-gray-600 text-sm">Yes, you have full rights to use any content generated by this tool for personal or commercial purposes.</p>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-800 mb-2">How accurate are the results?</h3>
                        <p class="text-gray-600 text-sm">The AI produces high-quality results, but we recommend reviewing and editing the content to match your specific needs and style.</p>
                    </div>
                </div>
            </div>
        </div>
    </main>${adCode.adPlacements.footer || ''}

    <!-- Enhanced Footer -->
    <footer class="bg-gray-800 text-white mt-16">
        <div class="container mx-auto px-4 py-12">
            <div class="grid md:grid-cols-4 gap-8">
                <div>
                    <h3 class="font-bold text-lg mb-4">🤖 ${project.name}</h3>
                    <p class="text-gray-300 text-sm">AI-powered ${this.getToolCategory(project.name).toLowerCase()} tool designed to help you create professional content instantly.</p>
                </div>
                <div>
                    <h4 class="font-semibold mb-4">Features</h4>
                    <ul class="text-gray-300 text-sm space-y-2">
                        <li>• Instant AI generation</li>
                        <li>• No registration required</li>
                        <li>• Mobile-friendly interface</li>
                        <li>• Professional results</li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-semibold mb-4">About</h4>
                    <ul class="text-gray-300 text-sm space-y-2">
                        <li><a href="https://prompt-machine.com" class="hover:text-white">Prompt Machine</a></li>
                        <li><a href="#" class="hover:text-white">Privacy Policy</a></li>
                        <li><a href="#" class="hover:text-white">Terms of Service</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-semibold mb-4">More AI Tools</h4>
                    <p class="text-gray-300 text-sm mb-3">Discover more free AI-powered tools:</p>
                    <a href="https://app.prompt-machine.com" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Browse All Tools</a>
                </div>
            </div>
            
            <div class="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
                <p>© 2025 Prompt Machine. Powered by Advanced AI Technology.</p>
                <p class="mt-1">Free to use • No registration required • Instant results</p>
            </div>
        </div>
    </footer>

    <script src="app.js"></script>
</body>
</html>`;
    }

    /**
     * Generate CSS styles
     * @returns {string} - CSS content
     */
    generateCSS() {
        return `/* AI Tool Custom Styles */
.field-group {
    margin-bottom: 1rem;
}

.field-group label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.5rem;
}

.field-group input,
.field-group textarea,
.field-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 1rem;
    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.field-group input:focus,
.field-group textarea:focus,
.field-group select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.checkbox-group label {
    display: flex;
    align-items: center;
    font-weight: 500;
}

.checkbox-group input[type="checkbox"] {
    width: auto;
    margin-right: 0.5rem;
}

.loading {
    opacity: 0.6;
    pointer-events: none;
}

@media (max-width: 768px) {
    .container {
        padding-left: 1rem;
        padding-right: 1rem;
    }
}`;
    }

    /**
     * Generate JavaScript functionality
     * @param {Array} fields - Form field definitions
     * @param {string} systemPrompt - AI system prompt
     * @returns {string} - JavaScript content
     */
    generateJavaScript(project, fields, systemPrompt) {
        const fieldNames = fields.length > 0 
            ? fields.map(f => `'${this.sanitizeFieldName(f.name)}'`).join(', ')
            : "'input'";

        return `// AI Tool JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('aiForm');
    const generateButton = document.getElementById('generateButton');
    const responseArea = document.getElementById('responseArea');
    const errorMessage = document.getElementById('errorMessage');
    const loadingMessage = document.getElementById('loadingMessage');
    const copyButton = document.getElementById('copyButton');
    const clearButton = document.getElementById('clearButton');

    // Form submission handler
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Get form data
        const formData = new FormData(form);
        const inputs = {};
        
        // Extract field values
        const fieldNames = [${fieldNames}];
        fieldNames.forEach(fieldName => {
            const value = formData.get(fieldName);
            if (value) {
                inputs[fieldName] = value;
            }
        });

        // Validate inputs
        if (Object.keys(inputs).length === 0) {
            showError('Please fill in at least one field.');
            return;
        }

        // Show loading state
        showLoading();

        try {
            // Call the API to generate response
            const response = await fetch('https://api.prompt-machine.com/api/tools/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tool_slug: '${project.subdomain || project.id}',
                    system_prompt: \`${systemPrompt.replace(/`/g, '\\`')}\`,
                    inputs: inputs
                })
            });

            const data = await response.json();

            if (response.ok) {
                showResponse(data.output || data.result || 'AI response generated successfully!');
            } else {
                throw new Error(data.error || 'Failed to generate AI response');
            }

        } catch (error) {
            console.error('AI Generation Error:', error);
            showError('Sorry, the AI is currently unavailable. Please try again later.');
        } finally {
            hideLoading();
        }
    });

    // Show loading state
    function showLoading() {
        generateButton.disabled = true;
        generateButton.textContent = 'Generating...';
        loadingMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        document.body.classList.add('loading');
    }

    // Hide loading state
    function hideLoading() {
        generateButton.disabled = false;
        generateButton.textContent = 'Generate Response';
        loadingMessage.classList.add('hidden');
        document.body.classList.remove('loading');
    }

    // Show AI response
    function showResponse(responseText) {
        responseArea.innerHTML = \`
            <div class="prose prose-sm max-w-none">
                <div class="whitespace-pre-wrap">\${escapeHtml(responseText)}</div>
            </div>
        \`;
        
        copyButton.classList.remove('hidden');
        clearButton.classList.remove('hidden');
        
        // Track usage
        trackUsage();
    }

    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    // Track tool usage
    function trackUsage() {
        // Simple usage tracking for MVP
        fetch('https://api.prompt-machine.com/api/tools/track-usage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tool_slug: '${project.subdomain || project.id}',
                timestamp: new Date().toISOString()
            })
        }).catch(err => {
            console.log('Usage tracking failed:', err.message);
        });
    }

    // Escape HTML for safe display
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

// Copy response to clipboard
function copyResponse() {
    const responseArea = document.getElementById('responseArea');
    const text = responseArea.textContent.trim();
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showTemporaryMessage('Response copied to clipboard!');
        }).catch(err => {
            console.error('Copy failed:', err);
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showTemporaryMessage('Response copied to clipboard!');
        } catch (err) {
            console.error('Copy failed:', err);
        }
        document.body.removeChild(textArea);
    }
}

// Clear response
function clearResponse() {
    const responseArea = document.getElementById('responseArea');
    responseArea.innerHTML = \`
        <div class="text-gray-500 italic text-center py-8">
            Fill out the form and click "Generate Response" to see AI output here.
        </div>
    \`;
    
    document.getElementById('copyButton').classList.add('hidden');
    document.getElementById('clearButton').classList.add('hidden');
}

// Show temporary message
function showTemporaryMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50';
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        document.body.removeChild(messageDiv);
    }, 3000);
}`;
    }

    /**
     * Save generated tool to file system
     * @param {string} projectSlug - URL-friendly project identifier
     * @param {Object} toolContent - Generated HTML, CSS, JS content
     * @returns {string} - Path to saved tool
     */
    async saveToolToFiles(projectSlug, toolContent) {
        const toolPath = path.join(this.toolsDir, projectSlug);
        
        try {
            // Create tool directory
            await fs.mkdir(toolPath, { recursive: true });
            
            // Save HTML file
            await fs.writeFile(
                path.join(toolPath, 'index.html'), 
                toolContent.html, 
                'utf8'
            );
            
            // Save CSS file
            await fs.writeFile(
                path.join(toolPath, 'style.css'), 
                toolContent.css, 
                'utf8'
            );
            
            // Save JavaScript file
            await fs.writeFile(
                path.join(toolPath, 'app.js'), 
                toolContent.js, 
                'utf8'
            );
            
            console.log(`✅ Tool saved to: ${toolPath}`);
            return toolPath;
            
        } catch (error) {
            console.error('Error saving tool files:', error);
            throw new Error(`Failed to save tool files: ${error.message}`);
        }
    }

    /**
     * Sanitize field name for use in HTML/JS
     * @param {string} fieldName - Raw field name
     * @returns {string} - Sanitized field name
     */
    sanitizeFieldName(fieldName) {
        return fieldName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }
}

module.exports = new ToolGenerator();