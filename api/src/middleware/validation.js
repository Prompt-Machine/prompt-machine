const { body, param, query } = require('express-validator');

// Common validation rules
const emailValidation = body('email')
    .isEmail()
    .withMessage('Must be a valid email')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters');

const passwordValidation = body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase, one uppercase, and one digit');

const uuidValidation = (field) => 
    param(field)
        .isUUID()
        .withMessage(`${field} must be a valid UUID`);

const projectNameValidation = body('name')
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_.]+$/)
    .withMessage('Name can only contain letters, numbers, spaces, hyphens, underscores, and periods');

const projectDescriptionValidation = body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters');

const subdomainValidation = body('subdomain')
    .optional()
    .isString()
    .withMessage('Subdomain must be a string')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Subdomain must be between 3 and 50 characters')
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Subdomain can only contain lowercase letters, numbers, and hyphens')
    .custom((value) => {
        if (value.startsWith('-') || value.endsWith('-')) {
            throw new Error('Subdomain cannot start or end with hyphen');
        }
        return true;
    });

const fieldValidation = [
    body('name')
        .isString()
        .withMessage('Field name must be a string')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Field name must be between 1 and 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Field name can only contain letters, numbers, and underscores'),
    
    body('label')
        .isString()
        .withMessage('Field label must be a string')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Field label must be between 1 and 100 characters'),
    
    body('field_type')
        .isIn(['text', 'textarea', 'select', 'number', 'email', 'url', 'date', 'checkbox', 'radio'])
        .withMessage('Invalid field type'),
    
    body('placeholder')
        .optional()
        .isString()
        .withMessage('Placeholder must be a string')
        .trim()
        .isLength({ max: 200 })
        .withMessage('Placeholder must be less than 200 characters'),
    
    body('description')
        .optional()
        .isString()
        .withMessage('Description must be a string')
        .trim()
        .isLength({ max: 300 })
        .withMessage('Description must be less than 300 characters'),
    
    body('required')
        .isBoolean()
        .withMessage('Required must be a boolean'),
    
    body('field_options')
        .optional()
        .isObject()
        .withMessage('Field options must be an object')
];

const stepValidation = [
    body('title')
        .isString()
        .withMessage('Step title must be a string')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Step title must be between 1 and 100 characters'),
    
    body('description')
        .optional()
        .isString()
        .withMessage('Step description must be a string')
        .trim()
        .isLength({ max: 500 })
        .withMessage('Step description must be less than 500 characters'),
    
    body('order_index')
        .isInt({ min: 0 })
        .withMessage('Order index must be a non-negative integer')
];

const systemPromptValidation = body('system_prompt')
    .isString()
    .withMessage('System prompt must be a string')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('System prompt must be between 10 and 5000 characters');

const aiRoleValidation = body('ai_role')
    .isString()
    .withMessage('AI role must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('AI role must be between 1 and 100 characters');

const messageValidation = body('message')
    .isString()
    .withMessage('Message must be a string')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters');

const timeRangeValidation = query('timeRange')
    .optional()
    .isIn(['24h', '7d', '30d', '90d'])
    .withMessage('Time range must be one of: 24h, 7d, 30d, 90d');

// Composed validation rules for different endpoints
const validationRules = {
    // Authentication
    login: [emailValidation, passwordValidation],
    
    // Projects
    createProject: [projectNameValidation, projectDescriptionValidation],
    updateProject: [
        uuidValidation('id'),
        projectNameValidation,
        subdomainValidation
    ],
    getProject: [uuidValidation('id')],
    deleteProject: [uuidValidation('id')],
    
    // Fields
    createField: [uuidValidation('projectId'), ...fieldValidation],
    updateField: [uuidValidation('projectId'), uuidValidation('fieldId'), ...fieldValidation],
    deleteField: [uuidValidation('projectId'), uuidValidation('fieldId')],
    
    // Steps
    createStep: [uuidValidation('projectId'), ...stepValidation],
    updateStep: [uuidValidation('projectId'), uuidValidation('stepId'), ...stepValidation],
    deleteStep: [uuidValidation('projectId'), uuidValidation('stepId')],
    
    // AI Configuration
    updateAIConfig: [
        uuidValidation('projectId'),
        aiRoleValidation,
        systemPromptValidation
    ],
    
    // Messages
    sendMessage: [uuidValidation('projectId'), messageValidation],
    
    // Analytics
    projectAnalytics: [uuidValidation('projectId'), timeRangeValidation],
    
    // Deployment
    deploy: [uuidValidation('projectId')],
    deployStatus: [uuidValidation('projectId')]
};

module.exports = {
    validationRules,
    // Individual validators for custom use
    emailValidation,
    passwordValidation,
    uuidValidation,
    projectNameValidation,
    projectDescriptionValidation,
    subdomainValidation,
    fieldValidation,
    stepValidation,
    systemPromptValidation,
    aiRoleValidation,
    messageValidation,
    timeRangeValidation
};