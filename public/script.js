/**
 * Updates the text content of the theme toggle button.
 * @param {string} theme - The current theme, either 'light' or 'dark'.
 */
function updateButtonText(theme) {
	const button = /** @type {HTMLButtonElement} */ (document.getElementById('theme-toggle'));
	if (button) {
		button.textContent = theme === 'dark' ? '💡 Light' : '💡 Dark';
	}
}

/**
 * Toggles the theme between light and dark modes.
 */
function toggleTheme() {
	const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
	const newTheme = currentTheme === 'light' ? 'dark' : 'light';

	document.documentElement.setAttribute('data-theme', newTheme);
	localStorage.setItem('theme', newTheme);
	updateButtonText(newTheme);
}

/**
 * Initializes the theme based on the saved preference.
 */
function initializeTheme() {
	const savedTheme = localStorage.getItem('theme') || 'light';
	document.documentElement.setAttribute('data-theme', savedTheme);
	updateButtonText(savedTheme);
}

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
		top: 20px;
		right: -420px;
		background-color: var(--background-color);
		border: 2px solid var(--border-color);
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
	setTimeout(() => (toast.style.right = '20px'), 100);

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
		for (const msg of Object.values(flash)) {
			if (msg?.length) createToast(msg);
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
	const scriptTag = /** @type {HTMLScriptElement} */ (document.querySelector('script[data-state]'));
	if (!scriptTag) {
		throw new Error('State script tag not found');
	}

	const state = scriptTag.getAttribute('data-state');
	if (!state) {
		throw new Error('State attribute is missing or empty');
	}

	return JSON.parse(state);
}

document.addEventListener('DOMContentLoaded', () => {
	initializeTheme();
	initializeToast();

	let user = null;

	try {
		const { user: localUser } = getAppLocalState();
		user = localUser;
	} catch {}

	if (user && window.location.pathname !== '/') {
		document.addEventListener('keydown', (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				window.location.href = window.location.origin;
			}
		});
	}
});
