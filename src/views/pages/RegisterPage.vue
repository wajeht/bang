<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import type { States } from '../components/RegisterCard/RegisterCard.vue';

export type StatesWithLoading = Pick<States, 'error'> & { loading: boolean };

const states = reactive<StatesWithLoading>({
	error: [],
	loading: false,
});

async function register(inputs: Omit<States, 'error'>) {
	try {
		states.loading = true;

		await new Promise((resolve) => setTimeout(resolve, 1000));

		await axios.post('/api/v1/auth/register', inputs);
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
		<div class="flex flex-col w-full items-center gap-6">
			<!-- login -->
			<RegisterCard @register="register" :error="states.error" :loading="states.loading" />

			<!-- or -->
			<!-- <Or /> -->

			<!-- social login -->
			<!-- <SocialLoginCard :login-with-email-button="true" /> -->
		</div>
	</RegularLayout>
</template>
