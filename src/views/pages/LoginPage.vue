<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import type { States } from '../components/LoginCard/LoginCard.vue';

export type StatesWithLoading = States & { loading: boolean };

const states = reactive<StatesWithLoading>({
	password: '',
	remember: false,
	email: '',
	error: [],
	loading: false,
});

async function login(inputs: Omit<States, 'error'>) {
	try {
		states.loading = true;
		await axios.post('/api/v1/auth/login', inputs);
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
			<LoginCard @login="login" :error="states.error" :loading="states.loading" />

			<!-- or -->
			<!-- <Or /> -->

			<!-- social login -->
			<!-- <SocialLoginCard :register-with-email-button="true" /> -->
		</div>
	</RegularLayout>
</template>
