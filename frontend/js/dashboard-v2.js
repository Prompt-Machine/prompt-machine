// Modern Dashboard JavaScript for Prompt Machine v1.0.0-rc
// Mobile-first, professional UI components

class DashboardV2 {
    constructor() {
        this.projectsV6 = [];
        this.stats = {
            totalProjects: 0,
            liveTools: 0,
            totalViews: 0,
            totalRevenue: 0
        };
    }

    // Load V6 projects with modern UI
    async loadProjectsV6() {
        const projectsList = document.getElementById('projectsListV6');
        
        try {
            const response = await PMConfig.fetch('api/v6/projects');

            if (response.ok) {
                const data = await response.json();
                this.projectsV6 = data.projects || [];
                this.renderProjectsV6();
                this.updateStats();
            } else {
                projectsList.innerHTML = this.renderErrorState('Failed to load projects');
            }
        } catch (error) {
            console.error('Load projects error:', error);
            projectsList.innerHTML = this.renderErrorState('Connection error');
        }
    }

    // Render projects with modern cards
    renderProjectsV6() {
        const projectsList = document.getElementById('projectsListV6');
        
        if (this.projectsV6.length === 0) {
            projectsList.innerHTML = this.renderEmptyState();
            return;
        }

        const projectsHTML = this.projectsV6.map(project => this.renderProjectCard(project)).join('');
        projectsList.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                ${projectsHTML}
            </div>
        `;
    }

    // Render individual project card
    renderProjectCard(project) {
        const statusBadge = this.getStatusBadge(project);
        const actionButtons = this.getActionButtons(project);
        
        return `
            <div class="card-hover bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <!-- Card Header -->
                <div class="p-6 pb-4">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex-1 min-w-0">
                            <h4 class="text-lg font-semibold text-gray-900 truncate">
                                ${this.escapeHtml(project.name)}
                            </h4>
                            ${project.description ? `
                                <p class="text-sm text-gray-600 mt-1 line-clamp-2">
                                    ${this.escapeHtml(project.description)}
                                </p>
                            ` : ''}
                        </div>
                        ${statusBadge}
                    </div>
                    
                    <!-- Project URL -->
                    ${project.subdomain ? `
                        <div class="flex items-center text-sm text-blue-600 mb-3 p-2 bg-blue-50 rounded-lg">
                            <i class="fas fa-globe mr-2"></i>
                            <span class="truncate font-medium">${project.subdomain}.tool.prompt-machine.com</span>
                        </div>
                    ` : ''}
                    
                    <!-- Project Meta -->
                    <div class="flex items-center justify-between text-xs text-gray-500">
                        <span class="flex items-center">
                            <i class="far fa-calendar mr-1"></i>
                            ${this.formatDate(project.created_at)}
                        </span>
                        <span class="flex items-center">
                            <i class="fas fa-layer-group mr-1"></i>
                            ${project.step_count || 0} steps
                        </span>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div class="px-6 pb-6">
                    <div class="flex flex-wrap gap-2">
                        ${actionButtons}
                    </div>
                </div>
            </div>
        `;
    }

    // Get status badge for project
    getStatusBadge(project) {
        if (project.deployed && project.enabled !== false) {
            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <span class="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>
                Live
            </span>`;
        } else if (project.deployed && project.enabled === false) {
            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                <span class="w-2 h-2 bg-yellow-400 rounded-full mr-1.5"></span>
                Paused
            </span>`;
        } else {
            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                <span class="w-2 h-2 bg-gray-400 rounded-full mr-1.5"></span>
                Draft
            </span>`;
        }
    }

    // Get action buttons for project
    getActionButtons(project) {
        const buttons = [];

        // Primary action - Edit or View Live
        if (project.deployed && project.subdomain) {
            buttons.push(`
                <button 
                    onclick="window.open('https://${project.subdomain}.tool.prompt-machine.com', '_blank')" 
                    class="flex-1 btn-primary text-center justify-center text-sm py-2"
                >
                    <i class="fas fa-external-link-alt mr-1"></i>
                    View Live
                </button>
            `);
        }

        // Edit button
        buttons.push(`
            <button 
                onclick="dashboard.editProject('${project.id}')" 
                class="flex-1 btn-secondary text-center justify-center text-sm py-2"
            >
                <i class="fas fa-edit mr-1"></i>
                Edit
            </button>
        `);

        // More actions dropdown
        buttons.push(`
            <div class="relative">
                <button 
                    onclick="dashboard.toggleProjectActions('${project.id}')" 
                    class="btn-secondary px-3 py-2 text-sm"
                >
                    <i class="fas fa-ellipsis-h"></i>
                </button>
                <div id="actions-${project.id}" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    ${this.getDropdownActions(project)}
                </div>
            </div>
        `);

        return buttons.join('');
    }

    // Get dropdown actions for project
    getDropdownActions(project) {
        const actions = [];

        // Toggle enabled/disabled
        actions.push(`
            <button 
                onclick="dashboard.toggleProjectEnabled('${project.id}', '${this.escapeHtml(project.name)}', ${project.enabled !== false})" 
                class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
                <i class="fas ${project.enabled !== false ? 'fa-pause' : 'fa-play'} mr-2 w-4"></i>
                ${project.enabled !== false ? 'Pause Tool' : 'Resume Tool'}
            </button>
        `);

        // Toggle advertising
        actions.push(`
            <button 
                onclick="dashboard.toggleProjectAdvertising('${project.id}', '${this.escapeHtml(project.name)}', ${project.advertising_enabled || false})" 
                class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
                <i class="fas fa-dollar-sign mr-2 w-4 ${project.advertising_enabled ? 'text-green-600' : 'text-gray-400'}"></i>
                ${project.advertising_enabled ? 'Disable Ads' : 'Enable Ads'}
            </button>
        `);

        // Upgrade project
        actions.push(`
            <button 
                onclick="dashboard.upgradeProject('${project.id}', '${this.escapeHtml(project.name)}')" 
                class="w-full flex items-center px-4 py-2 text-sm text-purple-700 hover:bg-purple-50 transition-colors"
            >
                <i class="fas fa-arrow-up mr-2 w-4"></i>
                Upgrade
            </button>
        `);

        // Separator
        actions.push(`<div class="border-t border-gray-200 my-1"></div>`);

        // Delete project
        actions.push(`
            <button 
                onclick="dashboard.deleteProject('${project.id}', '${this.escapeHtml(project.name)}')" 
                class="w-full flex items-center px-4 py-2 text-sm text-red-700 hover:bg-red-50 transition-colors"
            >
                <i class="fas fa-trash mr-2 w-4"></i>
                Delete
            </button>
        `);

        return actions.join('');
    }

    // Render empty state
    renderEmptyState() {
        return `
            <div class="text-center py-12">
                <div class="mx-auto h-24 w-24 bg-gradient-to-br from-blue-100 to-purple-100 rounded-3xl flex items-center justify-center mb-6">
                    <i class="fas fa-project-diagram text-3xl text-blue-600"></i>
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">No projects yet</h3>
                <p class="text-gray-600 mb-6 max-w-md mx-auto">
                    Create your first AI-powered multi-step tool to get started. Build custom workflows with our intuitive project builder.
                </p>
                <button onclick="createNewToolV6()" class="btn-primary inline-flex items-center">
                    <i class="fas fa-plus mr-2"></i>
                    Create Your First Project
                </button>
            </div>
        `;
    }

    // Render error state
    renderErrorState(message) {
        return `
            <div class="text-center py-12">
                <div class="mx-auto h-24 w-24 bg-red-100 rounded-3xl flex items-center justify-center mb-6">
                    <i class="fas fa-exclamation-triangle text-3xl text-red-600"></i>
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">Error loading projects</h3>
                <p class="text-gray-600 mb-6">${message}</p>
                <button onclick="dashboard.loadProjectsV6()" class="btn-secondary inline-flex items-center">
                    <i class="fas fa-redo mr-2"></i>
                    Try Again
                </button>
            </div>
        `;
    }

    // Project actions
    editProject(projectId) {
        window.location.href = `/prompt-engineer-v6.html?id=${projectId}`;
    }

    toggleProjectActions(projectId) {
        const dropdown = document.getElementById(`actions-${projectId}`);
        const allDropdowns = document.querySelectorAll('[id^="actions-"]');
        
        // Close all other dropdowns
        allDropdowns.forEach(d => {
            if (d.id !== `actions-${projectId}`) {
                d.classList.add('hidden');
            }
        });
        
        dropdown.classList.toggle('hidden');
    }

    async toggleProjectEnabled(projectId, projectName, currentEnabled) {
        const action = currentEnabled ? 'pause' : 'resume';
        
        if (!confirm(`Are you sure you want to ${action} "${projectName}"?`)) {
            return;
        }

        try {
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}/toggle-enabled`, {
                method: 'PUT'
            });

            if (response.ok) {
                const data = await response.json();
                showToast(data.message, 'success');
                await this.loadProjectsV6();
            } else {
                const data = await response.json();
                showToast(data.error || `Failed to ${action} project`, 'error');
            }
        } catch (error) {
            console.error('Toggle project error:', error);
            showToast(`Error ${action}ing project`, 'error');
        }

        // Close dropdown
        document.getElementById(`actions-${projectId}`).classList.add('hidden');
    }

    async toggleProjectAdvertising(projectId, projectName, currentEnabled) {
        const action = currentEnabled ? 'disable' : 'enable';
        
        if (!confirm(`${action === 'enable' ? 'Enable' : 'Disable'} advertising for "${projectName}"?`)) {
            return;
        }

        try {
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}/advertising`, {
                method: 'PUT',
                body: JSON.stringify({ advertising_enabled: !currentEnabled })
            });

            if (response.ok) {
                const data = await response.json();
                showToast(data.message, 'success');
                await this.loadProjectsV6();
            } else {
                const data = await response.json();
                showToast(data.error || `Failed to ${action} advertising`, 'error');
            }
        } catch (error) {
            console.error('Toggle advertising error:', error);
            showToast(`Error ${action}ing advertising`, 'error');
        }

        // Close dropdown
        document.getElementById(`actions-${projectId}`).classList.add('hidden');
    }

    async upgradeProject(projectId, projectName) {
        // Close dropdown
        document.getElementById(`actions-${projectId}`).classList.add('hidden');
        
        // Show upgrade modal (using existing function from index-v2.html)
        upgradeProject(projectId, projectName);
    }

    async deleteProject(projectId, projectName) {
        if (!confirm(`Are you sure you want to delete "${projectName}"?\n\nThis action cannot be undone and will permanently remove all project data and deployed files.`)) {
            return;
        }

        try {
            const response = await PMConfig.fetch(`api/v6/projects/${projectId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showToast('Project deleted successfully', 'success');
                await this.loadProjectsV6();
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to delete project', 'error');
            }
        } catch (error) {
            console.error('Delete project error:', error);
            showToast('Error deleting project', 'error');
        }

        // Close dropdown
        document.getElementById(`actions-${projectId}`).classList.add('hidden');
    }

    // Update statistics
    updateStats() {
        document.getElementById('totalProjects').textContent = this.projectsV6.length.toString();
        document.getElementById('liveTools').textContent = this.projectsV6.filter(p => p.deployed && p.enabled !== false).length.toString();
        
        // These would come from analytics API in real implementation
        document.getElementById('totalViews').textContent = '0';
        document.getElementById('totalRevenue').textContent = '$0.00';
    }

    // Utility functions
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Initialize dashboard
const dashboard = new DashboardV2();

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.relative')) {
        const allDropdowns = document.querySelectorAll('[id^="actions-"]');
        allDropdowns.forEach(d => d.classList.add('hidden'));
    }
});

// Existing upgrade modal functions (from index-v2.html)
async function upgradeProject(projectId, projectName) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div class="p-6">
                <h3 class="text-xl font-semibold mb-4 text-gray-900">
                    <i class="fas fa-arrow-up text-purple-600 mr-2"></i>
                    Upgrade "${projectName}"
                </h3>
                
                <p class="text-gray-600 mb-6">Choose upgrade type:</p>
                
                <div class="space-y-4 mb-6">
                    <label class="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all">
                        <input type="radio" name="upgradeType" value="frontend-only" checked class="mt-1 text-blue-600">
                        <div class="flex-1">
                            <div class="font-medium text-gray-900">Frontend Only</div>
                            <div class="text-sm text-gray-500 mt-1">Regenerates user interface with latest standards (recommended)</div>
                        </div>
                        <div class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">Safest</div>
                    </label>
                    
                    <label class="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all">
                        <input type="radio" name="upgradeType" value="full" class="mt-1 text-blue-600">
                        <div class="flex-1">
                            <div class="font-medium text-gray-900">Full Upgrade</div>
                            <div class="text-sm text-gray-500 mt-1">Regenerates frontend and updates database schema</div>
                        </div>
                    </label>
                    
                    <label class="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all">
                        <input type="radio" name="upgradeType" value="structure-only" class="mt-1 text-blue-600">
                        <div class="flex-1">
                            <div class="font-medium text-gray-900">Database Only</div>
                            <div class="text-sm text-gray-500 mt-1">Updates database schema only (advanced)</div>
                        </div>
                        <div class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-medium">Advanced</div>
                    </label>
                </div>
                
                <div class="flex space-x-3">
                    <button onclick="this.closest('.fixed').remove()" class="flex-1 btn-secondary justify-center">
                        Cancel
                    </button>
                    <button onclick="performUpgrade('${projectId}', '${projectName}')" class="flex-1 btn-primary justify-center">
                        <i class="fas fa-arrow-up mr-2"></i>
                        Start Upgrade
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function performUpgrade(projectId, projectName) {
    const modal = document.querySelector('.fixed');
    const selectedType = modal.querySelector('input[name="upgradeType"]:checked').value;
    
    // Show loading state
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div class="p-6 text-center">
                <div class="animate-spin rounded-full h-16 w-16 border-4 border-purple-200 border-t-purple-600 mx-auto mb-4"></div>
                <h3 class="text-xl font-semibold mb-2 text-gray-900">Upgrading "${projectName}"</h3>
                <p class="text-gray-600 mb-4">This may take a few moments...</p>
                <div class="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-sm font-medium">
                    ${selectedType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </div>
            </div>
        </div>
    `;

    try {
        const response = await PMConfig.fetch(`api/v6/projects/${projectId}/upgrade`, {
            method: 'POST',
            body: JSON.stringify({ upgradeType: selectedType })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Success
            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl">
                    <div class="p-6 text-center">
                        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-check text-2xl text-green-600"></i>
                        </div>
                        <h3 class="text-xl font-semibold mb-2 text-green-800">Upgrade Complete!</h3>
                        <p class="text-gray-600 mb-4">"${projectName}" has been successfully upgraded.</p>
                        
                        <div class="text-left bg-gray-50 rounded-lg p-4 mb-6">
                            <p class="text-sm font-medium text-gray-700 mb-2">Completed:</p>
                            <ul class="text-sm text-gray-600 space-y-1">
                                ${data.results.completed.map(item => `<li class="flex items-center"><i class="fas fa-check-circle text-green-500 mr-2"></i>${item.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>`).join('')}
                            </ul>
                        </div>
                        
                        <div class="flex space-x-3">
                            ${data.results.deploymentUrl ? `
                                <a href="${data.results.deploymentUrl}" target="_blank" 
                                   class="flex-1 btn-secondary justify-center">
                                    <i class="fas fa-external-link-alt mr-2"></i>
                                    View Tool
                                </a>
                            ` : ''}
                            <button onclick="this.closest('.fixed').remove(); dashboard.loadProjectsV6()" 
                                    class="flex-1 btn-primary justify-center">
                                <i class="fas fa-check mr-2"></i>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
        } else {
            // Error
            modal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl">
                    <div class="p-6 text-center">
                        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-exclamation-triangle text-2xl text-red-600"></i>
                        </div>
                        <h3 class="text-xl font-semibold mb-2 text-red-800">Upgrade Failed</h3>
                        <p class="text-gray-600 mb-4">There was an error upgrading "${projectName}".</p>
                        <div class="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-6">${data.error}</div>
                        
                        <div class="flex space-x-3">
                            <button onclick="this.closest('.fixed').remove()" 
                                    class="flex-1 btn-secondary justify-center">
                                Close
                            </button>
                            <button onclick="performUpgrade('${projectId}', '${projectName}')" 
                                    class="flex-1 btn-primary justify-center">
                                <i class="fas fa-redo mr-2"></i>
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Upgrade error:', error);
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl">
                <div class="p-6 text-center">
                    <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-wifi-slash text-2xl text-red-600"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2 text-red-800">Connection Error</h3>
                    <p class="text-gray-600 mb-6">Unable to connect to upgrade service.</p>
                    
                    <div class="flex space-x-3">
                        <button onclick="this.closest('.fixed').remove()" 
                                class="flex-1 btn-secondary justify-center">
                            Close
                        </button>
                        <button onclick="performUpgrade('${projectId}', '${projectName}')" 
                                class="flex-1 btn-primary justify-center">
                            <i class="fas fa-redo mr-2"></i>
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}