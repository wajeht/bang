/**
 * @param {string} theme
 */
function updateButtonText(theme) {
	const button = document.getElementById('theme-toggle');
	button.textContent = theme === 'dark' ? '💡 Light' : '💡 Dark';
}

function toggleTheme() {
	const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
	const newTheme = currentTheme === 'light' ? 'dark' : 'light';

	document.documentElement.setAttribute('data-theme', newTheme);
	localStorage.setItem('theme', newTheme);
	updateButtonText(newTheme);
}

function initializeTheme() {
	const savedTheme = localStorage.getItem('theme') || 'light';
	document.documentElement.setAttribute('data-theme', savedTheme);
	updateButtonText(savedTheme);
}

/**
 * @param {string} message
 */
function createToast(message) {
	// Remove existing toast if present
	const existingToast = document.getElementById('toast');
	if (existingToast) existingToast.remove();

	// Create new toast element
	/** @type {HTMLDivElement} */
	const toast = document.createElement('div');
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
 * @param {HTMLDivElement} toast
 */
function dismissToast(toast) {
	toast.style.right = '-420px';
	setTimeout(() => toast.remove(), 500);
}

/**
 * @param {HTMLDivElement} toast
 */
function dismissToast(toast) {
	toast.style.right = '-420px';
	setTimeout(() => toast.remove(), 500);
}

function initializeToast() {
	// Display toast from URL parameters if exist
	const urlParams = new URLSearchParams(window.location.search);
	const toastMessage = urlParams.get('toast');
	if (toastMessage) {
		createToast(toastMessage);
		urlParams.delete('toast');
		const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
		history.replaceState({}, document.title, newUrl);
	}

    let data = {};

    try {
	    data = getAppLocalState();
    } catch (_error){
        data = {};
    }

	if (data.falsh && Object.values(data.flash).some((msg) => msg.length > 0)) {
		Object.values(data.flash).forEach((msg) => {
			if (msg.length) createToast(msg);
		});
	}
}

function getAppLocalState() {
	/** @type {HTMLScriptElement} */
	const scriptTag = document.querySelector('script[data-state]');
	return JSON.parse(scriptTag.getAttribute('data-state'));
}

document.addEventListener('DOMContentLoaded', () => {
	initializeTheme();
	initializeToast();

    let data = {};

    try {
	   data = getAppLocalState();
    } catch (_error){
        data = {};
    }

    // pressing ctrl/cmd + k to bring search page
	if (data.user && window.location.pathname !== '/') {
		document.addEventListener('keydown', (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				window.location.href = window.location.origin;
			}
		});
	}
});
