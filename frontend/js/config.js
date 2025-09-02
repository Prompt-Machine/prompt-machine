/**
 * Dynamic Configuration for Prompt Machine
 * Automatically detects environment and sets appropriate API URLs
 */

(function() {
    'use strict';
    
    // Get current hostname and determine environment
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    
    // Configuration object
    const config = {
        // Environment detection
        environment: 'production', // Will be set dynamically
        
        // API Configuration
        api: {
            baseUrl: '',
            timeout: 30000
        },
        
        // App Configuration  
        app: {
            baseUrl: '',
            name: 'Prompt Machine'
        }
    };
    
    // Environment-specific configuration
    function detectEnvironment() {
        // Local development
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
            config.environment = 'development';
            config.api.baseUrl = port ? `${protocol}//${hostname}:3001` : `${protocol}//${hostname}:3001`;
            config.app.baseUrl = `${protocol}//${hostname}${port ? ':' + port : ''}`;
            return;
        }
        
        // Staging environment
        if (hostname.includes('staging') || hostname.includes('dev')) {
            config.environment = 'staging';
            config.api.baseUrl = hostname.replace('app.', 'api.');
            config.app.baseUrl = `${protocol}//${hostname}`;
            return;
        }
        
        // Production environment - detect based on current domain
        config.environment = 'production';
        
        // If we're on app.domain.com, API should be api.domain.com
        if (hostname.startsWith('app.')) {
            config.api.baseUrl = `${protocol}//${hostname.replace('app.', 'api.')}`;
        } 
        // If we're on a custom domain, assume API is at api subdomain
        else if (hostname.includes('.')) {
            const domainParts = hostname.split('.');
            if (domainParts.length >= 2) {
                // For domain.com -> api.domain.com
                config.api.baseUrl = `${protocol}//api.${domainParts.slice(-2).join('.')}`;
            } else {
                // Fallback to same domain with /api path
                config.api.baseUrl = `${protocol}//${hostname}/api`;
            }
        }
        // Single domain (like localhost) - use /api path
        else {
            config.api.baseUrl = `${protocol}//${hostname}/api`;
        }
        
        config.app.baseUrl = `${protocol}//${hostname}`;
    }
    
    // Initialize configuration
    detectEnvironment();
    
    // Helper functions
    const PromptMachineConfig = {
        // Get API URL
        apiUrl: function(endpoint = '') {
            const baseUrl = config.api.baseUrl.replace(/\/$/, ''); // Remove trailing slash
            const cleanEndpoint = endpoint.replace(/^\//, ''); // Remove leading slash
            return cleanEndpoint ? `${baseUrl}/${cleanEndpoint}` : baseUrl;
        },
        
        // Get App URL
        appUrl: function(path = '') {
            const baseUrl = config.app.baseUrl.replace(/\/$/, ''); // Remove trailing slash
            const cleanPath = path.replace(/^\//, ''); // Remove leading slash
            return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl;
        },
        
        // Get environment
        getEnvironment: function() {
            return config.environment;
        },
        
        // Get full config
        getConfig: function() {
            return { ...config };
        },
        
        // API fetch helper with automatic URL construction
        fetch: function(endpoint, options = {}) {
            const url = this.apiUrl(endpoint);
            
            // Add default headers
            const defaultHeaders = {
                'Content-Type': 'application/json'
            };
            
            // Add auth token if available
            const token = localStorage.getItem('authToken');
            if (token) {
                defaultHeaders['Authorization'] = `Bearer ${token}`;
            }
            
            // Merge options
            const fetchOptions = {
                ...options,
                headers: {
                    ...defaultHeaders,
                    ...(options.headers || {})
                }
            };
            
            return fetch(url, fetchOptions);
        },
        
        // Log configuration (for debugging)
        debug: function() {
            console.group('🔧 Prompt Machine Configuration');
            console.log('Environment:', config.environment);
            console.log('Current URL:', window.location.href);
            console.log('API Base URL:', config.api.baseUrl);
            console.log('App Base URL:', config.app.baseUrl);
            console.log('Sample API call:', this.apiUrl('api/test'));
            console.groupEnd();
        }
    };
    
    // Make configuration globally available
    window.PromptMachineConfig = PromptMachineConfig;
    window.PMConfig = PromptMachineConfig; // Shorter alias
    
    // Auto-debug in development
    if (config.environment === 'development') {
        PromptMachineConfig.debug();
    }
    
})();