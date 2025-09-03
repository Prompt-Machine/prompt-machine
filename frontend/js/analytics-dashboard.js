class AnalyticsDashboard {
    constructor() {
        this.currentProjectId = null;
        this.dailyChart = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadDashboard();
    }

    bindEvents() {
        // Close modal
        document.getElementById('close-modal').addEventListener('click', () => {
            document.getElementById('project-detail-modal').classList.add('hidden');
        });

        // Time range change
        document.getElementById('time-range-select').addEventListener('change', (e) => {
            if (this.currentProjectId) {
                this.loadProjectDetails(this.currentProjectId, e.target.value);
            }
        });

        // Close modal on outside click
        document.getElementById('project-detail-modal').addEventListener('click', (e) => {
            if (e.target.id === 'project-detail-modal') {
                document.getElementById('project-detail-modal').classList.add('hidden');
            }
        });
    }

    async loadDashboard() {
        try {
            this.showLoading(true);

            const response = await PMConfig.fetch('api/analytics/dashboard', {
                method: 'GET'
            });

            const data = await response.json();

            if (data.success) {
                this.displayOverview(data.overview);
                this.displayProjectsTable(data.projects);
            } else {
                this.showError(data.error || 'Failed to load analytics dashboard');
            }

        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showError('Failed to load analytics dashboard');
        } finally {
            this.showLoading(false);
        }
    }

    displayOverview(overview) {
        document.getElementById('total-projects').textContent = overview.total_projects || 0;
        document.getElementById('total-views').textContent = this.formatNumber(overview.total_views || 0);
        document.getElementById('total-submissions').textContent = this.formatNumber(overview.total_submissions || 0);
        document.getElementById('total-revenue').textContent = '$' + this.formatNumber(overview.total_revenue || 0, 2);
    }

    displayProjectsTable(projects) {
        const tbody = document.getElementById('projects-table-body');
        
        if (!projects.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                        <i class="fas fa-chart-line text-4xl mb-4 block text-gray-300"></i>
                        No analytics data available yet. Deploy some projects to see statistics.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = projects.map(project => {
            const completionRate = project.total_submissions > 0 
                ? Math.round((project.total_completions / project.total_submissions) * 100) 
                : 0;

            const lastActivity = project.last_activity 
                ? this.formatDate(project.last_activity)
                : 'Never';

            const statusBadge = this.getStatusBadge(project.deployed, project.enabled);

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-tools text-blue-600"></i>
                                </div>
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900">${this.escapeHtml(project.project_name)}</div>
                                <div class="text-sm text-gray-500">${project.subdomain}.tool.prompt-machine.com</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">${statusBadge}</td>
                    <td class="px-6 py-4 text-sm text-gray-900">${this.formatNumber(project.total_views || 0)}</td>
                    <td class="px-6 py-4 text-sm text-gray-900">${this.formatNumber(project.total_submissions || 0)}</td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                        <div class="flex items-center">
                            <div class="flex-1">
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-green-600 h-2 rounded-full" style="width: ${completionRate}%"></div>
                                </div>
                            </div>
                            <div class="ml-2 text-sm text-gray-600">${completionRate}%</div>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">$${this.formatNumber(project.total_revenue || 0, 2)}</td>
                    <td class="px-6 py-4 text-sm text-gray-500">${lastActivity}</td>
                    <td class="px-6 py-4">
                        <div class="flex items-center space-x-2">
                            <button onclick="analyticsDashboard.viewProjectDetails('${project.project_id}')" 
                                    class="text-blue-600 hover:text-blue-900 text-sm">
                                <i class="fas fa-chart-bar mr-1"></i>View Details
                            </button>
                            <a href="https://${project.subdomain}.tool.prompt-machine.com" target="_blank"
                               class="text-green-600 hover:text-green-900 text-sm">
                                <i class="fas fa-external-link-alt mr-1"></i>Open Tool
                            </a>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async viewProjectDetails(projectId) {
        this.currentProjectId = projectId;
        const timeRange = document.getElementById('time-range-select').value;
        
        await this.loadProjectDetails(projectId, timeRange);
        document.getElementById('project-detail-modal').classList.remove('hidden');
    }

    async loadProjectDetails(projectId, timeRange = '30d') {
        try {
            const response = await PMConfig.fetch(`api/analytics/project/${projectId}?timeRange=${timeRange}`, {
                method: 'GET'
            });

            const data = await response.json();

            if (data.success) {
                this.displayProjectCharts(data.daily);
                this.displayPerformanceMetrics(data.performance);
                this.displayErrors(data.errors);
            } else {
                this.showError(data.error || 'Failed to load project details');
            }

        } catch (error) {
            console.error('Error loading project details:', error);
            this.showError('Failed to load project details');
        }
    }

    displayProjectCharts(dailyData) {
        const ctx = document.getElementById('daily-chart').getContext('2d');
        
        if (this.dailyChart) {
            this.dailyChart.destroy();
        }

        const labels = dailyData.map(d => this.formatDate(d.date, true));
        const views = dailyData.map(d => parseInt(d.views) || 0);
        const submissions = dailyData.map(d => parseInt(d.submissions) || 0);

        this.dailyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.reverse(),
                datasets: [{
                    label: 'Views',
                    data: views.reverse(),
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Submissions',
                    data: submissions.reverse(),
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    displayPerformanceMetrics(performance) {
        const container = document.getElementById('performance-metrics');
        
        const metrics = [
            { label: 'Average Response Time', value: `${Math.round(performance.avg_response_time || 0)}ms`, icon: 'fa-clock' },
            { label: 'Median Response Time (P50)', value: `${Math.round(performance.p50_response_time || 0)}ms`, icon: 'fa-tachometer-alt' },
            { label: '95th Percentile (P95)', value: `${Math.round(performance.p95_response_time || 0)}ms`, icon: 'fa-chart-line' },
            { label: 'Max Response Time', value: `${Math.round(performance.max_response_time || 0)}ms`, icon: 'fa-exclamation-triangle' }
        ];

        container.innerHTML = metrics.map(metric => `
            <div class="flex items-center justify-between p-3 bg-white rounded border">
                <div class="flex items-center">
                    <i class="fas ${metric.icon} text-gray-400 mr-3"></i>
                    <span class="text-sm text-gray-600">${metric.label}</span>
                </div>
                <span class="text-sm font-medium text-gray-900">${metric.value}</span>
            </div>
        `).join('');
    }

    displayErrors(errors) {
        const container = document.getElementById('errors-list');
        
        if (!errors.length) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-check-circle text-green-500 text-2xl mb-2"></i>
                    <p class="text-sm text-gray-600">No errors recorded in this time period</p>
                </div>
            `;
            return;
        }

        container.innerHTML = errors.map(error => `
            <div class="bg-white border border-red-200 rounded p-3 mb-2">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <p class="text-sm text-red-800 font-medium">${this.escapeHtml(error.error_details || 'Unknown error')}</p>
                        <p class="text-xs text-red-600 mt-1">
                            Last occurred: ${this.formatDate(error.last_occurrence)}
                        </p>
                    </div>
                    <div class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-medium">
                        ${error.error_count} times
                    </div>
                </div>
            </div>
        `).join('');
    }

    getStatusBadge(deployed, enabled) {
        if (deployed && enabled) {
            return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Live</span>';
        } else if (deployed && !enabled) {
            return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Deployed</span>';
        } else {
            return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Draft</span>';
        }
    }

    formatNumber(num, decimals = 0) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    }

    formatDate(dateStr, short = false) {
        const date = new Date(dateStr);
        if (short) {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const content = document.getElementById('dashboard-content');
        
        if (show) {
            loading.classList.remove('hidden');
            content.classList.add('hidden');
        } else {
            loading.classList.add('hidden');
            content.classList.remove('hidden');
        }
    }

    showError(message) {
        const container = document.getElementById('message-container');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 shadow-lg';
        errorDiv.innerHTML = `
            <div class="flex items-center justify-between">
                <span><i class="fas fa-exclamation-circle mr-2"></i>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="text-red-700 hover:text-red-900">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    showSuccess(message) {
        const container = document.getElementById('message-container');
        const successDiv = document.createElement('div');
        successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 shadow-lg';
        successDiv.innerHTML = `
            <div class="flex items-center justify-between">
                <span><i class="fas fa-check-circle mr-2"></i>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="text-green-700 hover:text-green-900">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(successDiv);
        
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 5000);
    }
}

// Initialize analytics dashboard
let analyticsDashboard;
document.addEventListener('DOMContentLoaded', () => {
    analyticsDashboard = new AnalyticsDashboard();
});