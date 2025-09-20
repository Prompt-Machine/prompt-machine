/**
 * Field Customization Interface for Prompt Engineer V6
 * Drag-and-drop field editor with real-time preview
 */

class FieldCustomizationInterface {
    constructor() {
        this.currentProject = null;
        this.currentStep = null;
        this.draggedField = null;
        this.isReordering = false;
        this.previewContainer = null;
        this.fieldTypes = {
            'text': { label: 'Text Input', icon: 'fa-font', description: 'Single line text input' },
            'textarea': { label: 'Text Area', icon: 'fa-align-left', description: 'Multi-line text input' },
            'select': { label: 'Dropdown', icon: 'fa-caret-down', description: 'Select from options' },
            'radio': { label: 'Radio Buttons', icon: 'fa-dot-circle', description: 'Choose one option' },
            'checkbox': { label: 'Checkboxes', icon: 'fa-check-square', description: 'Select multiple options' },
            'number': { label: 'Number', icon: 'fa-hashtag', description: 'Numeric input' },
            'email': { label: 'Email', icon: 'fa-envelope', description: 'Email address input' }
        };
    }

    /**
     * Initialize the field customization interface
     */
    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        console.log('✅ Field Customization Interface initialized');
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Field editor button clicks
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="edit-field"]')) {
                const fieldId = e.target.closest('[data-action="edit-field"]').dataset.fieldId;
                this.openFieldEditor(fieldId);
            }
            
            if (e.target.closest('[data-action="add-field"]')) {
                const stepId = e.target.closest('[data-action="add-field"]').dataset.stepId;
                this.openFieldEditor(null, stepId);
            }
            
            if (e.target.closest('[data-action="duplicate-field"]')) {
                const fieldId = e.target.closest('[data-action="duplicate-field"]').dataset.fieldId;
                this.duplicateField(fieldId);
            }
            
            if (e.target.closest('[data-action="delete-field"]')) {
                const fieldId = e.target.closest('[data-action="delete-field"]').dataset.fieldId;
                this.deleteField(fieldId);
            }
        });

        // Real-time preview updates
        document.addEventListener('input', (e) => {
            if (e.target.closest('#field-customization-modal')) {
                this.updatePreview();
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.closest('#field-customization-modal')) {
                this.updatePreview();
                if (e.target.name === 'field_type') {
                    this.handleFieldTypeChange(e.target.value);
                }
            }
        });
    }

    /**
     * Set up drag and drop functionality
     */
    setupDragAndDrop() {
        // Enable drag and drop for field reordering
        document.addEventListener('dragstart', (e) => {
            if (e.target.closest('.field-item[draggable="true"]')) {
                this.draggedField = e.target.closest('.field-item');
                e.dataTransfer.effectAllowed = 'move';
                this.draggedField.classList.add('opacity-50');
            }
        });

        document.addEventListener('dragend', (e) => {
            if (this.draggedField) {
                this.draggedField.classList.remove('opacity-50');
                this.draggedField = null;
            }
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dropZone = e.target.closest('.field-drop-zone');
            if (dropZone && this.draggedField) {
                e.dataTransfer.dropEffect = 'move';
                dropZone.classList.add('bg-blue-50', 'border-blue-300');
            }
        });

        document.addEventListener('dragleave', (e) => {
            const dropZone = e.target.closest('.field-drop-zone');
            if (dropZone) {
                dropZone.classList.remove('bg-blue-50', 'border-blue-300');
            }
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const dropZone = e.target.closest('.field-drop-zone');
            if (dropZone && this.draggedField) {
                dropZone.classList.remove('bg-blue-50', 'border-blue-300');
                this.handleFieldDrop(dropZone);
            }
        });
    }

    /**
     * Open the enhanced field editor modal
     */
    openFieldEditor(fieldId = null, stepId = null) {
        const field = fieldId ? this.findFieldById(fieldId) : this.createNewField(stepId);
        if (!field) return;

        this.showFieldCustomizationModal(field, !fieldId);
    }

    /**
     * Create the enhanced field customization modal
     */
    showFieldCustomizationModal(field, isNew = false) {
        const modalHTML = `
            <div id="field-customization-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex">
                    
                    <!-- Left Panel: Field Configuration -->
                    <div class="w-1/2 p-6 border-r border-gray-200 overflow-y-auto">
                        <div class="flex items-center justify-between mb-6">
                            <h3 class="text-2xl font-semibold text-gray-900">
                                ${isNew ? 'Add New Field' : 'Edit Field'}
                            </h3>
                            <button onclick="this.closest('#field-customization-modal').remove()" 
                                    class="text-gray-400 hover:text-gray-600 text-2xl">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <form id="field-customization-form" class="space-y-6">
                            <input type="hidden" name="field_id" value="${field.id || ''}">
                            <input type="hidden" name="step_id" value="${field.step_id || ''}">
                            
                            <!-- Basic Properties -->
                            <div class="space-y-4">
                                <h4 class="text-lg font-medium text-gray-900 border-b pb-2 flex items-center">
                                    <i class="fas fa-cog mr-2 text-blue-600"></i>
                                    Field Properties
                                </h4>
                                
                                <div class="grid grid-cols-1 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">
                                            Field Label <span class="text-red-500">*</span>
                                        </label>
                                        <input type="text" name="label" value="${field.label || ''}" required
                                               class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                               placeholder="Enter field label...">
                                        <p class="text-xs text-gray-500 mt-1">This is what users will see</p>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">
                                            Field Type <span class="text-red-500">*</span>
                                        </label>
                                        <div class="grid grid-cols-2 gap-2">
                                            ${Object.entries(this.fieldTypes).map(([type, config]) => `
                                                <label class="field-type-option cursor-pointer border-2 border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors ${field.field_type === type ? 'border-blue-500 bg-blue-50' : ''}">
                                                    <input type="radio" name="field_type" value="${type}" ${field.field_type === type ? 'checked' : ''} class="sr-only">
                                                    <div class="flex items-center space-x-3">
                                                        <i class="fas ${config.icon} text-lg ${field.field_type === type ? 'text-blue-600' : 'text-gray-400'}"></i>
                                                        <div>
                                                            <div class="font-medium text-sm">${config.label}</div>
                                                            <div class="text-xs text-gray-500">${config.description}</div>
                                                        </div>
                                                    </div>
                                                </label>
                                            `).join('')}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">
                                            Internal Name
                                        </label>
                                        <input type="text" name="name" value="${field.name || ''}"
                                               class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                               placeholder="field_name (auto-generated)">
                                        <p class="text-xs text-gray-500 mt-1">Used in API and database (auto-generated from label)</p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Advanced Options -->
                            <div class="space-y-4">
                                <h4 class="text-lg font-medium text-gray-900 border-b pb-2 flex items-center">
                                    <i class="fas fa-sliders-h mr-2 text-green-600"></i>
                                    Advanced Options
                                </h4>
                                
                                <div class="grid grid-cols-1 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">
                                            Placeholder Text
                                        </label>
                                        <input type="text" name="placeholder" value="${field.placeholder || ''}"
                                               class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                               placeholder="Enter placeholder text...">
                                    </div>
                                    
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">
                                            Help Text
                                        </label>
                                        <textarea name="description" rows="2"
                                                  class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                  placeholder="Optional help text for users...">${field.description || ''}</textarea>
                                    </div>
                                    
                                    <div class="flex items-center space-x-4">
                                        <label class="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" name="is_required" ${field.is_required ? 'checked' : ''}
                                                   class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                            <span class="text-sm font-medium text-gray-700">Required Field</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Options Section (for select/radio/checkbox) -->
                            <div id="field-options-section" class="space-y-4 ${['select', 'radio', 'checkbox'].includes(field.field_type) ? '' : 'hidden'}">
                                <h4 class="text-lg font-medium text-gray-900 border-b pb-2 flex items-center">
                                    <i class="fas fa-list mr-2 text-purple-600"></i>
                                    Field Options
                                </h4>
                                
                                <div id="options-container" class="space-y-2">
                                    ${this.renderOptionsEditor(field.choices || [])}
                                </div>
                                
                                <button type="button" onclick="fieldCustomizer.addOption()" 
                                        class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center space-x-1">
                                    <i class="fas fa-plus"></i>
                                    <span>Add Option</span>
                                </button>
                            </div>
                            
                            <!-- Validation Rules -->
                            <div id="validation-section" class="space-y-4">
                                <h4 class="text-lg font-medium text-gray-900 border-b pb-2 flex items-center">
                                    <i class="fas fa-shield-alt mr-2 text-red-600"></i>
                                    Validation Rules
                                </h4>
                                
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="field-validation-number ${['text', 'textarea', 'number'].includes(field.field_type) ? '' : 'hidden'}">
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Min Length</label>
                                        <input type="number" name="minLength" value="${field.validation_rules?.minLength || ''}"
                                               class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                                    </div>
                                    
                                    <div class="field-validation-number ${['text', 'textarea', 'number'].includes(field.field_type) ? '' : 'hidden'}">
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Max Length</label>
                                        <input type="number" name="maxLength" value="${field.validation_rules?.maxLength || ''}"
                                               class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Action Buttons -->
                            <div class="flex justify-end space-x-4 pt-6 border-t">
                                <button type="button" onclick="this.closest('#field-customization-modal').remove()" 
                                        class="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2">
                                    <i class="fas fa-save"></i>
                                    <span>${isNew ? 'Add Field' : 'Save Changes'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                    
                    <!-- Right Panel: Live Preview -->
                    <div class="w-1/2 p-6 bg-gray-50">
                        <h4 class="text-lg font-medium text-gray-900 mb-4 flex items-center">
                            <i class="fas fa-eye mr-2 text-blue-600"></i>
                            Live Preview
                        </h4>
                        
                        <div class="bg-white rounded-lg border-2 border-gray-200 p-6">
                            <div id="field-preview" class="space-y-4">
                                ${this.renderFieldPreview(field)}
                            </div>
                        </div>
                        
                        <div class="mt-4 p-4 bg-blue-50 rounded-lg">
                            <h5 class="font-medium text-blue-900 mb-2">Preview Tips</h5>
                            <ul class="text-sm text-blue-800 space-y-1">
                                <li>• Changes update automatically</li>
                                <li>• This shows how users will see the field</li>
                                <li>• Test different field types to see variations</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal
        const existingModal = document.getElementById('field-customization-modal');
        if (existingModal) existingModal.remove();

        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Setup form handling
        this.setupModalEventHandlers(field, isNew);
        
        // Initial preview update
        this.updatePreview();
        
        // Setup field type selection styling
        this.setupFieldTypeSelection();
    }

    /**
     * Render options editor for select/radio/checkbox fields
     */
    renderOptionsEditor(choices = []) {
        if (choices.length === 0) {
            choices = [{ label: 'Option 1', value: 'option1' }];
        }

        return choices.map((choice, index) => `
            <div class="option-item flex items-center space-x-2 p-3 border border-gray-200 rounded-lg bg-white" data-option-index="${index}">
                <div class="drag-handle cursor-move text-gray-400 hover:text-gray-600">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="flex-1 grid grid-cols-2 gap-2">
                    <input type="text" name="option_label_${index}" value="${choice.label || ''}" 
                           placeholder="Option Label" 
                           class="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    <input type="text" name="option_value_${index}" value="${choice.value || ''}" 
                           placeholder="option_value" 
                           class="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                </div>
                <button type="button" onclick="fieldCustomizer.removeOption(${index})" 
                        class="text-red-600 hover:text-red-800 p-1">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    /**
     * Render field preview
     */
    renderFieldPreview(field) {
        const label = field.label || 'Field Label';
        const placeholder = field.placeholder || '';
        const description = field.description || '';
        const required = field.is_required;
        const fieldType = field.field_type || 'text';

        let fieldHTML = '';
        
        switch (fieldType) {
            case 'text':
            case 'email':
                fieldHTML = `<input type="${fieldType}" placeholder="${placeholder}" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" ${required ? 'required' : ''}>`;
                break;
            case 'textarea':
                fieldHTML = `<textarea placeholder="${placeholder}" rows="3" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-vertical" ${required ? 'required' : ''}></textarea>`;
                break;
            case 'number':
                fieldHTML = `<input type="number" placeholder="${placeholder}" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" ${required ? 'required' : ''}>`;
                break;
            case 'select':
                const selectOptions = (field.choices || []).map(choice => `<option value="${choice.value}">${choice.label}</option>`).join('');
                fieldHTML = `<select class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" ${required ? 'required' : ''}><option value="">Choose an option...</option>${selectOptions}</select>`;
                break;
            case 'radio':
                const radioOptions = (field.choices || []).map((choice, index) => `
                    <label class="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" name="preview_radio" value="${choice.value}" class="text-blue-600 focus:ring-blue-500">
                        <span>${choice.label}</span>
                    </label>
                `).join('');
                fieldHTML = `<div class="space-y-2">${radioOptions}</div>`;
                break;
            case 'checkbox':
                const checkboxOptions = (field.choices || []).map((choice, index) => `
                    <label class="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" value="${choice.value}" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <span>${choice.label}</span>
                    </label>
                `).join('');
                fieldHTML = `<div class="space-y-2">${checkboxOptions}</div>`;
                break;
        }

        return `
            <div class="field-preview-item">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    ${label} ${required ? '<span class="text-red-500">*</span>' : ''}
                </label>
                ${fieldHTML}
                ${description ? `<p class="text-xs text-gray-500 mt-1">${description}</p>` : ''}
            </div>
        `;
    }

    /**
     * Setup modal event handlers
     */
    setupModalEventHandlers(field, isNew) {
        const form = document.getElementById('field-customization-form');
        const modal = document.getElementById('field-customization-modal');

        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveField(field, isNew);
        });

        // Auto-generate field name from label
        const labelInput = form.querySelector('[name="label"]');
        const nameInput = form.querySelector('[name="name"]');
        
        labelInput?.addEventListener('input', (e) => {
            if (!nameInput.value || nameInput.dataset.autoGenerated !== 'false') {
                nameInput.value = this.generateFieldName(e.target.value);
                nameInput.dataset.autoGenerated = 'true';
            }
        });

        nameInput?.addEventListener('input', (e) => {
            nameInput.dataset.autoGenerated = 'false';
        });
    }

    /**
     * Setup field type selection styling
     */
    setupFieldTypeSelection() {
        const typeOptions = document.querySelectorAll('.field-type-option');
        typeOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove selected state from all options
                typeOptions.forEach(opt => {
                    opt.classList.remove('border-blue-500', 'bg-blue-50');
                    opt.querySelector('i').classList.remove('text-blue-600');
                    opt.querySelector('i').classList.add('text-gray-400');
                });
                
                // Add selected state to clicked option
                option.classList.add('border-blue-500', 'bg-blue-50');
                option.querySelector('i').classList.add('text-blue-600');
                option.querySelector('i').classList.remove('text-gray-400');
                
                // Check the radio button
                option.querySelector('input[type="radio"]').checked = true;
                
                // Update field type dependent sections
                this.handleFieldTypeChange(option.querySelector('input').value);
                this.updatePreview();
            });
        });
    }

    /**
     * Handle field type changes
     */
    handleFieldTypeChange(fieldType) {
        const optionsSection = document.getElementById('field-options-section');
        const validationSection = document.querySelector('#validation-section');
        
        // Show/hide options section
        if (['select', 'radio', 'checkbox'].includes(fieldType)) {
            optionsSection?.classList.remove('hidden');
        } else {
            optionsSection?.classList.add('hidden');
        }
        
        // Show/hide validation options
        const validationInputs = validationSection?.querySelectorAll('.field-validation-number');
        validationInputs?.forEach(input => {
            if (['text', 'textarea', 'number'].includes(fieldType)) {
                input.classList.remove('hidden');
            } else {
                input.classList.add('hidden');
            }
        });
    }

    /**
     * Update live preview
     */
    updatePreview() {
        const form = document.getElementById('field-customization-form');
        if (!form) return;

        const formData = new FormData(form);
        const field = {
            label: formData.get('label') || 'Field Label',
            field_type: formData.get('field_type') || 'text',
            placeholder: formData.get('placeholder') || '',
            description: formData.get('description') || '',
            is_required: formData.has('is_required'),
            choices: this.collectOptionsFromForm(form)
        };

        const previewContainer = document.getElementById('field-preview');
        if (previewContainer) {
            previewContainer.innerHTML = this.renderFieldPreview(field);
        }
    }

    /**
     * Collect options from form
     */
    collectOptionsFromForm(form) {
        const choices = [];
        const optionLabels = form.querySelectorAll('[name^="option_label_"]');
        
        optionLabels.forEach((labelInput, index) => {
            const valueInput = form.querySelector(`[name="option_value_${index}"]`);
            if (labelInput.value && valueInput?.value) {
                choices.push({
                    label: labelInput.value,
                    value: valueInput.value
                });
            }
        });
        
        return choices;
    }

    /**
     * Add new option to options list
     */
    addOption() {
        const container = document.getElementById('options-container');
        const optionCount = container.children.length;
        
        const optionHTML = `
            <div class="option-item flex items-center space-x-2 p-3 border border-gray-200 rounded-lg bg-white" data-option-index="${optionCount}">
                <div class="drag-handle cursor-move text-gray-400 hover:text-gray-600">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="flex-1 grid grid-cols-2 gap-2">
                    <input type="text" name="option_label_${optionCount}" value="" 
                           placeholder="Option Label" 
                           class="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    <input type="text" name="option_value_${optionCount}" value="" 
                           placeholder="option_value" 
                           class="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                </div>
                <button type="button" onclick="fieldCustomizer.removeOption(${optionCount})" 
                        class="text-red-600 hover:text-red-800 p-1">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', optionHTML);
    }

    /**
     * Remove option from options list
     */
    removeOption(index) {
        const option = document.querySelector(`[data-option-index="${index}"]`);
        if (option) {
            option.remove();
            this.updatePreview();
        }
    }

    /**
     * Generate field name from label
     */
    generateFieldName(label) {
        return label
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
    }

    /**
     * Save field changes
     */
    async saveField(originalField, isNew) {
        try {
            const form = document.getElementById('field-customization-form');
            const formData = new FormData(form);
            
            const fieldData = {
                name: formData.get('name'),
                label: formData.get('label'),
                field_type: formData.get('field_type'),
                placeholder: formData.get('placeholder') || null,
                description: formData.get('description') || null,
                is_required: formData.has('is_required'),
                validation_rules: {}
            };

            // Collect validation rules
            const minLength = formData.get('minLength');
            const maxLength = formData.get('maxLength');
            if (minLength) fieldData.validation_rules.minLength = parseInt(minLength);
            if (maxLength) fieldData.validation_rules.maxLength = parseInt(maxLength);

            // Collect choices for select/radio/checkbox fields
            const choices = this.collectOptionsFromForm(form);

            let endpoint, method;
            if (isNew) {
                endpoint = `/api/v6/steps/${originalField.step_id}/fields`;
                method = 'POST';
            } else {
                endpoint = `/api/v6/fields/${originalField.id}`;
                method = 'PUT';
            }

            const response = await fetch(endpoint, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken') || 'dummy-token'}`
                },
                body: JSON.stringify(fieldData)
            });

            const result = await response.json();

            if (result.success) {
                // Handle choices for select/radio/checkbox fields
                if (['select', 'radio', 'checkbox'].includes(fieldData.field_type) && choices.length > 0) {
                    await this.saveFieldChoices(result.field.id, choices);
                }

                // Close modal and refresh view
                document.getElementById('field-customization-modal').remove();
                
                // Refresh the project view
                if (window.promptEngineer?.loadProjectDetails) {
                    await window.promptEngineer.loadProjectDetails(window.promptEngineer.currentProject.id);
                }
                
                this.showSuccessMessage(isNew ? 'Field added successfully!' : 'Field updated successfully!');
            } else {
                throw new Error(result.error || 'Failed to save field');
            }

        } catch (error) {
            console.error('Error saving field:', error);
            this.showErrorMessage('Failed to save field: ' + error.message);
        }
    }

    /**
     * Save field choices
     */
    async saveFieldChoices(fieldId, choices) {
        try {
            // First, delete existing choices
            const deleteResponse = await fetch(`/api/v6/fields/${fieldId}/choices`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken') || 'dummy-token'}`
                }
            });

            // Then add new choices
            for (const choice of choices) {
                await fetch(`/api/v6/fields/${fieldId}/choices`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken') || 'dummy-token'}`
                    },
                    body: JSON.stringify({
                        label: choice.label,
                        value: choice.value,
                        is_default: false
                    })
                });
            }
        } catch (error) {
            console.error('Error saving field choices:', error);
        }
    }

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        // Create and show success notification
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50';
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * Show error message
     */
    showErrorMessage(message) {
        // Create and show error notification
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50';
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="fas fa-exclamation-circle"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    /**
     * Helper methods
     */
    findFieldById(fieldId) {
        // Get field from current project data
        if (window.promptEngineer?.currentProject?.steps) {
            for (const step of window.promptEngineer.currentProject.steps) {
                const field = step.fields?.find(f => f.id === fieldId);
                if (field) {
                    return { ...field, step_id: step.id };
                }
            }
        }
        return null;
    }

    createNewField(stepId) {
        return {
            id: null,
            step_id: stepId,
            name: '',
            label: '',
            field_type: 'text',
            placeholder: '',
            description: '',
            is_required: false,
            choices: []
        };
    }

    duplicateField(fieldId) {
        const field = this.findFieldById(fieldId);
        if (field) {
            const duplicatedField = { ...field, id: null, name: field.name + '_copy' };
            this.openFieldEditor(null, field.step_id, duplicatedField);
        }
    }

    async deleteField(fieldId) {
        if (!confirm('Are you sure you want to delete this field? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/v6/fields/${fieldId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken') || 'dummy-token'}`
                }
            });

            const result = await response.json();

            if (result.success) {
                // Refresh the project view
                if (window.promptEngineer?.loadProjectDetails) {
                    await window.promptEngineer.loadProjectDetails(window.promptEngineer.currentProject.id);
                }
                this.showSuccessMessage('Field deleted successfully!');
            } else {
                throw new Error(result.error || 'Failed to delete field');
            }
        } catch (error) {
            console.error('Error deleting field:', error);
            this.showErrorMessage('Failed to delete field: ' + error.message);
        }
    }

    handleFieldDrop(dropZone) {
        // Implementation for field reordering via drag and drop
        console.log('Field dropped:', this.draggedField, 'Drop zone:', dropZone);
        // This would involve calling the reorder API endpoint
    }
}

// Initialize the field customization interface
const fieldCustomizer = new FieldCustomizationInterface();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => fieldCustomizer.init());
} else {
    fieldCustomizer.init();
}

// Export for global access
window.fieldCustomizer = fieldCustomizer;