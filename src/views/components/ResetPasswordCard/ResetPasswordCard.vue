<script setup lang="ts">
import { ZodIssue } from 'zod';
import axios, { AxiosError } from 'axios';

export type States = {
	email: string;
	password: string;
	token: string;
	confirmPassword: string;
	loading: boolean;
	error: ZodIssue[];
};

const states = reactive<States>({
	email: '',
	token: '',
	password: '',
	confirmPassword: '',
	loading: false,
	error: [],
});

onMounted(() => {
	const url = new URL(window.location.href);
	const token = url.searchParams.get('token');
	const email = url.searchParams.get('email');

	if (token && email) {
		states.token = token;
		states.email = email;
	}
});

function clearInputs() {
	states.email = '';
	states.password = '';
	states.token = '';
	states.error = [];
	states.loading = false;
}

async function resetPassword(): Promise<void> {
	try {
		states.loading = true;

		const { error, loading, ...inputs } = states;

		await axios.post('/api/v1/auth/reset-password', inputs);

		clearInputs();
	} catch (error) {
		if (error instanceof AxiosError) {
			states.error = error.response?.data.error;
		}
	} finally {
		states.loading = false;
	}
}

function computedError(type: keyof States): string | undefined {
	return computed(() => {
		return states.error.find((e) => {
			if (e.path.length === 0 && e.code === 'custom') {
				return e;
			}

			if (e.path[0] === type) {
				return e;
			}
		})?.message;
	}).value;
}

function clearError(type: keyof States) {
	states.error.forEach((e) => {
		if (e.path.length === 0 && e.code === 'custom') {
			states.error.splice(states.error.indexOf(e), 1);
		}

		if (e.path[0] === type) {
			states.error.splice(states.error.indexOf(e), 1);
		}
	});
}
</script>

<template>
	<div class="card w-full max-w-[400px] bg-base-100 shadow-xl gap-10">
		<!-- login card -->
		<form class="card-body gap-6">
			<!-- title -->
			<h2 class="card-title">Reset Password</h2>
			<!-- form -->
			<div class="form-control w-full gap-2">
				<!-- password -->
				<FormInput
					v-model="states.password"
					type="password"
					label="Password"
					placeholder="••••••••"
					autocomplete="current-password"
					:error="computedError('password')"
					@update:model-value="clearError('password')"
				/>

				<!-- confirm password -->
				<FormInput
					v-model="states.confirmPassword"
					type="password"
					label="Confirm Password"
					placeholder="••••••••"
					autocomplete="next-password"
					:error="computedError('confirmPassword')"
					@update:model-value="clearError('confirmPassword')"
				/>
			</div>

			<!-- button -->
			<div class="flex flex-col gap-2">
				<Button :label="'Submit'" :loading="states.loading" @click="resetPassword" />
			</div>
		</form>
	</div>
</template>
