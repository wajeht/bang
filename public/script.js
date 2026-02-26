/**
 * Creates a toast notification with the given message.
 * @param {string} message - The message to display in the toast.
 */
function createToast(message) {
    // Remove existing toast if present
    const existingToast = document.getElementById('toast');
    if (existingToast) existingToast.remove();

    // Create new toast element
    const toast = /** @type {HTMLDivElement} */ (document.createElement('div'));
    toast.id = 'toast';
    toast.style.cssText = `
		position: fixed;
		top: 15px;
		right: -420px;
		background-color: var(--background-color);
		border: 1px solid var(--toast-border-color);
		color: var(--text-color);
		padding: 20px;
		border-radius: 5px;
		transition: right 0.5s ease;
		z-index: 20;
		width: 100%;
		min-width: 200px;
		max-width: 400px;
		text-align: center;
		font-family: Arial, sans-serif;
		cursor: pointer;
		box-sizing: border-box;
	`;
    toast.textContent = decodeURIComponent(message);

    // Add click event for manual dismissal
    toast.onclick = () => dismissToast(toast);

    // Add toast to body and animate
    document.body.appendChild(toast);
    setTimeout(() => (toast.style.right = '15px'), 100);

    // Auto-dismiss toast after 5 seconds
    setTimeout(() => dismissToast(toast), 5000);
}

/**
 * Dismisses a given toast element.
 * @param {HTMLDivElement} toast - The toast element to dismiss.
 */
function dismissToast(toast) {
    toast.style.right = '-420px';
    setTimeout(() => toast.remove(), 500);
}

/**
 * Initializes the toast notifications based on URL parameters or app state.
 */
function initializeToast() {
    const urlParams = new URLSearchParams(window.location.search);
    const toastMessage = urlParams.get('toast');
    if (toastMessage) {
        createToast(toastMessage);
        urlParams.delete('toast');
        const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
        history.replaceState({}, document.title, newUrl);
    }

    try {
        const { flash = {} } = getAppLocalState();
        // Flash messages are arrays: { success: [], error: [], info: [], warning: [] }
        for (const [type, messages] of Object.entries(flash)) {
            if (Array.isArray(messages) && messages.length > 0) {
                // Show each message in the array
                for (const message of messages) {
                    if (message) createToast(message);
                }
            }
        }
    } catch {}
}

/**
 * @typedef {Object} AppLocalState
 * @property {Object|null} user - The user object or null if not available.
 * @property {number} copyRightYear - The current year.
 * @property {Record<string, any>} input - The input data stored in the session.
 * @property {Record<string, any>} errors - The error messages stored in the session.
 * @property {Object} flash - Flash messages categorized by type.
 * @property {string[]} flash.success - Success messages.
 * @property {string[]} flash.error - Error messages.
 * @property {string[]} flash.info - Informational messages.
 * @property {string[]} flash.warning - Warning messages.
 */

/**
 * Retrieves the local state from a script tag.
 * @returns {AppLocalState} The parsed local state object.
 */
function getAppLocalState() {
    try {
        const scriptTag = /** @type {HTMLScriptElement} */ (document.getElementById('app-state'));
        if (!scriptTag) {
            throw new Error('App state script tag not found');
        }

        const jsonText = scriptTag.textContent || scriptTag.innerText;
        if (!jsonText) {
            throw new Error('App state JSON is missing or empty');
        }

        return JSON.parse(jsonText);
    } catch (error) {
        console.error('Failed to parse app state:', error);
        // @ts-ignore
        return {};
    }
}

/**
 * Sets up global keyboard shortcuts for navigation
 */
function initializeKeyboardShortcuts() {
    if (window.location.pathname !== '/') {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                window.location.href = window.location.origin;
            }
        });
    }
}

/**
 * Initializes details element functionality for all details elements on the page
 */
function initializeDetailsElements() {
    // Get all details elements on the page
    const detailsElements = document.querySelectorAll('details');

    if (detailsElements.length > 0) {
        // For each details element
        detailsElements.forEach((detailsElement) => {
            // Event listener for opening this details element
            detailsElement.addEventListener('toggle', function (event) {
                // If this details element was just opened
                if (this.hasAttribute('open')) {
                    // Close all other details elements
                    detailsElements.forEach((otherDetails) => {
                        if (otherDetails !== this && otherDetails.hasAttribute('open')) {
                            otherDetails.removeAttribute('open');
                        }
                    });
                }
            });
        });

        // Document-level click handler to close all details when clicking outside
        document.addEventListener('click', function (event) {
            // Check if the click was inside any details element
            let clickedInsideAnyDetails = false;

            detailsElements.forEach((details) => {
                if (event.target instanceof Node && details.contains(event.target)) {
                    clickedInsideAnyDetails = true;
                }
            });

            // If clicked outside all details elements, close any open ones
            if (!clickedInsideAnyDetails) {
                detailsElements.forEach((details) => {
                    if (details.hasAttribute('open')) {
                        details.removeAttribute('open');
                    }
                });
            }
        });
    }
}

// Note: getLocalStorageData and setLocalStorageData are now defined globally in head.html
// This ensures theme can be set early to prevent FOUC, and functions can be reused

// TypeScript declarations for global functions
/**
 * @returns {Object} The parsed local storage data object.
 */
// @ts-ignore - defined globally in head.html
const getLocalStorageData = window.getLocalStorageData;

/**
 * @param {Object} data - The data to merge with existing local storage data.
 */
// @ts-ignore - defined globally in head.html
const setLocalStorageData = window.setLocalStorageData;

/**
 * Updates the text content of the theme toggle button.
 * @param {string} theme - The current theme, either 'light' or 'dark'.
 */
function updateButtonText(theme) {
    const button = /** @type {HTMLButtonElement} */ (document.getElementById('theme-toggle'));
    if (button) {
        button.textContent = theme === 'dark' ? '🌓 Light' : '🌓 Dark';
    }
}

/**
 * Toggles between light and dark theme, saves to backend
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    updateButtonText(newTheme);

    fetch('/api/settings/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ theme: newTheme }),
    })
        .then((r) => r.json())
        .then((data) => console.log('Theme saved:', data))
        .catch((err) => console.error('Theme save failed:', err));
}

document.addEventListener('DOMContentLoaded', () => {
    initializeToast();
    initializeDetailsElements();

    const { user } = getAppLocalState();

    if (user) {
        // save this to local storage so we can pre-fill the email input on login page
        setLocalStorageData({ user: { email: user.email } });
        initializeKeyboardShortcuts();
        // update button text based on current theme
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        updateButtonText(currentTheme);
    }
});
