import { createRouter, createWebHistory } from 'vue-router';
import Auth from './pages/Auth.vue';
import NotFound from './pages/NotFound.vue';
import Dashboard from './pages/Dashboard.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/',
			name: 'Dashboard',
			component: Dashboard,
		},
		{
			path: '/auth',
			name: 'Auth',
			component: Auth,
		},
		{
			path: '/:pathMatch(.*)*',
			name: 'NotFound',
			component: NotFound,
		},
	],
});

export default router;
