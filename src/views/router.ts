import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from './pages/LoginPage.vue';
import RegisterPage from './pages/RegisterPage.vue';
import ForgotPasswordPage from './pages/ForgotPasswordPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/',
			name: 'Bang',
			component: LoginPage,
		},
		{
			path: '/login',
			name: 'Login',
			component: LoginPage,
		},
		{
			path: '/register',
			name: 'Register',
			component: RegisterPage,
		},
		{
			path: '/forgot-password',
			name: 'Forgot Password',
			component: ForgotPasswordPage,
		},
		{
			path: '/:pathMatch(.*)*',
			name: 'NotFound',
			component: NotFoundPage,
		},
	],
});

export default router;
