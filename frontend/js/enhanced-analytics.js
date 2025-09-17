/**
 * Enhanced Analytics Dashboard for Prompt Machine v1.0.0-rc
 * Real-time analytics with comprehensive data visualization
 */

class EnhancedAnalyticsDashboard {
    constructor() {
        this.charts = {};
        this.refreshInterval = null;
        this.currentTimeRange = 30;
        this.currentProjectFilter = 'all';
        this.realTimeEnabled = false;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Enhanced Analytics Dashboard');
        
        this.setupEventListeners();
        await this.loadInitialData();
        this.startRealTimeUpdates();
        
        // Load Chart.js plugins for enhanced visualization
        this.loadChartPlugins();
    }

    setupEventListeners() {
        // Time range selector
        const timeRangeSelect = document.getElementById('analytics-time-range');
        if (timeRangeSelect) {
            timeRangeSelect.addEventListener('change', (e) => {
                this.currentTimeRange = parseInt(e.target.value);
                this.refreshDashboard();
            });
        }

        // Project filter
        const projectFilter = document.getElementById('analytics-project-filter');
        if (projectFilter) {
            projectFilter.addEventListener('change', (e) => {
                this.currentProjectFilter = e.target.value;
                this.refreshDashboard();
            });
        }

        // Real-time toggle
        const realTimeToggle = document.getElementById('realtime-toggle');
        if (realTimeToggle) {
            realTimeToggle.addEventListener('change', (e) => {
                this.realTimeEnabled = e.target.checked;
                if (this.realTimeEnabled) {
                    this.startRealTimeUpdates();
                } else {
                    this.stopRealTimeUpdates();
                }
            });
        }

        // Export buttons
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-export]')) {
                const format = e.target.dataset.export;
                this.exportData(format);
            }
            
            if (e.target.matches('[data-project-details]')) {
                const projectId = e.target.dataset.projectDetails;
                this.showProjectDetailModal(projectId);
            }
        });

        // Refresh button
        const refreshBtn = document.getElementById('refresh-analytics');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshDashboard();
            });
        }
    }

    async loadInitialData() {
        try {
            this.showLoading(true);
            
            // Load dashboard overview
            const [overviewData, trendsData, projectsData, deviceData] = await Promise.all([
                this.fetchAnalyticsData('dashboard'),
                this.fetchAnalyticsData('trends'),
                this.fetchAnalyticsData('projects'),
                this.fetchAnalyticsData('device-stats')
            ]);

            // Update UI components
            this.updateOverviewCards(overviewData);
            this.updateTrendsChart(trendsData);
            this.updateProjectsTable(projectsData);
            this.updateDeviceChart(deviceData);
            this.updateTopPerformersWidget(projectsData);
            
            console.log('✅ Analytics dashboard loaded successfully');
            
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.showError('Failed to load analytics data');
        } finally {
            this.showLoading(false);
        }
    }

    async fetchAnalyticsData(endpoint, params = {}) {
        const queryParams = new URLSearchParams({
            days: this.currentTimeRange,
            project: this.currentProjectFilter,
            ...params
        });

        const response = await fetch(`/api/analytics/${endpoint}?${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch ${endpoint}: ${response.statusText}`);
        }

        return await response.json();
    }

    updateOverviewCards(data) {
        if (!data.success) return;
        
        const summary = data.data.summary;
        
        // Update overview statistics
        this.updateCard('total-projects', summary.total_projects, 'Projects Created');
        this.updateCard('active-projects', summary.active_projects, 'Active Projects');
        this.updateCard('total-sessions', summary.total_sessions, 'Total Sessions');
        this.updateCard('avg-completion-rate', `${summary.avg_completion_rate}%`, 'Avg Completion Rate');
        
        // Calculate and display trends
        this.updateTrendIndicators(data.data.trends);
    }

    updateCard(elementId, value, label) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = this.formatNumber(value);
            
            // Add animation for value changes
            element.classList.add('animate-pulse');
            setTimeout(() => element.classList.remove('animate-pulse'), 1000);
        }
    }

    updateTrendIndicators(trends) {
        if (!trends || trends.length < 2) return;
        
        const latest = trends[0];
        const previous = trends[1];
        
        // Calculate percentage changes
        const viewsChange = this.calculatePercentageChange(previous.views, latest.views);
        const sessionsChange = this.calculatePercentageChange(previous.unique_sessions, latest.unique_sessions);
        const completionsChange = this.calculatePercentageChange(previous.completions, latest.completions);
        
        this.updateTrendIndicator('views-trend', viewsChange);
        this.updateTrendIndicator('sessions-trend', sessionsChange);
        this.updateTrendIndicator('completions-trend', completionsChange);
    }

    updateTrendIndicator(elementId, change) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const isPositive = change >= 0;
        const icon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
        const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
        const bgClass = isPositive ? 'bg-green-100' : 'bg-red-100';
        
        element.innerHTML = `
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgClass} ${colorClass}">
                <i class="fas ${icon} mr-1"></i>
                ${Math.abs(change).toFixed(1)}%
            </span>
        `;
    }

    updateTrendsChart(data) {
        if (!data.success || !data.data.trends) return;
        
        const ctx = document.getElementById('trends-chart');
        if (!ctx) return;
        
        // Destroy existing chart
        if (this.charts.trends) {
            this.charts.trends.destroy();
        }
        
        const trends = data.data.trends.reverse(); // Show chronological order
        
        this.charts.trends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trends.map(t => this.formatDateLabel(t.date)),
                datasets: [
                    {
                        label: 'Views',
                        data: trends.map(t => t.views),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Form Starts',
                        data: trends.map(t => t.starts),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Completions',
                        data: trends.map(t => t.completions),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#374151',
                        borderWidth: 1
                    },
                    legend: {
                        position: 'top',
                        align: 'end'
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                }
            }
        });
    }

    updateDeviceChart(data) {
        if (!data.success || !data.data.device_stats) return;
        
        const ctx = document.getElementById('device-chart');
        if (!ctx) return;
        
        // Destroy existing chart
        if (this.charts.device) {
            this.charts.device.destroy();
        }
        
        const deviceStats = data.data.device_stats;
        
        this.charts.device = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: deviceStats.map(stat => this.capitalizeFirst(stat.device_type || 'Unknown')),
                datasets: [{
                    data: deviceStats.map(stat => stat.count),
                    backgroundColor: [
                        '#3b82f6',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444',
                        '#8b5cf6'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const stat = deviceStats[context.dataIndex];
                                return `${context.label}: ${stat.count} (${stat.percentage}%)`;
                            }
                        }
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    updateProjectsTable(data) {
        if (!data.success || !data.data.top_projects) return;
        
        const tbody = document.getElementById('analytics-projects-table');
        if (!tbody) return;
        
        const projects = data.data.top_projects;
        
        if (projects.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                        <i class="fas fa-chart-line text-4xl mb-4 block text-gray-300"></i>
                        No project data available for the selected time period.
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = projects.map(project => `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                            <i class="fas fa-rocket text-blue-600"></i>
                        </div>
                        <div>
                            <div class="font-medium text-gray-900">${this.escapeHtml(project.name)}</div>
                            <div class="text-sm text-gray-500">${project.subdomain}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                    ${this.formatNumber(project.total_interactions)}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                    ${this.formatNumber(project.unique_sessions)}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                    ${this.formatNumber(project.completions)}
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                            <div class="h-2 bg-blue-600 rounded-full" style="width: ${project.completion_rate}%"></div>
                        </div>
                        <span class="text-sm text-gray-900">${project.completion_rate}%</span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <button data-project-details="${project.id}" 
                            class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View Details
                    </button>
                </td>
            </tr>
        `).join('');
    }

    updateTopPerformersWidget(data) {
        const container = document.getElementById('top-performers');
        if (!container || !data.success) return;
        
        const topProjects = data.data.top_projects.slice(0, 5);
        
        container.innerHTML = `
            <h4 class="text-lg font-semibold text-gray-900 mb-4">Top Performers</h4>
            <div class="space-y-3">
                ${topProjects.map((project, index) => `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center">
                            <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                <span class="text-sm font-medium text-blue-600">${index + 1}</span>
                            </div>
                            <div>
                                <div class="font-medium text-gray-900 text-sm">${this.escapeHtml(project.name)}</div>
                                <div class="text-xs text-gray-500">${project.unique_sessions} sessions</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm font-medium text-gray-900">${project.completion_rate}%</div>
                            <div class="text-xs text-gray-500">completion</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async showProjectDetailModal(projectId) {
        try {
            const detailData = await this.fetchAnalyticsData(`projects/${projectId}`);
            
            if (!detailData.success) {
                throw new Error(detailData.error || 'Failed to load project details');
            }
            
            this.renderProjectDetailModal(detailData.data);
            
        } catch (error) {
            console.error('Error loading project details:', error);
            this.showError('Failed to load project details');
        }
    }

    renderProjectDetailModal(projectData) {
        const modal = document.getElementById('project-detail-modal');
        if (!modal) return;
        
        const modalContent = modal.querySelector('.modal-content');
        modalContent.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-semibold text-gray-900">${this.escapeHtml(projectData.project.name)}</h3>
                    <button class="text-gray-400 hover:text-gray-600" onclick="this.closest('.fixed').classList.add('hidden')">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <!-- Project metrics -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                        <div class="text-2xl font-bold text-blue-600">${this.formatNumber(projectData.metrics.total_views)}</div>
                        <div class="text-sm text-gray-600">Total Views</div>
                    </div>
                    <div class="text-center p-4 bg-green-50 rounded-lg">
                        <div class="text-2xl font-bold text-green-600">${this.formatNumber(projectData.metrics.unique_visitors)}</div>
                        <div class="text-sm text-gray-600">Unique Visitors</div>
                    </div>
                    <div class="text-center p-4 bg-yellow-50 rounded-lg">
                        <div class="text-2xl font-bold text-yellow-600">${projectData.metrics.completion_rate}%</div>
                        <div class="text-sm text-gray-600">Completion Rate</div>
                    </div>
                    <div class="text-center p-4 bg-purple-50 rounded-lg">
                        <div class="text-2xl font-bold text-purple-600">${projectData.metrics.avg_session_duration}s</div>
                        <div class="text-sm text-gray-600">Avg Session</div>
                    </div>
                </div>
                
                <!-- Detailed analytics would go here -->
                <div class="space-y-4">
                    <h4 class="font-semibold text-gray-900">Recent Activity</h4>
                    <!-- Activity timeline or additional charts -->
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    }

    startRealTimeUpdates() {
        if (!this.realTimeEnabled) return;
        
        // Update every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.refreshDashboard();
        }, 30000);
        
        console.log('🔄 Real-time updates started');
    }

    stopRealTimeUpdates() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        console.log('⏹️ Real-time updates stopped');
    }

    async refreshDashboard() {
        console.log('🔄 Refreshing analytics dashboard...');
        await this.loadInitialData();
    }

    async exportData(format) {
        try {
            const response = await fetch(`/api/analytics/export?format=${format}&days=${this.currentTimeRange}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-${this.currentTimeRange}days.${format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.showSuccess(`Analytics exported as ${format.toUpperCase()}`);
            } else {
                throw new Error('Export failed');
            }
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export analytics data');
        }
    }

    // Utility methods
    formatNumber(num, decimals = 0) {
        if (num === null || num === undefined) return '0';
        
        if (typeof num === 'string') {
            num = parseFloat(num);
        }
        
        if (isNaN(num)) return '0';
        
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toFixed(decimals);
        }
    }

    formatDateLabel(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    calculatePercentageChange(oldValue, newValue) {
        if (oldValue === 0) return newValue > 0 ? 100 : 0;
        return ((newValue - oldValue) / oldValue) * 100;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading(show) {
        const loading = document.getElementById('analytics-loading');
        const content = document.getElementById('analytics-content');
        
        if (loading && content) {
            if (show) {
                loading.classList.remove('hidden');
                content.classList.add('hidden');
            } else {
                loading.classList.add('hidden');
                content.classList.remove('hidden');
            }
        }
    }

    showError(message) {
        console.error('Analytics Error:', message);
        // Could show a toast notification here
    }

    showSuccess(message) {
        console.log('Analytics Success:', message);
        // Could show a toast notification here
    }

    loadChartPlugins() {
        // Add any Chart.js plugins for enhanced features
        if (window.Chart) {
            Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
            Chart.defaults.color = '#374151';
        }
    }

    // Clean up on page unload
    destroy() {
        this.stopRealTimeUpdates();
        
        // Destroy all charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        this.charts = {};
    }
}

// Initialize enhanced analytics when DOM is ready
let enhancedAnalytics;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        enhancedAnalytics = new EnhancedAnalyticsDashboard();
    });
} else {
    enhancedAnalytics = new EnhancedAnalyticsDashboard();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (enhancedAnalytics) {
        enhancedAnalytics.destroy();
    }
});

// Export for global access
window.enhancedAnalytics = enhancedAnalytics;