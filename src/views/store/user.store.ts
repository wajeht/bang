import { defineStore } from 'pinia';

import { User as IUser } from '../../types';

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
	actions: {},
	persist: {
		key: 'user',
		storage: window.localStorage,
		paths: ['loggedIn', 'user'],
	},
});
