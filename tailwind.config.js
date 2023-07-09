/** @type {import('tailwindcss').Config} */
module.exports = {
	important: true,
	content: ['./src/views/index.html', './src/views/**/*.{vue,js,ts,jsx,tsx}'],
	theme: {
		extend: {},
	},
	plugins: [require("daisyui")],
};
