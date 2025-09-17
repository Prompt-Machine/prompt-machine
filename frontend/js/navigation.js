/**
 * Centralized Navigation System for Prompt Machine v1.5.0rc
 * Manages dynamic navigation menus across all pages with dropdown support
 */

class NavigationManager {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.isAuthenticated = this.checkAuthentication();
        this.userEmail = this.getUserEmail();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('admin-panel.html')) return 'admin-dashboard';
        if (path.includes('user-panel.html')) return 'dashboard';
        if (path.includes('index.html') || path === '/' || path === '') return 'home';
        if (path.includes('prompt-engineer-v6.html')) return 'create-project';
        if (path.includes('prompt-engineer-rc.html')) return 'create-project-rc';
        if (path.includes('analytics-dashboard.html')) return 'analytics';
        if (path.includes('advertising-settings.html')) return 'advertising';
        if (path.includes('user-manager.html')) return 'user-manager';
        if (path.includes('package-manager.html')) return 'package-manager';
        if (path.includes('ai-config.html')) return 'ai-config';
        if (path.includes('signup.html')) return 'signup';
        return 'other';
    }

    checkAuthentication() {
        const token = localStorage.getItem('authToken');
        const currentUser = this.getCurrentUser();
        return !!(token && currentUser && currentUser.email);
    }

    getCurrentUser() {
        try {
            const userStr = localStorage.getItem('currentUser');
            return userStr ? JSON.parse(userStr) : null;
        } catch (error) {
            console.warn('Failed to parse currentUser from localStorage:', error);
            return null;
        }
    }

    getUserEmail() {
        const currentUser = this.getCurrentUser();
        if (!currentUser || !this.checkAuthentication()) {
            return null;
        }
        return currentUser.email || 
               localStorage.getItem('userEmail') || 
               document.getElementById('userEmail')?.textContent || 
               null;
    }

    isAdmin() {
        const currentUser = this.getCurrentUser();
        return currentUser && (currentUser.role === 'admin' || currentUser.email?.includes('admin'));
    }

    getNavigationHTML() {
        // If not authenticated, show public navigation or redirect to login
        if (!this.isAuthenticated) {
            if (this.currentPage === 'signup') {
                return this.getPublicNavigationHTML();
            }
            // For all other admin pages, show minimal navigation
            return this.getUnauthenticatedNavigationHTML();
        }

        return `
    <!-- Navigation -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-40 backdrop-blur-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <!-- Logo and Brand -->
                <div class="flex items-center">
                    <a href="${this.isAdmin() ? '/admin-panel.html' : '/user-panel.html'}" class="flex items-center space-x-3">
                        <div class="h-10 w-10 bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl flex items-center justify-center">
                            <i class="fas fa-magic text-white text-lg"></i>
                        </div>
                        <div class="hidden sm:block">
                            <h1 class="text-xl font-bold text-gray-900">Prompt Machine</h1>
                            <div class="text-xs text-blue-600 font-medium">v1.5.0rc</div>
                        </div>
                    </a>
                </div>

                <!-- Desktop Navigation -->
                <div class="hidden md:flex items-center space-x-6">
                    <a href="/tools-directory.html" class="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                        <i class="fas fa-search mr-2"></i>Explore Tools
                    </a>
                    <a href="/prompt-engineer-v6.html" class="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                        <i class="fas fa-plus mr-2"></i>Create Tool
                    </a>
                    <a href="/analytics-dashboard.html" class="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                        <i class="fas fa-chart-line mr-2"></i>Analytics
                    </a>
                    ${this.isAdmin() ? `
                    <a href="/admin-panel.html" class="text-orange-600 hover:text-orange-700 font-medium transition-colors">
                        <i class="fas fa-crown mr-2"></i>Admin
                    </a>
                    ` : ''}
                </div>

                <!-- User Menu -->
                <div class="flex items-center space-x-4">
                    <div class="relative">
                        <button id="profile-btn" class="flex items-center space-x-3 p-2 text-gray-700 hover:text-gray-900 rounded-lg">
                            <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                                <i class="fas fa-${this.isAdmin() ? 'crown' : 'user'} text-white text-sm"></i>
                            </div>
                            <div class="hidden md:block">
                                <span class="font-medium">${this.userEmail?.split('@')[0] || 'User'}</span>
                                <p class="text-xs text-gray-500">${this.isAdmin() ? 'Admin' : 'User'}</p>
                            </div>
                            <i class="fas fa-chevron-down text-sm"></i>
                        </button>
                        
                        <!-- Profile Dropdown -->
                        <div id="profile-dropdown" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                            <div class="py-2">
                                <a href="${this.isAdmin() ? '/admin-panel.html' : '/user-panel.html'}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                    <i class="fas fa-home mr-2"></i>Dashboard
                                </a>
                                ${this.isAdmin() ? `
                                <a href="/user-panel.html" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                    <i class="fas fa-user mr-2"></i>User View
                                </a>
                                ` : `
                                <a href="/early-access.html" class="block px-4 py-2 text-sm text-purple-600 hover:bg-purple-50">
                                    <i class="fas fa-star mr-2"></i>Upgrade
                                </a>
                                `}
                                <div class="border-t border-gray-100"></div>
                                <button onclick="logout()" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                    <i class="fas fa-sign-out-alt mr-2"></i>Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Mobile menu button -->
                <button onclick="toggleMobileMenu()" class="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                    <i id="mobileMenuIcon" class="fas fa-bars text-xl"></i>
                </button>
            </div>
        </div>
    </nav>

    <!-- Mobile Navigation -->
    <div id="mobileMenu" class="hidden md:hidden fixed inset-0 z-50 bg-black bg-opacity-50">
        <div class="fixed inset-y-0 left-0 w-64 bg-white shadow-xl">
            <div class="flex items-center justify-between p-4 border-b border-gray-200">
                <div class="flex items-center space-x-3">
                    <div class="h-8 w-8 bg-gradient-to-br from-blue-600 to-purple-700 rounded-lg flex items-center justify-center">
                        <i class="fas fa-robot text-white text-sm"></i>
                    </div>
                    <div>
                        <div class="font-bold text-gray-900">Prompt Machine</div>
                        <div class="text-xs text-blue-600">v1.5.0rc</div>
                    </div>
                </div>
                <button onclick="toggleMobileMenu()" class="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <nav class="p-4 space-y-2">
                <!-- Dashboard -->
                <a href="${this.isAdmin() ? 'admin-panel.html' : 'user-panel.html'}" onclick="toggleMobileMenu()" class="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors ${this.currentPage === 'dashboard' ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'}">
                    <i class="fas fa-home mr-3"></i>
                    Dashboard
                </a>

                <!-- Settings Section -->
                <div class="border-t border-gray-200 pt-2 mt-4">
                    <div class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Settings</div>
                    <a href="ai-config.html" onclick="toggleMobileMenu()" class="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors ${this.currentPage === 'ai-config' ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'}">
                        <i class="fas fa-robot mr-3"></i>
                        AI Configuration
                    </a>
                    <a href="advertising-settings.html" onclick="toggleMobileMenu()" class="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors ${this.currentPage === 'advertising' ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'}">
                        <i class="fas fa-dollar-sign mr-3"></i>
                        Advertising Settings
                    </a>
                    <a href="user-manager.html" onclick="toggleMobileMenu()" class="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors ${this.currentPage === 'user-manager' ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'}">
                        <i class="fas fa-users mr-3"></i>
                        User Manager
                    </a>
                </div>

                <!-- Insights Section -->
                <div class="border-t border-gray-200 pt-2 mt-4">
                    <div class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Insights</div>
                    <a href="analytics-dashboard.html" onclick="toggleMobileMenu()" class="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors ${this.currentPage === 'analytics' ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'}">
                        <i class="fas fa-chart-bar mr-3"></i>
                        Analytics Dashboard
                    </a>
                </div>

                <!-- AI Tools Section -->
                <div class="border-t border-gray-200 pt-2 mt-4">
                    <div class="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Tools</div>
                    <a href="prompt-engineer-v6.html" onclick="toggleMobileMenu()" class="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors ${this.currentPage === 'create-project' ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'}">
                        <i class="fas fa-plus mr-3"></i>
                        Prompt Engineer V6
                        <span class="ml-auto bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Active</span>
                    </a>
                </div>

                <!-- User Section -->
                <div class="border-t border-gray-200 pt-4 mt-4">
                    <div class="flex items-center px-3 py-2 mb-2">
                        <div class="w-8 h-8 bg-gray-300 rounded-full mr-3 flex items-center justify-center">
                            <i class="fas fa-user text-gray-600 text-sm"></i>
                        </div>
                        <div>
                            <div class="text-sm font-medium text-gray-900">${this.userEmail}</div>
                            <div class="text-xs text-gray-500">Administrator</div>
                        </div>
                    </div>
                    <button onclick="logout(); toggleMobileMenu()" class="w-full flex items-center px-3 py-3 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 transition-colors">
                        <i class="fas fa-sign-out-alt mr-3"></i>
                        Sign Out
                    </button>
                </div>
            </nav>
        </div>
    </div>
        `;
    }

    getPublicNavigationHTML() {
        return `
    <!-- Public Navigation -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-40 backdrop-blur-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <!-- Logo and Brand -->
                <div class="flex items-center">
                    <div class="flex items-center space-x-3">
                        <div class="h-10 w-10 bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl flex items-center justify-center">
                            <i class="fas fa-robot text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 class="text-xl font-bold text-gray-900">Prompt Machine</h1>
                            <div class="text-xs text-blue-600 font-medium">v1.5.0rc</div>
                        </div>
                    </div>
                </div>

                <!-- Sign In Link -->
                <div class="flex items-center space-x-4">
                    <a href="/login.html" class="text-blue-600 hover:text-blue-800 font-medium transition-colors">
                        Sign In
                    </a>
                </div>
            </div>
        </div>
    </nav>
        `;
    }

    getUnauthenticatedNavigationHTML() {
        return `
    <!-- Unauthenticated Navigation -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-40 backdrop-blur-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <!-- Logo and Brand -->
                <div class="flex items-center">
                    <div class="flex items-center space-x-3">
                        <div class="h-10 w-10 bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl flex items-center justify-center">
                            <i class="fas fa-robot text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 class="text-xl font-bold text-gray-900">Prompt Machine</h1>
                            <div class="text-xs text-blue-600 font-medium">v1.5.0rc</div>
                        </div>
                    </div>
                </div>

                <!-- Access Denied Message -->
                <div class="flex items-center space-x-4">
                    <div class="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm font-medium">
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        Access Denied - Please Sign In
                    </div>
                    <a href="/login.html" class="btn-primary">
                        Sign In
                    </a>
                </div>
            </div>
        </div>
    </nav>
        `;
    }

    injectNavigation() {
        // Find the body element or a navigation placeholder
        const body = document.body;
        const existingNav = document.querySelector('nav');
        
        if (existingNav) {
            existingNav.outerHTML = this.getNavigationHTML();
        } else {
            // Inject at the beginning of body
            body.insertAdjacentHTML('afterbegin', this.getNavigationHTML());
        }

        // Inject the JavaScript functions
        this.injectNavigationFunctions();
    }

    injectNavigationFunctions() {
        // Only inject if functions don't already exist
        if (typeof window.toggleDropdown === 'function') return;

        const script = document.createElement('script');
        script.innerHTML = `
            // Profile dropdown management
            function toggleProfileDropdown() {
                const dropdown = document.getElementById('profile-dropdown');
                dropdown.classList.toggle('hidden');
            }

            // Profile dropdown click handler
            document.addEventListener('DOMContentLoaded', function() {
                const profileBtn = document.getElementById('profile-btn');
                if (profileBtn) {
                    profileBtn.addEventListener('click', toggleProfileDropdown);
                }
            });

            function closeDropdowns() {
                const dropdown = document.getElementById('profile-dropdown');
                if (dropdown) {
                    dropdown.classList.add('hidden');
                }
            }

            // Mobile menu functionality
            function toggleMobileMenu() {
                const mobileMenu = document.getElementById('mobileMenu');
                const mobileMenuIcon = document.getElementById('mobileMenuIcon');
                
                if (mobileMenu.classList.contains('hidden')) {
                    mobileMenu.classList.remove('hidden');
                    mobileMenuIcon.className = 'fas fa-times text-xl';
                } else {
                    mobileMenu.classList.add('hidden');
                    mobileMenuIcon.className = 'fas fa-bars text-xl';
                }
            }

            // Logout functionality
            function logout() {
                if (confirm('Are you sure you want to sign out?')) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('toolAuthToken');
                    window.location.href = '/login.html';
                }
            }

            // Close dropdowns when clicking outside
            document.addEventListener('click', function(e) {
                if (!e.target.closest('[id*="Dropdown"]') && !e.target.closest('[onclick*="toggleDropdown"]')) {
                    closeDropdowns();
                }
                
                // Close mobile menu when clicking outside
                if (!e.target.closest('#mobileMenu') && !e.target.closest('[onclick*="toggleMobileMenu"]')) {
                    const mobileMenu = document.getElementById('mobileMenu');
                    const mobileMenuIcon = document.getElementById('mobileMenuIcon');
                    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                        mobileMenu.classList.add('hidden');
                        if (mobileMenuIcon) mobileMenuIcon.className = 'fas fa-bars text-xl';
                    }
                }
            });

            // Close dropdowns on escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeDropdowns();
                }
            });
        `;
        document.head.appendChild(script);
    }
}

// Navigation is manually initialized in each HTML file

// Make NavigationManager globally available
window.NavigationManager = NavigationManager;