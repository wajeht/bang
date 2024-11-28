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

document.addEventListener('DOMContentLoaded', initializeTheme);
