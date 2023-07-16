import { defineStore } from 'pinia';

import { User } from '../../types';

export interface UserWithToken {
	info: Pick<User, 'id' | 'username' | 'email' | 'role'>;
	token: string;
}

export const useUserStore = defineStore({
	id: 'user',
	state: (): UserWithToken => ({
		token: '',
		info: {} as Pick<User, 'id' | 'username' | 'email' | 'role'>,
	}),
	getters: {
		getUserInfo(): UserWithToken['info'] {
			return this.info;
		},
	},
	actions: {
		setInfo(info: UserWithToken['info']) {
			this.info = { ...this.info, ...info };
		},
	},
	persist: {
		key: 'token',
		storage: localStorage,
		paths: ['token'],
	},
});