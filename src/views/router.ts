import { createRouter, createWebHistory } from 'vue-router';

import LoginPage from './pages/LoginPage.vue';
import RegisterPage from './pages/RegisterPage.vue';
import ForgotPasswordPage from './pages/ForgotPasswordPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import TermsOfServicePage from './pages/TermsOfServicePage.vue';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import HomePage from './pages/HomePage.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/',
			name: 'Bang',
			component: HomePage,
		},
		{
			path: '/login',
			name: 'Login',
			component: LoginPage,
		},
		{
			path: '/dashboard',
			name: 'Dashboard',
			component: DashboardPage,
		},
		{
			path: '/terms-of-service',
			name: 'Terms of Service',
			component: TermsOfServicePage,
		},
		{
			path: '/privacy-policy',
			name: 'Privacy Policy',
			component: PrivacyPolicyPage,
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
