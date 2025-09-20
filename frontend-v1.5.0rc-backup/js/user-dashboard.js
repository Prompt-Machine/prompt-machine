// User Dashboard JavaScript
class UserDashboard {
    constructor() {
        this.user = null;
        this.tools = [];
        this.analytics = {};
        this.init();
    }

    async init() {
        // Check authentication
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        try {
            await this.loadUserData();
            await this.loadUserTools();
            await this.loadUserAnalytics();
            this.updateUI();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            if (error.status === 401) {
                localStorage.removeItem('authToken');
                window.location.href = 'login.html';
            }
        }
    }

    async loadUserData() {
        const response = await this.apiCall('/api/auth/me');
        this.user = response.user;
        
        // Update user name in UI
        document.getElementById('user-name').textContent = 
            `${this.user.firstName || ''} ${this.user.lastName || ''}`.trim() || this.user.email;
    }

    async loadUserTools() {
        try {
            const response = await this.apiCall('/api/projects/user-tools');
            this.tools = response.tools || [];
        } catch (error) {
            console.error('Error loading user tools:', error);
            this.tools = [];
        }
    }

    async loadUserAnalytics() {
        try {
            const response = await this.apiCall('/api/analytics/user-summary');
            this.analytics = response.analytics || {};
        } catch (error) {
            console.error('Error loading user analytics:', error);
            this.analytics = {};
        }
    }

    updateUI() {
        this.updateStats();
        this.updateToolsTable();
    }

    updateStats() {
        const stats = {
            totalTools: this.tools.length,
            deployedTools: this.tools.filter(tool => tool.deployed).length,
            totalViews: this.analytics.totalViews || 0,
            totalCompletions: this.analytics.totalCompletions || 0
        };

        document.getElementById('total-tools').textContent = stats.totalTools;
        document.getElementById('deployed-tools').textContent = stats.deployedTools;
        document.getElementById('total-views').textContent = stats.totalViews;
        document.getElementById('total-completions').textContent = stats.totalCompletions;
    }

    updateToolsTable() {
        const loadingEl = document.getElementById('tools-loading');
        const contentEl = document.getElementById('tools-content');
        const emptyEl = document.getElementById('tools-empty');
        const tableBody = document.getElementById('tools-table-body');

        loadingEl.classList.add('hidden');

        if (this.tools.length === 0) {
            contentEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        contentEl.classList.remove('hidden');

        tableBody.innerHTML = this.tools.map(tool => this.createToolRow(tool)).join('');
    }

    createToolRow(tool) {
        const status = tool.deployed ? 
            '<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Deployed</span>' :
            '<span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">Draft</span>';

        const toolUrl = tool.deployed ? 
            `https://${tool.subdomain}.tool.prompt-machine.com` : null;

        const viewsCount = tool.analytics?.views || 0;
        const completionsCount = tool.analytics?.completions || 0;
        const createdDate = new Date(tool.created_at).toLocaleDateString();

        return `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div>
                            <div class="text-sm font-medium text-gray-900">${this.escapeHtml(tool.name)}</div>
                            ${tool.description ? `<div class="text-sm text-gray-500">${this.escapeHtml(tool.description)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${status}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${viewsCount}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${completionsCount}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${createdDate}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div class="flex space-x-2">
                        ${toolUrl ? `
                            <a href="${toolUrl}" target="_blank" class="text-blue-600 hover:text-blue-900">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        ` : ''}
                        <button onclick="dashboard.editTool('${tool.id}')" class="text-indigo-600 hover:text-indigo-900">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="dashboard.viewToolAnalytics('${tool.id}')" class="text-purple-600 hover:text-purple-900">
                            <i class="fas fa-chart-line"></i>
                        </button>
                        <button onclick="dashboard.deleteTool('${tool.id}')" class="text-red-600 hover:text-red-900">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    async editTool(toolId) {
        // Redirect to tool editor
        window.location.href = `prompt-engineer-v6.html?edit=${toolId}`;
    }

    async viewToolAnalytics(toolId) {
        // Redirect to analytics with tool filter
        window.location.href = `analytics-dashboard.html?project=${toolId}`;
    }

    async deleteTool(toolId) {
        if (!confirm('Are you sure you want to delete this tool? This action cannot be undone.')) {
            return;
        }

        try {
            await this.apiCall(`/api/projects/${toolId}`, {
                method: 'DELETE'
            });

            // Reload tools
            await this.loadUserTools();
            await this.loadUserAnalytics();
            this.updateUI();

            this.showMessage('Tool deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting tool:', error);
            this.showMessage('Error deleting tool', 'error');
        }
    }

    async apiCall(endpoint, options = {}) {
        const token = localStorage.getItem('authToken');
        
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(endpoint, config);
        
        if (!response.ok) {
            const error = new Error(`HTTP error! status: ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return await response.json();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showMessage(message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Profile management functions
function showProfileModal() {
    const modal = document.getElementById('profile-modal');
    
    // Populate form with current user data
    if (dashboard.user) {
        document.getElementById('profile-firstName').value = dashboard.user.firstName || '';
        document.getElementById('profile-lastName').value = dashboard.user.lastName || '';
        document.getElementById('profile-email').value = dashboard.user.email || '';
    }
    
    modal.classList.remove('hidden');
}

function hideProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}

// Handle profile form submission
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        firstName: document.getElementById('profile-firstName').value,
        lastName: document.getElementById('profile-lastName').value
    };

    try {
        await dashboard.apiCall('/api/auth/profile', {
            method: 'PUT',
            body: formData
        });

        // Update local user data
        dashboard.user.firstName = formData.firstName;
        dashboard.user.lastName = formData.lastName;

        // Update UI
        document.getElementById('user-name').textContent = 
            `${formData.firstName} ${formData.lastName}`.trim() || dashboard.user.email;

        hideProfileModal();
        dashboard.showMessage('Profile updated successfully', 'success');
    } catch (error) {
        console.error('Error updating profile:', error);
        dashboard.showMessage('Error updating profile', 'error');
    }
});

// Logout function
function logout() {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
}

// Initialize dashboard
const dashboard = new UserDashboard();