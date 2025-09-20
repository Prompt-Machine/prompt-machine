// ========================================
// CALCULATION ENGINE SERVICE v2.0.0rc
// Professional Assessment & Probability Calculator
// ========================================

const { Pool } = require('pg');

class CalculationEngine {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || 
                `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        // Define calculation strategies
        this.strategies = {
            weighted: this.weightedCalculation.bind(this),
            probability: this.probabilityCalculation.bind(this),
            scoring: this.scoringCalculation.bind(this),
            decision_tree: this.decisionTreeCalculation.bind(this),
            none: this.noCalculation.bind(this)
        };

        // Score interpretation ranges
        this.interpretations = {
            veryHigh: { min: 80, max: 100, label: 'Very High', color: 'green' },
            high: { min: 60, max: 79, label: 'High', color: 'yellow-green' },
            moderate: { min: 40, max: 59, label: 'Moderate', color: 'yellow' },
            low: { min: 20, max: 39, label: 'Low', color: 'orange' },
            veryLow: { min: 0, max: 19, label: 'Very Low', color: 'red' }
        };
    }

    /**
     * Main calculation method that routes to appropriate strategy
     */
    async calculate({ project, responses, includeUpgradePrompts = false }) {
        try {
            // Get calculation rules for project
            const rulesResult = await this.pool.query(
                'SELECT * FROM calculation_rules WHERE project_id = $1',
                [project.id]
            );

            const rules = rulesResult.rows[0] || {
                rule_type: project.calculation_enabled ? 'weighted' : 'none',
                base_score: 50,
                score_ranges: this.interpretations,
                factor_weights: {},
                outcome_mapping: {}
            };

            // Get all fields with their metadata
            const fieldsResult = await this.pool.query(
                `SELECT pf.*, pc.probability_weight, pc.outcome_contribution
                 FROM project_fields_v6 pf
                 JOIN project_steps_v6 ps ON pf.step_id = ps.id
                 LEFT JOIN project_choices_v6 pc ON pf.id = pc.field_id
                 WHERE ps.project_id = $1
                 ORDER BY ps.step_order, pf.field_order`,
                [project.id]
            );

            const fields = fieldsResult.rows;

            // Execute calculation strategy
            const strategy = this.strategies[rules.rule_type] || this.strategies.weighted;
            const result = await strategy({
                rules,
                fields,
                responses,
                project
            });

            // Add interpretation
            result.interpretation = this.interpretScore(result.score, rules.score_ranges);

            // Add upgrade prompts if requested
            if (includeUpgradePrompts) {
                result.upgradePrompts = await this.generateUpgradePrompts(project, responses, fields);
            }

            // Add metadata
            result.calculationType = rules.rule_type;
            result.timestamp = new Date().toISOString();
            result.projectId = project.id;

            return result;

        } catch (error) {
            console.error('Calculation error:', error);
            throw new Error('Failed to perform calculations');
        }
    }

    /**
     * Weighted calculation strategy (most common for assessments)
     */
    async weightedCalculation({ rules, fields, responses }) {
        let totalScore = rules.base_score || 50;
        let maxPossibleScore = 100;
        let factors = {
            increase: [],
            decrease: [],
            neutral: []
        };
        let detailedBreakdown = [];

        // Process each response
        for (const [fieldId, value] of Object.entries(responses)) {
            const field = fields.find(f => f.id === fieldId);
            if (!field) continue;

            const weight = field.weight_in_calculation || 0;
            
            if (field.field_type === 'select' || field.field_type === 'multiselect') {
                // Handle choice-based fields
                const selectedChoices = Array.isArray(value) ? value : [value];
                
                for (const choiceValue of selectedChoices) {
                    const choice = fields.find(f => 
                        f.field_id === fieldId && f.choice_value === choiceValue
                    );
                    
                    if (choice) {
                        const choiceWeight = choice.probability_weight || 0;
                        const contribution = (weight * choiceWeight) / 100;
                        totalScore += contribution;

                        // Track factors
                        if (contribution > 0) {
                            factors.increase.push({
                                field: field.label,
                                choice: choice.choice_text,
                                impact: contribution,
                                explanation: choice.explanation_text
                            });
                        } else if (contribution < 0) {
                            factors.decrease.push({
                                field: field.label,
                                choice: choice.choice_text,
                                impact: Math.abs(contribution),
                                explanation: choice.explanation_text
                            });
                        }

                        detailedBreakdown.push({
                            fieldId,
                            fieldName: field.label,
                            value: choice.choice_text,
                            weight,
                            choiceWeight,
                            contribution
                        });
                    }
                }
            } else if (field.field_type === 'number' || field.field_type === 'scale') {
                // Handle numeric fields
                const numValue = parseFloat(value) || 0;
                const normalizedValue = this.normalizeNumericValue(numValue, field);
                const contribution = (weight * normalizedValue) / 100;
                totalScore += contribution;

                if (contribution > 0) {
                    factors.increase.push({
                        field: field.label,
                        value: numValue,
                        impact: contribution
                    });
                } else if (contribution < 0) {
                    factors.decrease.push({
                        field: field.label,
                        value: numValue,
                        impact: Math.abs(contribution)
                    });
                }

                detailedBreakdown.push({
                    fieldId,
                    fieldName: field.label,
                    value: numValue,
                    weight,
                    normalizedValue,
                    contribution
                });
            }
        }

        // Ensure score is within bounds
        totalScore = Math.max(0, Math.min(100, totalScore));

        // Sort factors by impact
        factors.increase.sort((a, b) => b.impact - a.impact);
        factors.decrease.sort((a, b) => b.impact - a.impact);

        // Generate recommendations based on score and factors
        const recommendations = this.generateRecommendations(totalScore, factors);

        return {
            score: Math.round(totalScore * 10) / 10,
            maxScore: maxPossibleScore,
            factors: {
                increase: factors.increase.map(f => f.explanation || `${f.field}: ${f.choice || f.value}`),
                decrease: factors.decrease.map(f => f.explanation || `${f.field}: ${f.choice || f.value}`),
                neutral: factors.neutral
            },
            detailedBreakdown,
            recommendations,
            confidence: this.calculateConfidence(responses, fields)
        };
    }

    /**
     * Probability calculation strategy
     */
    async probabilityCalculation({ rules, fields, responses }) {
        let probabilityFactors = [];
        let baseProbability = rules.base_score || 50;
        
        // Calculate probability based on Bayesian-like approach
        for (const [fieldId, value] of Object.entries(responses)) {
            const field = fields.find(f => f.id === fieldId);
            if (!field) continue;

            const weight = field.weight_in_calculation || 0;
            
            if (field.field_type === 'select' || field.field_type === 'multiselect') {
                const selectedChoices = Array.isArray(value) ? value : [value];
                
                for (const choiceValue of selectedChoices) {
                    const choice = fields.find(f => 
                        f.field_id === fieldId && f.choice_value === choiceValue
                    );
                    
                    if (choice && choice.probability_weight) {
                        // Apply Bayesian update
                        const factor = choice.probability_weight / 100;
                        const adjustment = (factor - 0.5) * weight / 10;
                        baseProbability *= (1 + adjustment);
                        
                        probabilityFactors.push({
                            field: field.label,
                            choice: choice.choice_text,
                            probabilityImpact: adjustment,
                            explanation: choice.explanation_text
                        });
                    }
                }
            }
        }

        // Normalize probability to 0-100 range
        const finalProbability = Math.max(0, Math.min(100, baseProbability));
        
        // Sort factors by impact
        probabilityFactors.sort((a, b) => Math.abs(b.probabilityImpact) - Math.abs(a.probabilityImpact));

        return {
            score: Math.round(finalProbability * 10) / 10,
            probability: finalProbability,
            factors: {
                increase: probabilityFactors.filter(f => f.probabilityImpact > 0)
                    .map(f => f.explanation || `${f.field}: ${f.choice}`),
                decrease: probabilityFactors.filter(f => f.probabilityImpact < 0)
                    .map(f => f.explanation || `${f.field}: ${f.choice}`),
                neutral: probabilityFactors.filter(f => f.probabilityImpact === 0)
                    .map(f => `${f.field}: ${f.choice}`)
            },
            confidence: this.calculateConfidence(responses, fields),
            analysis: this.generateProbabilityAnalysis(finalProbability, probabilityFactors)
        };
    }

    /**
     * Scoring calculation strategy (for quizzes, tests)
     */
    async scoringCalculation({ rules, fields, responses }) {
        let correctAnswers = 0;
        let totalQuestions = 0;
        let detailedResults = [];

        for (const [fieldId, value] of Object.entries(responses)) {
            const field = fields.find(f => f.id === fieldId);
            if (!field) continue;

            // Check if field has a correct answer defined
            if (field.validation_rules && field.validation_rules.correctAnswer) {
                totalQuestions++;
                const isCorrect = value === field.validation_rules.correctAnswer;
                
                if (isCorrect) {
                    correctAnswers++;
                }

                detailedResults.push({
                    fieldId,
                    question: field.label,
                    userAnswer: value,
                    correctAnswer: field.validation_rules.correctAnswer,
                    isCorrect,
                    points: isCorrect ? (field.weight_in_calculation || 1) : 0
                });
            }
        }

        const scorePercentage = totalQuestions > 0 
            ? (correctAnswers / totalQuestions) * 100 
            : 0;

        return {
            score: Math.round(scorePercentage * 10) / 10,
            correctAnswers,
            totalQuestions,
            detailedResults,
            grade: this.calculateGrade(scorePercentage),
            recommendations: this.generateScoringRecommendations(scorePercentage, detailedResults)
        };
    }

    /**
     * Decision tree calculation strategy
     */
    async decisionTreeCalculation({ rules, fields, responses }) {
        // Complex decision tree logic
        // This would follow a tree structure based on responses
        let currentNode = rules.outcome_mapping.root || {};
        let path = [];
        let finalOutcome = null;

        for (const [fieldId, value] of Object.entries(responses)) {
            const field = fields.find(f => f.id === fieldId);
            if (!field) continue;

            path.push({
                field: field.label,
                value,
                timestamp: new Date().toISOString()
            });

            // Navigate the decision tree
            if (currentNode.branches && currentNode.branches[value]) {
                currentNode = currentNode.branches[value];
            }

            // Check if we've reached a leaf node
            if (currentNode.outcome) {
                finalOutcome = currentNode.outcome;
            }
        }

        return {
            score: finalOutcome?.score || 50,
            outcome: finalOutcome?.label || 'Undetermined',
            path,
            recommendations: finalOutcome?.recommendations || [],
            confidence: this.calculateConfidence(responses, fields)
        };
    }

    /**
     * No calculation (for simple tools)
     */
    async noCalculation({ fields, responses }) {
        return {
            score: null,
            summary: 'Responses recorded successfully',
            responses: Object.keys(responses).length,
            totalFields: fields.length
        };
    }

    /**
     * Generate rules for a new project
     */
    async generateRules({ projectId, toolType, fields }) {
        const baseRules = {
            name: `${toolType} Calculation Rules`,
            type: this.getDefaultCalculationType(toolType),
            baseScore: 50,
            ranges: this.interpretations,
            weights: {},
            outcomes: {}
        };

        // Generate weights based on field importance
        fields.forEach(field => {
            if (field.weight_in_calculation > 0) {
                baseRules.weights[field.id] = field.weight_in_calculation;
            }
        });

        // Define outcome mappings based on score ranges
        baseRules.outcomes = {
            veryHigh: {
                label: 'Excellent Result',
                recommendations: [
                    'Continue with current approach',
                    'Share your success with others',
                    'Consider advanced strategies'
                ]
            },
            high: {
                label: 'Good Result',
                recommendations: [
                    'Build on your strengths',
                    'Focus on consistency',
                    'Explore optimization opportunities'
                ]
            },
            moderate: {
                label: 'Average Result',
                recommendations: [
                    'Identify areas for improvement',
                    'Seek additional resources',
                    'Consider professional guidance'
                ]
            },
            low: {
                label: 'Below Average Result',
                recommendations: [
                    'Focus on fundamental improvements',
                    'Seek immediate support',
                    'Create an action plan'
                ]
            },
            veryLow: {
                label: 'Needs Improvement',
                recommendations: [
                    'Prioritize immediate changes',
                    'Consult with experts',
                    'Consider alternative approaches'
                ]
            }
        };

        return baseRules;
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Normalize numeric values to 0-100 scale
     */
    normalizeNumericValue(value, field) {
        const min = field.min_value || 0;
        const max = field.max_value || 100;
        
        if (max === min) return 50;
        
        return ((value - min) / (max - min)) * 100;
    }

    /**
     * Interpret score into categories
     */
    interpretScore(score, ranges = this.interpretations) {
        for (const [key, range] of Object.entries(ranges)) {
            if (score >= range.min && score <= range.max) {
                return range.label;
            }
        }
        return 'Unknown';
    }

    /**
     * Calculate confidence level based on completeness
     */
    calculateConfidence(responses, fields) {
        const requiredFields = fields.filter(f => f.is_required);
        const answeredRequired = requiredFields.filter(f => responses[f.id] !== undefined);
        
        if (requiredFields.length === 0) return 100;
        
        return Math.round((answeredRequired.length / requiredFields.length) * 100);
    }

    /**
     * Generate recommendations based on score and factors
     */
    generateRecommendations(score, factors) {
        const recommendations = [];

        if (score >= 80) {
            recommendations.push('Excellent performance! Continue with current practices.');
            if (factors.increase.length > 0) {
                recommendations.push(`Key strengths: ${factors.increase.slice(0, 3).map(f => f.field).join(', ')}`);
            }
        } else if (score >= 60) {
            recommendations.push('Good results with room for improvement.');
            if (factors.decrease.length > 0) {
                recommendations.push(`Areas to focus on: ${factors.decrease.slice(0, 3).map(f => f.field).join(', ')}`);
            }
        } else if (score >= 40) {
            recommendations.push('Moderate results. Consider making significant improvements.');
            recommendations.push('Focus on addressing the highest impact negative factors.');
        } else {
            recommendations.push('Significant improvements needed.');
            recommendations.push('Consider seeking professional guidance or support.');
            if (factors.decrease.length > 0) {
                recommendations.push(`Priority areas: ${factors.decrease.slice(0, 5).map(f => f.field).join(', ')}`);
            }
        }

        // Add specific recommendations based on top factors
        if (factors.increase.length > 0) {
            const topPositive = factors.increase[0];
            if (topPositive.impact > 10) {
                recommendations.push(`Leverage your strength in "${topPositive.field}"`);
            }
        }

        if (factors.decrease.length > 0) {
            const topNegative = factors.decrease[0];
            if (topNegative.impact > 10) {
                recommendations.push(`Prioritize improving "${topNegative.field}"`);
            }
        }

        return recommendations;
    }

    /**
     * Generate probability analysis text
     */
    generateProbabilityAnalysis(probability, factors) {
        let analysis = '';

        if (probability >= 75) {
            analysis = 'Very high probability of positive outcome. ';
        } else if (probability >= 50) {
            analysis = 'Moderate to high probability of positive outcome. ';
        } else if (probability >= 25) {
            analysis = 'Low to moderate probability of positive outcome. ';
        } else {
            analysis = 'Low probability of positive outcome. ';
        }

        if (factors.length > 0) {
            const topFactors = factors.slice(0, 3);
            analysis += `Key factors: ${topFactors.map(f => f.field).join(', ')}.`;
        }

        return analysis;
    }

    /**
     * Calculate grade for scoring-based assessments
     */
    calculateGrade(percentage) {
        if (percentage >= 90) return 'A';
        if (percentage >= 80) return 'B';
        if (percentage >= 70) return 'C';
        if (percentage >= 60) return 'D';
        return 'F';
    }

    /**
     * Generate recommendations for scoring-based tools
     */
    generateScoringRecommendations(score, results) {
        const recommendations = [];
        const incorrectQuestions = results.filter(r => !r.isCorrect);

        if (score >= 90) {
            recommendations.push('Excellent performance! You have mastered the material.');
        } else if (score >= 70) {
            recommendations.push('Good job! Review the questions you missed to improve further.');
        } else {
            recommendations.push('Additional study recommended. Focus on the fundamentals.');
        }

        if (incorrectQuestions.length > 0) {
            recommendations.push(`Review these topics: ${incorrectQuestions.slice(0, 3).map(q => q.question).join(', ')}`);
        }

        return recommendations;
    }

    /**
     * Generate upgrade prompts for locked features
     */
    async generateUpgradePrompts(project, responses, fields) {
        const prompts = [];
        
        // Check for premium fields not answered
        const premiumFields = fields.filter(f => f.is_premium);
        const unansweredPremium = premiumFields.filter(f => !responses[f.id]);

        if (unansweredPremium.length > 0) {
            prompts.push(`Access ${unansweredPremium.length} advanced analysis fields`);
            prompts.push('Get more accurate and detailed results');
            prompts.push('Unlock professional-grade recommendations');
        }

        // Check for advanced calculation features
        if (project.calculation_enabled) {
            prompts.push('View detailed factor breakdown');
            prompts.push('Get personalized action plans');
            prompts.push('Access comparative analysis');
        }

        return prompts;
    }

    /**
     * Get default calculation type for tool category
     */
    getDefaultCalculationType(toolType) {
        const typeMap = {
            assessment: 'weighted',
            creative: 'none',
            utility: 'none',
            business: 'scoring',
            educational: 'scoring',
            medical: 'probability',
            financial: 'weighted'
        };

        return typeMap[toolType] || 'weighted';
    }
}

module.exports = CalculationEngine;
