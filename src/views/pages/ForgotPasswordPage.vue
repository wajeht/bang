<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import type { States } from '../components/ForgotPasswordCard/ForgotPasswordCard.vue';
import { useRouter } from 'vue-router';
import { reactive } from 'vue';

export type StatesWithLoading = Omit<States, 'alert'> & { loading: boolean };

const states = reactive<StatesWithLoading>({
	email: '',
	error: [],
	loading: false,
});

const router = useRouter();

async function forgotPassword(inputs: Omit<States, 'error'>): Promise<void> {
	try {
		states.loading = true;
		await axios.post('/api/v1/auth/forgot-password', inputs);
		router.push('/reset-password');
	} catch (error: unknown | AxiosError) {
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
		<ForgotPasswordCard
			@forgot-password="forgotPassword"
			:error="states.error"
			:loading="states.loading"
		/>
	</RegularLayout>
</template>
