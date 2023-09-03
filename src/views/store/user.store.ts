import { defineStore } from 'pinia';
import { User as IUser } from '../../types';
import axios from 'axios';

type User = Pick<IUser, 'id' | 'username' | 'email' | 'profile_picture_url'> & {
	role: IUser['role'] | '';
};
type UserInfo = {
	loggedIn: boolean;
	user: User;
};

export const useUserStore = defineStore({
	id: 'user',
	state: (): UserInfo => ({
		loggedIn: false,
		user: {
			id: '',
			username: '',
			email: '',
			role: '',
			profile_picture_url: '',
		},
	}),
	actions: {
		clearUser() {
			// @ts-ignore
			this.loggedIn = false;
			// @ts-ignore
			this.user = {
				id: '',
				username: '',
				email: '',
				role: '',
				profile_picture_url: '',
			};
		},
		async checkAuth() {
			try {
				await axios.get('/api/v1/auth/check');
			} catch (error) {
				// @ts-ignore
				this.router.push('/login');
				this.clearUser();
			}
		},
		async logout() {
			try {
				await axios.post('/api/v1/auth/logout');
				this.clearUser();
				// @ts-ignore
				this.router.push('/login');
			} catch (error) {
				this.clearUser();
				// @ts-ignore
				this.router.push('/login');
			}
		},
	},
	// @ts-ignore
	persist: {
		key: 'user',
		storage: window.localStorage,
		paths: ['loggedIn', 'user'],
	},
});
