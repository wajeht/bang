function updateButtonText(theme) {
	const button = document.getElementById('theme-toggle');
	button.textContent = theme === 'dark' ? '💡 light' : '💡 dark';
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

function getData() {
	const scriptTag = document.querySelector('script[data-state]');
	const stateData = JSON.parse(scriptTag.getAttribute('data-state'));
	return stateData;
}

function createToast(message) {
	// Remove any existing toast
	const existingToast = document.getElementById('toast');
	if (existingToast) {
		existingToast.remove();
	}

	// Create new toast element
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

	// Add click event to dismiss toast
	toast.onclick = function () {
		dismissToast(toast);
	};

	// Add toast to body
	document.body.appendChild(toast);

	// Animate toast
	setTimeout(() => {
		toast.style.right = '20px';
	}, 100);

	// Set timeout to hide toast
	setTimeout(() => {
		dismissToast(toast);
	}, 5000); // 5 sec
}

function dismissToast(toast) {
	toast.style.right = '-420px';
	setTimeout(() => {
		toast.remove();
	}, 500);
}

function initializeToast(data) {
	const urlParams = new URLSearchParams(window.location.search);
	const toastMessage = urlParams.get('toast');
	if (toastMessage) {
		createToast(toastMessage);
		urlParams.delete('toast');
		const newUrl =
			window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
		history.replaceState({}, document.title, newUrl);
	}

	// flash message from session
	const messages = getData();
	for (const msg in messages) {
		if (messages[msg].length) {
			createToast(messages[msg]);
		}
	}
}

document.addEventListener('DOMContentLoaded', () => {
	initializeToast();
	initializeTheme();
});
