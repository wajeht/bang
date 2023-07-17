<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import type { States } from '../components/ResetPasswordCard/ResetPasswordCard.vue';

export type StatesWithLoading = States & { loading: boolean };

const states = reactive<StatesWithLoading>({
	email: '',
	password: '',
	confirmPassword: '',
	error: [],
	loading: false,
});

const router = useRouter();

async function resetPassword(inputs: Omit<States, 'error'>) {
	try {
		states.loading = true;
		await axios.post('/api/v1/auth/reset-password', inputs);
		router.push('/login');
	} catch (error) {
		if (error instanceof AxiosError) {
			states.error = error.response?.data.error;
		}
	} finally {
		states.loading = false;
	}
}
</script>

<template>
	<RegularLayout>
		<ResetPasswordCard
			@reset-password="resetPassword"
			:error="states.error"
			:loading="states.loading"
		/>
	</RegularLayout>
</template>
