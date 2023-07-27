import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from './store/user.store';

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
import VerifyEmailPage from './pages/VerifyEmailPage.vue';

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
		{ path: '/verify-email', name: 'Verify Email', component: VerifyEmailPage },
		{ path: '/forgot-password', name: 'Forgot Password', component: ForgotPasswordPage },
		{ path: '/reset-password', name: 'Reset Password', component: ResetPasswordPage },
		{ path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundPage },
		// dashboard pages
		{
			path: '/dashboard',
			name: 'Dashboard',
			component: DashboardPage,
			meta: { requiredAuth: true },
		},
		{
			path: '/dashboard/commands',
			name: 'Commands',
			component: CommandsPage,
			meta: { requiredAuth: true },
		},
		{
			path: '/dashboard/bookmarks',
			name: 'Bookmarks',
			component: BookmarksPage,
			meta: { requiredAuth: true },
		},
		{
			path: '/dashboard/profile',
			name: 'Profile',
			component: ProfilePage,
			meta: { requiredAuth: true },
		},
		{
			path: '/dashboard/settings',
			name: 'Settings',
			component: SettingsPage,
			meta: { requiredAuth: true },
		},
	],
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	scrollBehavior(to, from, savedPosition) {
		return { top: 0 };
	},
});

router.beforeEach(async (to, from, next) => {
	const userStore = useUserStore();
	document.title = to.name as string;

	if (to.matched.some((record) => record.meta.requiredAuth)) {
		if (!userStore.loggedIn) {
			next({ name: 'Login' });
		} else {
			next();
		}
	} else {
		if (userStore.loggedIn && to.name === 'Login') {
			next({ name: 'Dashboard' });
		} else {
			next();
		}
	}
});

export default router;
