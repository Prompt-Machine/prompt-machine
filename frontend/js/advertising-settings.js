class AdvertisingManager {
    constructor() {
        this.apiBase = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api' 
            : 'https://api.prompt-machine.com/api';
        
        this.token = localStorage.getItem('authToken');
        this.currentToolId = null;
        
        this.init();
    }

    async init() {
        // Check authentication
        if (!this.token) {
            window.location.href = 'index.html';
            return;
        }

        await this.loadUserInfo();
        await this.loadDeployedTools();
        this.setupEventListeners();
    }

    async loadUserInfo() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            document.getElementById('userInfo').textContent = user.email || 'User';
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    async loadDeployedTools() {
        try {
            const response = await fetch(`${this.apiBase}/v3/tools`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error('Failed to load tools');

            const data = await response.json();
            const deployedTools = data.tools.filter(tool => tool.deployed);

            const toolSelect = document.getElementById('toolSelect');
            
            if (deployedTools.length === 0) {
                document.getElementById('noToolsMessage').classList.remove('hidden');
                toolSelect.innerHTML = '<option value="">No deployed tools available</option>';
                return;
            }

            toolSelect.innerHTML = '<option value="">Select a tool...</option>';
            deployedTools.forEach(tool => {
                const option = document.createElement('option');
                option.value = tool.id;
                option.textContent = `${tool.name} (${tool.deployment_url || 'deployed'})`;
                toolSelect.appendChild(option);
            });

        } catch (error) {
            console.error('Error loading tools:', error);
            this.showMessage('Error loading tools. Please refresh the page.', 'error');
        }
    }

    setupEventListeners() {
        // Tool selection
        document.getElementById('toolSelect').addEventListener('change', (e) => {
            if (e.target.value) {
                this.selectTool(e.target.value);
            } else {
                this.hideTool();
            }
        });

        // Provider selection
        document.querySelectorAll('input[name="provider"]').forEach(radio => {
            radio.addEventListener('change', () => this.handleProviderChange());
        });

        // Save button
        document.getElementById('saveButton').addEventListener('click', () => {
            this.saveSettings();
        });

        // Preview button
        document.getElementById('previewButton').addEventListener('click', () => {
            this.previewTool();
        });

        // Remove button
        document.getElementById('removeButton').addEventListener('click', () => {
            this.removeAds();
        });
    }

    async selectTool(toolId) {
        this.currentToolId = toolId;
        document.getElementById('advertisingConfig').classList.remove('hidden');
        
        // Load current advertising settings
        await this.loadSettings(toolId);
        await this.loadStats(toolId);
    }

    hideTool() {
        this.currentToolId = null;
        document.getElementById('advertisingConfig').classList.add('hidden');
    }

    async loadSettings(toolId) {
        try {
            const response = await fetch(`${this.apiBase}/advertising/tool/${toolId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error('Failed to load settings');

            const settings = await response.json();
            
            // Set provider
            document.querySelector(`input[name="provider"][value="${settings.provider || 'none'}"]`).checked = true;
            
            // Set Google Ads settings
            document.getElementById('googleClientId').value = settings.google_ads_client_id || '';
            document.getElementById('googleSlotId').value = settings.google_ads_slot_id || '';
            document.getElementById('showHeaderAd').checked = settings.show_header_ad || false;
            document.getElementById('showFooterAd').checked = settings.show_footer_ad || false;
            document.getElementById('showSidebarAd').checked = settings.show_sidebar_ad || false;

            // Set custom code settings
            document.getElementById('customHeaderCode').value = settings.custom_header_code || '';
            document.getElementById('customBodyCode').value = settings.custom_body_code || '';

            // Set enabled state
            document.getElementById('enableAds').checked = settings.enabled || false;

            // Update provider-specific sections
            this.handleProviderChange();

        } catch (error) {
            console.error('Error loading settings:', error);
            // Use default settings if loading fails
        }
    }

    async loadStats(toolId) {
        try {
            const response = await fetch(`${this.apiBase}/advertising/stats/${toolId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error('Failed to load stats');

            const stats = await response.json();
            
            document.getElementById('impressions').textContent = stats.impressions_tracked.toLocaleString();
            document.getElementById('clicks').textContent = stats.clicks_tracked.toLocaleString();
            
            const ctr = stats.impressions_tracked > 0 
                ? ((stats.clicks_tracked / stats.impressions_tracked) * 100).toFixed(2)
                : '0.00';
            document.getElementById('ctr').textContent = `${ctr}%`;

            document.getElementById('statsLoading').classList.add('hidden');
            document.getElementById('statsContent').classList.remove('hidden');

        } catch (error) {
            console.error('Error loading stats:', error);
            document.getElementById('statsLoading').textContent = 'Unable to load statistics';
        }
    }

    handleProviderChange() {
        const provider = document.querySelector('input[name="provider"]:checked').value;
        
        // Show/hide provider-specific sections
        document.getElementById('googleAdsSettings').classList.toggle('hidden', provider !== 'google-ads');
        document.getElementById('customAdsSettings').classList.toggle('hidden', provider !== 'custom');
    }

    async saveSettings() {
        if (!this.currentToolId) {
            this.showMessage('Please select a tool first', 'error');
            return;
        }

        const provider = document.querySelector('input[name="provider"]:checked').value;
        const settings = {
            provider: provider,
            enabled: document.getElementById('enableAds').checked
        };

        if (provider === 'google-ads') {
            const clientId = document.getElementById('googleClientId').value.trim();
            const slotId = document.getElementById('googleSlotId').value.trim();

            if (!clientId || !clientId.match(/^ca-pub-\d{16}$/)) {
                this.showMessage('Please enter a valid Google AdSense Client ID (ca-pub-xxxxxxxxxxxxxxx)', 'error');
                return;
            }

            if (!slotId) {
                this.showMessage('Please enter a Google AdSense Slot ID', 'error');
                return;
            }

            settings.google_ads_client_id = clientId;
            settings.google_ads_slot_id = slotId;
            settings.show_header_ad = document.getElementById('showHeaderAd').checked;
            settings.show_footer_ad = document.getElementById('showFooterAd').checked;
            settings.show_sidebar_ad = document.getElementById('showSidebarAd').checked;
        }

        if (provider === 'custom') {
            settings.custom_header_code = document.getElementById('customHeaderCode').value;
            settings.custom_body_code = document.getElementById('customBodyCode').value;
        }

        try {
            const response = await fetch(`${this.apiBase}/advertising/tool/${this.currentToolId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save settings');
            }

            const result = await response.json();
            this.showMessage('Advertising settings saved successfully! 🎉', 'success');
            
            // Reload stats after saving
            setTimeout(() => this.loadStats(this.currentToolId), 1000);

        } catch (error) {
            console.error('Error saving settings:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
        }
    }

    previewTool() {
        if (!this.currentToolId) {
            this.showMessage('Please select a tool first', 'error');
            return;
        }

        // Get the tool's URL
        const toolSelect = document.getElementById('toolSelect');
        const selectedOption = toolSelect.options[toolSelect.selectedIndex];
        const toolText = selectedOption.textContent;
        
        // Extract URL from the option text or construct it
        const toolName = toolText.split(' (')[0];
        const subdomain = toolName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const url = `https://${subdomain}.tool.prompt-machine.com`;
        
        window.open(url, '_blank');
    }

    async removeAds() {
        if (!this.currentToolId) {
            this.showMessage('Please select a tool first', 'error');
            return;
        }

        if (!confirm('Are you sure you want to remove all advertising from this tool? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/advertising/tool/${this.currentToolId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error('Failed to remove advertising');

            this.showMessage('Advertising removed successfully! 🗑️', 'success');
            
            // Reset form to defaults
            document.querySelector('input[name="provider"][value="none"]').checked = true;
            this.handleProviderChange();
            
            // Reset stats
            document.getElementById('impressions').textContent = '0';
            document.getElementById('clicks').textContent = '0';
            document.getElementById('ctr').textContent = '0%';

        } catch (error) {
            console.error('Error removing ads:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
        }
    }

    showMessage(message, type = 'info') {
        const messagesContainer = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message fade-in`;
        messageDiv.textContent = message;
        
        messagesContainer.appendChild(messageDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new AdvertisingManager();
});