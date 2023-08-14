import axios, { AxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { useUserStore } from '@/views/store/user.store';

const axiosInstance = axios.create({
	baseURL: '/',
	withCredentials: true,
	headers: {
		'Content-Type': 'application/json',
	},
});

axiosInstance.interceptors.response.use(
	(response) => {
		return response;
	},
	(error) => {
		const userStore = useUserStore();
		if (error.response.status === StatusCodes.UNAUTHORIZED) {
			// @ts-ignore
			userStore.logout();
		}
		return Promise.reject(error);
	},
);

export { axiosInstance as axios, AxiosError };
