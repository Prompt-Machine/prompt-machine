// Advanced Admin Dashboard JavaScript
class AdvancedAdminDashboard {
    constructor() {
        this.currentTab = 'overview';
        this.users = [];
        this.roles = [];
        this.analytics = {};
        this.charts = {};
        this.usersTable = null;
        
        this.init();
    }

    async init() {
        // Check authentication and permissions
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        try {
            await this.loadUserData();
            await this.checkAdminPermissions();
            await this.loadOverviewData();
            this.initializeTabs();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            if (error.status === 401 || error.status === 403) {
                this.showError('Access denied. Administrator privileges required.');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 3000);
            }
        }
    }

    async loadUserData() {
        const response = await this.apiCall('/api/auth/me');
        
        // Update admin name in UI
        const adminName = `${response.user.firstName || ''} ${response.user.lastName || ''}`.trim() || response.user.email;
        document.getElementById('admin-name').textContent = adminName;
    }

    async checkAdminPermissions() {
        // Try to access admin endpoint to verify permissions
        await this.apiCall('/api/admin/roles');
    }

    async loadOverviewData() {
        try {
            // Load user analytics
            const analyticsResponse = await this.apiCall('/api/admin/analytics/users?days=30');
            this.analytics = analyticsResponse.analytics;

            // Update overview stats
            this.updateOverviewStats();
            this.createCharts();
            
        } catch (error) {
            console.error('Error loading overview data:', error);
        }
    }

    updateOverviewStats() {
        const statusBreakdown = this.analytics.status_breakdown || [];
        
        const totalUsers = statusBreakdown.reduce((sum, item) => sum + parseInt(item.count), 0);
        const activeUsers = statusBreakdown.find(item => item.account_status === 'active')?.count || 0;
        const suspendedUsers = statusBreakdown.find(item => item.account_status === 'suspended')?.count || 0;
        
        // Calculate new users today (simplified - would need more data)
        const newUsersToday = Math.floor(totalUsers * 0.01); // Placeholder calculation

        document.getElementById('total-users').textContent = totalUsers;
        document.getElementById('active-users').textContent = activeUsers;
        document.getElementById('suspended-users').textContent = suspendedUsers;
        document.getElementById('new-users-today').textContent = newUsersToday;
    }

    createCharts() {
        // User Growth Chart
        if (this.analytics.user_growth) {
            const ctx1 = document.getElementById('userGrowthChart').getContext('2d');
            this.charts.userGrowth = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: this.analytics.user_growth.map(item => new Date(item.date).toLocaleDateString()),
                    datasets: [{
                        label: 'New Users',
                        data: this.analytics.user_growth.map(item => parseInt(item.new_users)),
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        // Role Distribution Chart
        if (this.analytics.role_distribution) {
            const ctx2 = document.getElementById('roleDistributionChart').getContext('2d');
            this.charts.roleDistribution = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: this.analytics.role_distribution.map(item => item.role),
                    datasets: [{
                        data: this.analytics.role_distribution.map(item => parseInt(item.count)),
                        backgroundColor: [
                            '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
    }

    initializeTabs() {
        // Set up tab switching
        this.showTab('overview');
    }

    async showTab(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.add('hidden');
        });

        // Remove active state from all tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('border-blue-500', 'text-blue-600');
            button.classList.add('border-transparent', 'text-gray-500');
        });

        // Show selected tab
        document.getElementById(`${tabName}-tab`).classList.remove('hidden');
        
        // Activate selected tab button
        const activeButton = document.getElementById(`tab-${tabName}`);
        activeButton.classList.remove('border-transparent', 'text-gray-500');
        activeButton.classList.add('border-blue-500', 'text-blue-600');

        this.currentTab = tabName;

        // Load tab-specific data
        switch(tabName) {
            case 'users':
                await this.loadUsersTab();
                break;
            case 'roles':
                await this.loadRolesTab();
                break;
            case 'activity':
                await this.loadActivityTab();
                break;
            case 'security':
                await this.loadSecurityTab();
                break;
        }
    }

    async loadUsersTab() {
        try {
            // Load roles for filter
            const rolesResponse = await this.apiCall('/api/admin/roles');
            this.roles = rolesResponse.roles;

            // Populate role filter
            const roleFilter = document.getElementById('user-role-filter');
            roleFilter.innerHTML = '<option value="">All Roles</option>';
            this.roles.forEach(role => {
                roleFilter.innerHTML += `<option value="${role.name}">${role.name}</option>`;
            });

            // Load users
            await this.loadUsers();
            
        } catch (error) {
            console.error('Error loading users tab:', error);
        }
    }

    async loadUsers(page = 1, search = '', role = '', status = '') {
        try {
            const params = new URLSearchParams({
                page: page,
                limit: 50,
                search: search,
                role: role,
                status: status
            });

            const response = await this.apiCall(`/api/admin/users?${params}`);
            this.users = response.users;

            this.renderUsersTable();
            
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    renderUsersTable() {
        // Destroy existing DataTable if it exists
        if (this.usersTable) {
            this.usersTable.destroy();
        }

        const tableBody = document.querySelector('#users-table tbody');
        tableBody.innerHTML = '';

        this.users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium mr-3">
                            ${(user.first_name?.[0] || user.email[0]).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-medium text-gray-900">${this.escapeHtml(user.first_name || '')} ${this.escapeHtml(user.last_name || '')}</div>
                            <div class="text-sm text-gray-500">ID: ${user.id.substring(0, 8)}...</div>
                        </div>
                    </div>
                </td>
                <td class="text-sm text-gray-900">${this.escapeHtml(user.email)}</td>
                <td>
                    <span class="px-2 py-1 text-xs rounded-full ${this.getRoleBadgeClass(user.role)}">
                        ${user.role || 'No Role'}
                    </span>
                </td>
                <td>
                    <span class="px-2 py-1 text-xs rounded-full ${this.getStatusBadgeClass(user.account_status)}">
                        ${user.account_status}
                    </span>
                </td>
                <td class="text-sm text-gray-900">${user.total_projects}/${user.deployed_projects}</td>
                <td class="text-sm text-gray-900">${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
                <td>
                    <div class="flex space-x-2">
                        <button onclick="dashboard.viewUser('${user.id}')" class="text-blue-600 hover:text-blue-900">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button onclick="dashboard.editUser('${user.id}')" class="text-indigo-600 hover:text-indigo-900">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${user.account_status !== 'suspended' ? 
                            `<button onclick="dashboard.suspendUser('${user.id}')" class="text-red-600 hover:text-red-900">
                                <i class="fas fa-ban"></i>
                            </button>` : 
                            `<button onclick="dashboard.activateUser('${user.id}')" class="text-green-600 hover:text-green-900">
                                <i class="fas fa-check"></i>
                            </button>`
                        }
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Initialize DataTable
        this.usersTable = $('#users-table').DataTable({
            pageLength: 25,
            responsive: true,
            searching: false, // We'll use our custom search
            ordering: true,
            columnDefs: [
                { orderable: false, targets: -1 } // Disable ordering on actions column
            ]
        });
    }

    async viewUser(userId) {
        try {
            const response = await this.apiCall(`/api/admin/users/${userId}`);
            this.showUserModal(response);
        } catch (error) {
            console.error('Error viewing user:', error);
        }
    }

    showUserModal(userData) {
        const modal = document.getElementById('user-detail-modal');
        const content = document.getElementById('user-detail-content');
        
        const user = userData.user;
        
        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 class="text-lg font-medium text-gray-900 mb-4">User Information</h4>
                    <div class="space-y-3">
                        <div>
                            <label class="text-sm font-medium text-gray-500">Name</label>
                            <p class="text-gray-900">${this.escapeHtml(user.first_name || '')} ${this.escapeHtml(user.last_name || '')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-gray-500">Email</label>
                            <p class="text-gray-900">${this.escapeHtml(user.email)}</p>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-gray-500">Status</label>
                            <span class="px-2 py-1 text-xs rounded-full ${this.getStatusBadgeClass(user.account_status)}">
                                ${user.account_status}
                            </span>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-gray-500">Role</label>
                            <p class="text-gray-900">${user.role || 'No Role'}</p>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-gray-500">Created</label>
                            <p class="text-gray-900">${new Date(user.created_at).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                
                <div>
                    <h4 class="text-lg font-medium text-gray-900 mb-4">Recent Activity</h4>
                    <div class="space-y-2">
                        ${userData.recent_activity.map(activity => `
                            <div class="flex items-center justify-between py-2 border-b border-gray-100">
                                <span class="text-sm text-gray-600">${activity.activity_type}</span>
                                <span class="text-xs text-gray-500">${new Date(activity.created_at).toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <div class="mt-6">
                <h4 class="text-lg font-medium text-gray-900 mb-4">Recent Projects</h4>
                <div class="space-y-2">
                    ${userData.recent_projects.map(project => `
                        <div class="flex items-center justify-between py-2 border-b border-gray-100">
                            <span class="text-sm text-gray-900">${this.escapeHtml(project.name)}</span>
                            <div class="flex items-center space-x-2">
                                <span class="px-2 py-1 text-xs rounded-full ${project.deployed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                                    ${project.deployed ? 'Deployed' : 'Draft'}
                                </span>
                                <span class="text-xs text-gray-500">${new Date(project.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    }

    hideUserModal() {
        document.getElementById('user-detail-modal').classList.add('hidden');
    }

    async loadRolesTab() {
        try {
            const response = await this.apiCall('/api/admin/roles');
            this.renderRoles(response.roles);
        } catch (error) {
            console.error('Error loading roles:', error);
        }
    }

    renderRoles(roles) {
        const container = document.getElementById('roles-grid');
        container.innerHTML = '';

        roles.forEach(role => {
            const features = Object.entries(role.features).filter(([key, value]) => value === true);
            
            const roleCard = document.createElement('div');
            roleCard.className = 'bg-gray-50 rounded-lg p-6 border border-gray-200';
            roleCard.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-medium text-gray-900">${this.escapeHtml(role.name)}</h3>
                    <span class="px-2 py-1 text-xs rounded-full ${role.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${role.is_active ? 'Active' : 'Inactive'}
                    </span>
                </div>
                <p class="text-sm text-gray-600 mb-4">${this.escapeHtml(role.description)}</p>
                <div class="mb-4">
                    <p class="text-sm font-medium text-gray-700 mb-2">Users: ${role.user_count}</p>
                </div>
                <div>
                    <p class="text-sm font-medium text-gray-700 mb-2">Permissions:</p>
                    <div class="flex flex-wrap gap-1">
                        ${features.map(([permission]) => `
                            <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                ${permission.replace(/_/g, ' ')}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
            container.appendChild(roleCard);
        });
    }

    async loadActivityTab() {
        // Load activity data and create activity chart
        if (this.analytics.activity_summary) {
            const ctx = document.getElementById('activityChart').getContext('2d');
            this.charts.activity = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: this.analytics.activity_summary.map(item => item.activity_type),
                    datasets: [{
                        label: 'Activity Count',
                        data: this.analytics.activity_summary.map(item => parseInt(item.count)),
                        backgroundColor: 'rgba(59, 130, 246, 0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
    }

    async loadSecurityTab() {
        // Load security events
        const container = document.getElementById('security-events');
        container.innerHTML = '<p class="text-gray-500">Security events monitoring will be implemented here.</p>';
    }

    getRoleBadgeClass(role) {
        const roleClasses = {
            'super_admin': 'bg-red-100 text-red-800',
            'admin': 'bg-orange-100 text-orange-800',
            'moderator': 'bg-yellow-100 text-yellow-800',
            'premium_user': 'bg-purple-100 text-purple-800',
            'standard_user': 'bg-blue-100 text-blue-800'
        };
        return roleClasses[role] || 'bg-gray-100 text-gray-800';
    }

    getStatusBadgeClass(status) {
        const statusClasses = {
            'active': 'bg-green-100 text-green-800',
            'suspended': 'bg-red-100 text-red-800',
            'pending': 'bg-yellow-100 text-yellow-800',
            'closed': 'bg-gray-100 text-gray-800'
        };
        return statusClasses[status] || 'bg-gray-100 text-gray-800';
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
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        // Simple error display
        alert(message);
    }
}

// Global functions
function showTab(tabName) {
    dashboard.showTab(tabName);
}

function hideUserModal() {
    dashboard.hideUserModal();
}

function logout() {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
}

// Initialize dashboard
const dashboard = new AdvancedAdminDashboard();