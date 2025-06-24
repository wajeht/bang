# Reusable UI Components

This directory contains reusable UI components for the Bang application. These components help maintain consistency and reduce code duplication across views.

## Input Components (`/inputs`)

### text-input.html
Basic text input with label, help text, and error handling.
```ejs
<%- include('../components/inputs/text.html', {
  id: 'name',
  name: 'name',
  label: '📝 Name',
  placeholder: 'Enter name',
  value: state.input.name || '',
  required: true,
  helpText: 'A descriptive name',
  error: state.errors.name
}) %>
```

### email-input.html
Email input with validation and autocomplete support.
```ejs
<%- include('../components/inputs/email.html', {
  id: 'email',
  name: 'email',
  label: '📧 Email',
  placeholder: 'your@email.com',
  value: state.input.email || '',
  required: true,
  autocomplete: 'email',
  helpText: 'Your email address',
  error: state.errors.email
}) %>
```

### url-input.html
URL input with validation.
```ejs
<%- include('../components/inputs/url.html', {
  id: 'url',
  name: 'url',
  label: '🌐 URL',
  placeholder: 'https://example.com',
  value: state.input.url || '',
  required: true,
  helpText: 'Enter full website address',
  error: state.errors.url
}) %>
```

### number-input.html
Number input with min/max support.
```ejs
<%- include('../components/inputs/number.html', {
  id: 'per_page',
  name: 'per_page',
  label: '🔢 Items Per Page',
  value: state.input.per_page || 10,
  min: 1,
  required: true,
  helpText: 'Number of items to show per page',
  error: state.errors.per_page
}) %>
```

### textarea-input.html
Textarea input for multi-line text.
```ejs
<%- include('../components/inputs/textarea.html', {
  id: 'content',
  name: 'content',
  label: '📄 Content',
  placeholder: 'Enter content...',
  value: state.input.content || '',
  required: true,
  helpText: 'Content description',
  error: state.errors.content,
  rows: 5,
  style: 'min-height: 200px; resize: vertical;'
}) %>
```

### checkbox-input.html
Checkbox input with label and help text.
```ejs
<%- include('../components/inputs/checkbox.html', {
  id: 'pinned',
  name: 'pinned',
  label: '📌 Pin this note',
  checked: state.input.pinned || false,
  helpText: 'Pinned notes appear at the top',
  error: state.errors.pinned
}) %>
```

### select-input.html
Select dropdown with options.
```ejs
<%- include('../components/inputs/select.html', {
  id: 'actionType',
  name: 'actionType',
  label: '🏷️ Action Type',
  required: true,
  helpText: 'Select the type of action',
  error: state.errors.actionType,
  options: [
    { value: '', text: 'Choose an option' },
    { value: 'search', text: 'Search', selected: state.input.actionType === 'search' },
    { value: 'redirect', text: 'Redirect', selected: state.input.actionType === 'redirect' }
  ]
}) %>
```

### radio-input.html
Radio button group with fieldset.
```ejs
<%- include('../components/inputs/radio.html', {
  name: 'view_type',
  options: [
    { id: 'table_view', value: 'table', label: '📋 Table View', checked: user.column_preferences?.notes?.view_type !== 'card' },
    { id: 'card_view', value: 'card', label: '🗂️ Card View', checked: user.column_preferences?.notes?.view_type === 'card' }
  ],
  legend: 'Default View',
  required: true,
  helpText: 'Choose your preferred view type',
  error: state.errors.view_type
}) %>
```

### search-input.html
Search input for filtering/searching.
```ejs
<%- include('../components/inputs/search.html', {
  id: 'search-input',
  name: 'search',
  placeholder: 'Search...',
  value: search || '',
  label: 'Search',
  ariaLabel: 'Search items'
}) %>
```

### hidden-input.html
Hidden input (commonly used for CSRF tokens).
```ejs
<%- include('../components/inputs/hidden.html', {
  name: 'csrfToken',
  value: csrfToken
}) %>
```

## Dialog Components (`/dialogs`)

### confirmation-dialog.html
Confirmation dialog for destructive actions.
```ejs
<%- include('../components/dialogs/confirmation-dialog.html', {
  id: 'delete-action-123-modal',
  title: 'Confirm',
  message: 'Are you sure you want to delete this action?',
  itemName: 'My Action',
  formAction: '/actions/123/delete',
  csrfToken: csrfToken,
  confirmText: '🗑️ Delete',
  cancelText: '❌ Cancel'
}) %>
```

## Form Components (`/forms`)

### form-wrapper.html
Form wrapper with CSRF token.
```ejs
<%- include('../components/forms/form.html', {
  method: 'POST',
  action: '/actions',
  style: 'border-style: solid; border-radius: 5px; padding: 20px; width: 32.5%; display: flex; flex-direction: column; gap: 10px;',
  content: content
}) %>
```

### fieldset-wrapper.html
Fieldset wrapper with legend.
```ejs
<%- include('../components/forms/fieldset.html', {
  legend: 'Action Details',
  style: 'border: none; padding: 0; margin: 0;',
  content: content
}) %>
```
