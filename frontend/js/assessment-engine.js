// ========================================
// ASSESSMENT ENGINE v2.0.0rc
// Client-Side Calculation & Result Display Engine
// ========================================

class AssessmentEngine {
    constructor() {
        this.projectId = null;
        this.responses = {};
        this.fields = [];
        this.calculations = null;
        this.results = null;
        this.userPackage = 'free';
        this.lockedFields = [];
        this.upgradePrompts = [];
    }

    /**
     * Initialize the assessment engine with project data
     */
    initialize(projectId, fields, calculationType = 'weighted') {
        this.projectId = projectId;
        this.fields = fields;
        this.calculationType = calculationType;
        this.responses = {};
        this.lockedFields = [];
        this.upgradePrompts = [];
        
        // Check user package
        this.checkUserPackage();
        
        // Initialize field states
        this.initializeFieldStates();
    }

    /**
     * Check user's package level for field access
     */
    async checkUserPackage() {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const response = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.userPackage = data.data?.packageName || 'free';
                }
            }
        } catch (error) {
            console.error('Package check error:', error);
            this.userPackage = 'free';
        }
    }

    /**
     * Initialize field states based on permissions
     */
    initializeFieldStates() {
        this.fields.forEach(field => {
            if (field.isPremium || field.required_package_id) {
                if (this.userPackage === 'free') {
                    this.lockedFields.push(field.id);
                }
            }
        });
    }

    /**
     * Record a response for a field
     */
    recordResponse(fieldId, value) {
        // Check if field is locked
        if (this.lockedFields.includes(fieldId)) {
            this.showUpgradePrompt(fieldId);
            return false;
        }
        
        this.responses[fieldId] = value;
        
        // Update progress
        this.updateProgress();
        
        // Trigger real-time calculation if enabled
        if (this.calculationType !== 'none') {
            this.performLocalCalculation();
        }
        
        return true;
    }

    /**
     * Update progress indicator
     */
    updateProgress() {
        const totalFields = this.fields.filter(f => !this.lockedFields.includes(f.id)).length;
        const completedFields = Object.keys(this.responses).length;
        const progress = (completedFields / totalFields) * 100;
        
        // Update progress bar if exists
        const progressBar = document.querySelector('.assessment-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        // Update progress text
        const progressText = document.querySelector('.assessment-progress-text');
        if (progressText) {
            progressText.textContent = `${completedFields} of ${totalFields} fields completed`;
        }
        
        return progress;
    }

    /**
     * Perform local calculation (preview)
     */
    performLocalCalculation() {
        switch (this.calculationType) {
            case 'weighted':
                this.calculations = this.calculateWeighted();
                break;
            case 'probability':
                this.calculations = this.calculateProbability();
                break;
            case 'scoring':
                this.calculations = this.calculateScoring();
                break;
            default:
                this.calculations = null;
        }
        
        // Update preview if exists
        this.updateCalculationPreview();
    }

    /**
     * Weighted calculation method
     */
    calculateWeighted() {
        let totalScore = 50; // Base score
        let factors = {
            increase: [],
            decrease: [],
            neutral: []
        };
        
        this.fields.forEach(field => {
            const response = this.responses[field.id];
            if (!response) return;
            
            const weight = field.weight_in_calculation || field.weight || 0;
            
            if (field.field_type === 'select' || field.field_type === 'multiselect') {
                const selectedChoices = Array.isArray(response) ? response : [response];
                
                selectedChoices.forEach(choiceValue => {
                    const choice = field.choices?.find(c => c.value === choiceValue);
                    if (choice) {
                        const choiceWeight = choice.weight || 0;
                        const contribution = (weight * choiceWeight) / 100;
                        totalScore += contribution;
                        
                        if (contribution > 0) {
                            factors.increase.push({
                                field: field.label,
                                impact: contribution
                            });
                        } else if (contribution < 0) {
                            factors.decrease.push({
                                field: field.label,
                                impact: Math.abs(contribution)
                            });
                        }
                    }
                });
            } else if (field.field_type === 'number' || field.field_type === 'scale') {
                const value = parseFloat(response) || 0;
                const normalizedValue = this.normalizeValue(value, field);
                const contribution = (weight * normalizedValue) / 100;
                totalScore += contribution;
                
                if (contribution > 0) {
                    factors.increase.push({
                        field: field.label,
                        impact: contribution
                    });
                } else if (contribution < 0) {
                    factors.decrease.push({
                        field: field.label,
                        impact: Math.abs(contribution)
                    });
                }
            }
        });
        
        // Ensure score is within bounds
        totalScore = Math.max(0, Math.min(100, totalScore));
        
        return {
            score: Math.round(totalScore * 10) / 10,
            factors,
            confidence: this.calculateConfidence()
        };
    }

    /**
     * Probability calculation method
     */
    calculateProbability() {
        let baseProbability = 50;
        let probabilityFactors = [];
        
        this.fields.forEach(field => {
            const response = this.responses[field.id];
            if (!response) return;
            
            const weight = field.weight_in_calculation || 0;
            
            if (field.choices) {
                const selectedChoices = Array.isArray(response) ? response : [response];
                
                selectedChoices.forEach(choiceValue => {
                    const choice = field.choices.find(c => c.value === choiceValue);
                    if (choice && choice.probability_weight) {
                        const factor = choice.probability_weight / 100;
                        const adjustment = (factor - 0.5) * weight / 10;
                        baseProbability *= (1 + adjustment);
                        
                        probabilityFactors.push({
                            field: field.label,
                            impact: adjustment * 100
                        });
                    }
                });
            }
        });
        
        // Normalize to 0-100
        const finalProbability = Math.max(0, Math.min(100, baseProbability));
        
        return {
            probability: Math.round(finalProbability * 10) / 10,
            factors: probabilityFactors,
            confidence: this.calculateConfidence()
        };
    }

    /**
     * Scoring calculation method
     */
    calculateScoring() {
        let correctAnswers = 0;
        let totalQuestions = 0;
        let detailedResults = [];
        
        this.fields.forEach(field => {
            const response = this.responses[field.id];
            if (!response || !field.validation_rules?.correctAnswer) return;
            
            totalQuestions++;
            const isCorrect = response === field.validation_rules.correctAnswer;
            
            if (isCorrect) {
                correctAnswers++;
            }
            
            detailedResults.push({
                field: field.label,
                correct: isCorrect,
                points: isCorrect ? (field.weight || 1) : 0
            });
        });
        
        const scorePercentage = totalQuestions > 0 
            ? (correctAnswers / totalQuestions) * 100 
            : 0;
        
        return {
            score: Math.round(scorePercentage * 10) / 10,
            correctAnswers,
            totalQuestions,
            details: detailedResults,
            grade: this.getGrade(scorePercentage)
        };
    }

    /**
     * Normalize numeric value to 0-100 scale
     */
    normalizeValue(value, field) {
        const min = field.min_value || 0;
        const max = field.max_value || 100;
        
        if (max === min) return 50;
        
        return ((value - min) / (max - min)) * 100;
    }

    /**
     * Calculate confidence level
     */
    calculateConfidence() {
        const requiredFields = this.fields.filter(f => f.is_required && !this.lockedFields.includes(f.id));
        const answeredRequired = requiredFields.filter(f => this.responses[f.id] !== undefined);
        
        if (requiredFields.length === 0) return 100;
        
        return Math.round((answeredRequired.length / requiredFields.length) * 100);
    }

    /**
     * Get grade from percentage
     */
    getGrade(percentage) {
        if (percentage >= 90) return 'A';
        if (percentage >= 80) return 'B';
        if (percentage >= 70) return 'C';
        if (percentage >= 60) return 'D';
        return 'F';
    }

    /**
     * Update calculation preview in UI
     */
    updateCalculationPreview() {
        if (!this.calculations) return;
        
        const previewElement = document.querySelector('.calculation-preview');
        if (!previewElement) return;
        
        let html = '';
        
        if (this.calculations.score !== undefined) {
            html += `
                <div class="score-display">
                    <div class="score-value ${this.getScoreClass(this.calculations.score)}">
                        ${this.calculations.score}%
                    </div>
                    <div class="score-label">${this.getScoreLabel(this.calculations.score)}</div>
                </div>
            `;
        }
        
        if (this.calculations.probability !== undefined) {
            html += `
                <div class="probability-display">
                    <div class="probability-value">
                        ${this.calculations.probability}%
                    </div>
                    <div class="probability-label">Probability</div>
                </div>
            `;
        }
        
        if (this.calculations.confidence !== undefined) {
            html += `
                <div class="confidence-display">
                    <small>Confidence: ${this.calculations.confidence}%</small>
                </div>
            `;
        }
        
        previewElement.innerHTML = html;
    }

    /**
     * Get score CSS class
     */
    getScoreClass(score) {
        if (score >= 75) return 'score-high';
        if (score >= 50) return 'score-medium';
        if (score >= 25) return 'score-low';
        return 'score-very-low';
    }

    /**
     * Get score label
     */
    getScoreLabel(score) {
        if (score >= 80) return 'Excellent';
        if (score >= 60) return 'Good';
        if (score >= 40) return 'Average';
        if (score >= 20) return 'Below Average';
        return 'Needs Improvement';
    }

    /**
     * Submit assessment for server calculation
     */
    async submitAssessment() {
        try {
            // Validate required fields
            const validation = this.validateResponses();
            if (!validation.valid) {
                this.showValidationErrors(validation.errors);
                return null;
            }
            
            // Show loading state
            this.showLoadingState();
            
            // Submit to server
            const response = await fetch(`/api/v2/prompt-engineer/projects/${this.projectId}/calculate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    responses: this.responses,
                    userPackageId: this.userPackage
                })
            });
            
            if (!response.ok) {
                throw new Error('Calculation failed');
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.results = data.data;
                this.displayResults();
                return this.results;
            } else {
                throw new Error(data.error || 'Calculation failed');
            }
            
        } catch (error) {
            console.error('Assessment submission error:', error);
            this.showError('Failed to calculate results. Please try again.');
            return null;
        } finally {
            this.hideLoadingState();
        }
    }

    /**
     * Validate responses
     */
    validateResponses() {
        const errors = [];
        
        this.fields.forEach(field => {
            // Skip locked fields
            if (this.lockedFields.includes(field.id)) return;
            
            // Check required fields
            if (field.is_required && !this.responses[field.id]) {
                errors.push({
                    fieldId: field.id,
                    message: `${field.label} is required`
                });
            }
            
            // Validate field-specific rules
            if (field.validation_rules && this.responses[field.id]) {
                const value = this.responses[field.id];
                const rules = field.validation_rules;
                
                if (rules.min && value < rules.min) {
                    errors.push({
                        fieldId: field.id,
                        message: `${field.label} must be at least ${rules.min}`
                    });
                }
                
                if (rules.max && value > rules.max) {
                    errors.push({
                        fieldId: field.id,
                        message: `${field.label} must be at most ${rules.max}`
                    });
                }
                
                if (rules.pattern) {
                    const regex = new RegExp(rules.pattern);
                    if (!regex.test(value)) {
                        errors.push({
                            fieldId: field.id,
                            message: `${field.label} has invalid format`
                        });
                    }
                }
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Display results
     */
    displayResults() {
        if (!this.results) return;
        
        const container = document.querySelector('.assessment-results');
        if (!container) return;
        
        let html = '<div class="results-container">';
        
        // Score display
        if (this.results.score !== undefined) {
            html += this.renderScoreSection(this.results.score, this.results.interpretation);
        }
        
        // Analysis section
        if (this.results.analysis) {
            html += this.renderAnalysisSection(this.results.analysis);
        }
        
        // Factors breakdown
        if (this.results.factors) {
            html += this.renderFactorsSection(this.results.factors);
        }
        
        // Recommendations
        if (this.results.recommendations) {
            html += this.renderRecommendationsSection(this.results.recommendations);
        }
        
        // Upgrade prompts
        if (this.results.upgradePrompts && this.results.upgradePrompts.length > 0) {
            html += this.renderUpgradeSection(this.results.upgradePrompts);
        }
        
        html += '</div>';
        
        container.innerHTML = html;
        
        // Animate in results
        this.animateResults();
        
        // Track completion
        this.trackCompletion();
    }

    /**
     * Render score section
     */
    renderScoreSection(score, interpretation) {
        const color = this.getScoreColor(score);
        
        return `
            <div class="result-section score-section">
                <h2 class="result-title">Your Results</h2>
                <div class="score-display-large">
                    <div class="score-circle" style="background: ${color}">
                        <div class="score-value-large">${score}%</div>
                    </div>
                    <div class="score-interpretation">${interpretation || this.getScoreLabel(score)}</div>
                </div>
                <div class="score-bar">
                    <div class="score-bar-fill" style="width: ${score}%; background: ${color}"></div>
                </div>
            </div>
        `;
    }

    /**
     * Render analysis section
     */
    renderAnalysisSection(analysis) {
        return `
            <div class="result-section analysis-section">
                <h3 class="section-title">
                    <i class="fas fa-chart-line"></i> Analysis
                </h3>
                <div class="analysis-content">
                    ${analysis}
                </div>
            </div>
        `;
    }

    /**
     * Render factors section
     */
    renderFactorsSection(factors) {
        let html = '<div class="result-section factors-section">';
        html += '<h3 class="section-title"><i class="fas fa-balance-scale"></i> Contributing Factors</h3>';
        
        if (factors.increase && factors.increase.length > 0) {
            html += `
                <div class="factors-group positive-factors">
                    <h4 class="factors-label">
                        <i class="fas fa-arrow-up text-green-600"></i> Positive Factors
                    </h4>
                    <ul class="factors-list">
                        ${factors.increase.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        if (factors.decrease && factors.decrease.length > 0) {
            html += `
                <div class="factors-group negative-factors">
                    <h4 class="factors-label">
                        <i class="fas fa-arrow-down text-red-600"></i> Risk Factors
                    </h4>
                    <ul class="factors-list">
                        ${factors.decrease.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }

    /**
     * Render recommendations section
     */
    renderRecommendationsSection(recommendations) {
        return `
            <div class="result-section recommendations-section">
                <h3 class="section-title">
                    <i class="fas fa-lightbulb"></i> Recommendations
                </h3>
                <div class="recommendations-list">
                    ${recommendations.map(r => `
                        <div class="recommendation-item">
                            <i class="fas fa-check-circle text-blue-600"></i>
                            <span>${r}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render upgrade section
     */
    renderUpgradeSection(upgradePrompts) {
        return `
            <div class="result-section upgrade-section">
                <div class="upgrade-card">
                    <h3 class="upgrade-title">
                        <i class="fas fa-crown text-yellow-500"></i> Unlock More Insights
                    </h3>
                    <p class="upgrade-description">Upgrade to premium for:</p>
                    <ul class="upgrade-benefits">
                        ${upgradePrompts.map(p => `<li><i class="fas fa-star"></i> ${p}</li>`).join('')}
                    </ul>
                    <button onclick="window.location.href='/packages.html'" class="upgrade-button">
                        Upgrade Now
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Get score color
     */
    getScoreColor(score) {
        if (score >= 75) return '#10b981'; // green
        if (score >= 50) return '#f59e0b'; // yellow
        if (score >= 25) return '#f97316'; // orange
        return '#ef4444'; // red
    }

    /**
     * Show upgrade prompt for locked field
     */
    showUpgradePrompt(fieldId) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return;
        
        // Create modal or inline prompt
        const prompt = document.createElement('div');
        prompt.className = 'upgrade-prompt-modal';
        prompt.innerHTML = `
            <div class="upgrade-prompt-content">
                <h3>Premium Feature</h3>
                <p>The field "${field.label}" requires a premium subscription.</p>
                <p>Upgrade to access:</p>
                <ul>
                    <li>All premium fields</li>
                    <li>Advanced calculations</li>
                    <li>Detailed reports</li>
                </ul>
                <div class="upgrade-prompt-actions">
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn-secondary">
                        Maybe Later
                    </button>
                    <button onclick="window.location.href='/packages.html'" class="btn-primary">
                        Upgrade Now
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(prompt);
        
        // Add to upgrade prompts tracking
        if (!this.upgradePrompts.includes(fieldId)) {
            this.upgradePrompts.push(fieldId);
            this.trackUpgradePrompt(fieldId);
        }
    }

    /**
     * Show validation errors
     */
    showValidationErrors(errors) {
        errors.forEach(error => {
            const field = document.querySelector(`[data-field-id="${error.fieldId}"]`);
            if (field) {
                field.classList.add('field-error');
                
                // Add error message
                const errorMsg = document.createElement('div');
                errorMsg.className = 'field-error-message';
                errorMsg.textContent = error.message;
                field.appendChild(errorMsg);
            }
        });
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        const container = document.querySelector('.assessment-container');
        if (container) {
            container.classList.add('loading');
        }
        
        // Add loading overlay
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <p>Calculating your results...</p>
        `;
        document.body.appendChild(overlay);
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const container = document.querySelector('.assessment-container');
        if (container) {
            container.classList.remove('loading');
        }
        
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        `;
        
        const container = document.querySelector('.assessment-container');
        if (container) {
            container.prepend(errorDiv);
            
            setTimeout(() => errorDiv.remove(), 5000);
        }
    }

    /**
     * Animate results display
     */
    animateResults() {
        const sections = document.querySelectorAll('.result-section');
        sections.forEach((section, index) => {
            setTimeout(() => {
                section.classList.add('animated');
            }, index * 200);
        });
        
        // Animate score if present
        const scoreCircle = document.querySelector('.score-circle');
        if (scoreCircle && this.results?.score) {
            this.animateScore(this.results.score);
        }
    }

    /**
     * Animate score counter
     */
    animateScore(targetScore) {
        const scoreElement = document.querySelector('.score-value-large');
        if (!scoreElement) return;
        
        let currentScore = 0;
        const increment = targetScore / 30;
        
        const timer = setInterval(() => {
            currentScore += increment;
            if (currentScore >= targetScore) {
                currentScore = targetScore;
                clearInterval(timer);
            }
            scoreElement.textContent = `${Math.round(currentScore)}%`;
        }, 50);
    }

    /**
     * Track completion analytics
     */
    async trackCompletion() {
        try {
            await fetch('/api/public/analytics/track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId: this.projectId,
                    event: 'assessment_complete',
                    data: {
                        responses: Object.keys(this.responses).length,
                        lockedFields: this.lockedFields.length,
                        upgradePrompts: this.upgradePrompts.length,
                        score: this.results?.score,
                        userPackage: this.userPackage
                    }
                })
            });
        } catch (error) {
            console.error('Analytics tracking error:', error);
        }
    }

    /**
     * Track upgrade prompt display
     */
    async trackUpgradePrompt(fieldId) {
        try {
            await fetch('/api/public/analytics/track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId: this.projectId,
                    event: 'upgrade_prompt_shown',
                    data: {
                        fieldId,
                        userPackage: this.userPackage
                    }
                })
            });
        } catch (error) {
            console.error('Upgrade prompt tracking error:', error);
        }
    }

    /**
     * Export results
     */
    exportResults(format = 'pdf') {
        if (!this.results) return;
        
        switch (format) {
            case 'pdf':
                this.exportPDF();
                break;
            case 'csv':
                this.exportCSV();
                break;
            case 'json':
                this.exportJSON();
                break;
            default:
                console.error('Unsupported export format');
        }
    }

    /**
     * Export as PDF
     */
    exportPDF() {
        // This would integrate with a PDF library
        console.log('PDF export not yet implemented');
        alert('PDF export coming soon!');
    }

    /**
     * Export as CSV
     */
    exportCSV() {
        const csv = this.generateCSV();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `assessment-results-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Generate CSV content
     */
    generateCSV() {
        let csv = 'Field,Response,Weight\n';
        
        this.fields.forEach(field => {
            const response = this.responses[field.id];
            if (response) {
                csv += `"${field.label}","${response}","${field.weight || 0}"\n`;
            }
        });
        
        if (this.results) {
            csv += '\nResults\n';
            csv += `Score,${this.results.score || 'N/A'}\n`;
            csv += `Interpretation,${this.results.interpretation || 'N/A'}\n`;
        }
        
        return csv;
    }

    /**
     * Export as JSON
     */
    exportJSON() {
        const data = {
            projectId: this.projectId,
            timestamp: new Date().toISOString(),
            responses: this.responses,
            results: this.results,
            userPackage: this.userPackage
        };
        
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `assessment-results-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Reset assessment
     */
    reset() {
        this.responses = {};
        this.calculations = null;
        this.results = null;
        this.lockedFields = [];
        this.upgradePrompts = [];
        
        // Clear UI
        const resultsContainer = document.querySelector('.assessment-results');
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
        }
        
        // Reset progress
        this.updateProgress();
        
        // Clear field errors
        document.querySelectorAll('.field-error').forEach(el => {
            el.classList.remove('field-error');
        });
        
        document.querySelectorAll('.field-error-message').forEach(el => {
            el.remove();
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AssessmentEngine;
}

// Make available globally
window.AssessmentEngine = AssessmentEngine;

// Add CSS for assessment engine
const assessmentStyles = `
<style>
/* Assessment Engine Styles */
.assessment-container {
    position: relative;
}

.assessment-container.loading {
    pointer-events: none;
    opacity: 0.6;
}

.loading-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.loading-spinner {
    width: 50px;
    height: 50px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.assessment-progress-bar {
    height: 4px;
    background: linear-gradient(to right, #8b5cf6, #3b82f6);
    transition: width 0.3s ease;
}

.field-error {
    border-color: #ef4444 !important;
}

.field-error-message {
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 0.25rem;
}

.calculation-preview {
    background: #f3f4f6;
    border-radius: 0.5rem;
    padding: 1rem;
    margin: 1rem 0;
}

.score-display-large {
    text-align: center;
    padding: 2rem;
}

.score-circle {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
    color: white;
    font-size: 2.5rem;
    font-weight: bold;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
}

.score-interpretation {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
}

.score-bar {
    width: 100%;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    margin: 1rem 0;
}

.score-bar-fill {
    height: 100%;
    transition: width 1s ease-out;
}

.result-section {
    background: white;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.5s ease;
}

.result-section.animated {
    opacity: 1;
    transform: translateY(0);
}

.section-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.factors-group {
    margin-bottom: 1rem;
}

.factors-label {
    font-weight: 500;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.factors-list {
    list-style: none;
    padding-left: 1.5rem;
}

.factors-list li {
    position: relative;
    margin-bottom: 0.25rem;
}

.factors-list li:before {
    content: "•";
    position: absolute;
    left: -1rem;
}

.recommendations-list {
    space-y: 0.75rem;
}

.recommendation-item {
    display: flex;
    align-items: start;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 0.25rem;
}

.upgrade-card {
    background: linear-gradient(135deg, #f3e8ff, #dbeafe);
    border-radius: 0.75rem;
    padding: 1.5rem;
    text-align: center;
}

.upgrade-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
}

.upgrade-benefits {
    list-style: none;
    margin: 1rem 0;
}

.upgrade-benefits li {
    margin-bottom: 0.5rem;
}

.upgrade-button {
    background: linear-gradient(to right, #8b5cf6, #3b82f6);
    color: white;
    padding: 0.75rem 2rem;
    border-radius: 0.5rem;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.upgrade-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px -5px rgba(139, 92, 246, 0.3);
}

.upgrade-prompt-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.upgrade-prompt-content {
    background: white;
    border-radius: 0.75rem;
    padding: 2rem;
    max-width: 400px;
    margin: 1rem;
}

.upgrade-prompt-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
}

.btn-primary {
    flex: 1;
    background: linear-gradient(to right, #8b5cf6, #3b82f6);
    color: white;
    padding: 0.75rem;
    border-radius: 0.5rem;
    border: none;
    font-weight: 600;
    cursor: pointer;
}

.btn-secondary {
    flex: 1;
    background: #f3f4f6;
    color: #4b5563;
    padding: 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
    font-weight: 600;
    cursor: pointer;
}

.error-message {
    background: #fee2e2;
    color: #dc2626;
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
</style>
`;

// Inject styles if in browser
if (typeof document !== 'undefined') {
    const styleElement = document.createElement('div');
    styleElement.innerHTML = assessmentStyles;
    document.head.appendChild(styleElement.firstElementChild);
}
