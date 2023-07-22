<script setup lang="ts">
import { ZodIssue } from 'zod';
import axios, { AxiosError } from 'axios';

export type States = {
	email: string;
	loading: boolean;
	error: ZodIssue[];
};

const states = reactive<States>({
	email: '',
	loading: false,
	error: [],
});

function clearInputs() {
	states.email = '';
	states.error = [];
	states.loading = false;
}

async function forgotPassword(): Promise<void> {
	try {
		states.loading = true;

		const { error, loading, ...inputs } = states;

		await axios.post('/api/v1/auth/forgot-password', inputs);

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
		<div class="card-body gap-6">
			<h2 class="card-title">Forgot password</h2>
			<div class="form-control w-full gap-2">
				<!-- email -->
				<FormInput
					v-model="states.email"
					type="email"
					label="Email"
					placeholder="email@domain.com"
					:disabled="states.loading"
					autocomplete="email"
					:error="computedError('email')"
					@update:model-value="clearError('email')"
				/>
			</div>

			<!-- button -->
			<Button :label="'Submit'" :loading="states.loading" @click="forgotPassword" />
		</div>
	</div>
</template>
