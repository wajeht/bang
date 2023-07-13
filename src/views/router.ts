import { createRouter, createWebHistory } from 'vue-router';

// public pages
import LoginPage from './pages/LoginPage.vue';
import RegisterPage from './pages/RegisterPage.vue';
import ForgotPasswordPage from './pages/ForgotPasswordPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import TermsOfServicePage from './pages/TermsOfServicePage.vue';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.vue';
import HomePage from './pages/HomePage.vue';
import LearnMorePage from './pages/LearnMorePage.vue';
import ResetPasswordPage from './pages/ResetPasswordPage.vue';

// dashboard pages
import DashboardPage from './pages/Dashboard/DashboardPage.vue';
import CommandsPage from './pages/Dashboard/CommandsPage.vue';
import BookmarksPage from './pages/Dashboard/BookmarksPage.vue';
import ProfilePage from './pages/Dashboard/ProfilePage.vue';
import SettingsPage from './pages/Dashboard/SettingsPage.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		// public pages
		{ path: '/', name: 'Bang', component: HomePage },
		{ path: '/learn-more', name: 'Learn more', component: LearnMorePage },
		{ path: '/login', name: 'Login', component: LoginPage },
		{ path: '/terms-of-service', name: 'Terms of Service', component: TermsOfServicePage },
		{ path: '/privacy-policy', name: 'Privacy Policy', component: PrivacyPolicyPage },
		{ path: '/register', name: 'Register', component: RegisterPage },
		{ path: '/forgot-password', name: 'Forgot Password', component: ForgotPasswordPage },
		{ path: '/reset-password', name: 'Reset Password', component: ResetPasswordPage },
		{ path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundPage },
		// dashboard pages
		{ path: '/dashboard', name: 'Dashboard', component: DashboardPage },
		{ path: '/dashboard/commands', name: 'Commands', component: CommandsPage },
		{ path: '/dashboard/bookmarks', name: 'Bookmarks', component: BookmarksPage },
		{ path: '/dashboard/profile', name: 'Profile', component: ProfilePage },
		{ path: '/dashboard/settings', name: 'Settings', component: SettingsPage },
	],
});

export default router;
