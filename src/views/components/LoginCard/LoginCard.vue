<script setup lang="ts">
import { ZodIssue } from 'zod';
import axios, { AxiosError } from 'axios';

export type States = {
	email: string;
	password: string;
	remember: boolean;
	loading: boolean;
	error: ZodIssue[];
};

const states = reactive<States>({
	email: '',
	password: '',
	remember: false,
	loading: false,
	error: [],
});

function clearInputs() {
	states.email = '';
	states.password = '';
	states.remember = false;
	states.error = [];
	states.loading = false;
}

async function login(): Promise<void> {
	try {
		states.loading = true;

		const { error, loading, ...inputs } = states;

		await axios.post('/api/v1/auth/login', inputs);

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
		<div class="card-body gap-6">
			<!-- title -->
			<h2 class="card-title">Login</h2>
			<!-- form -->
			<form class="form-control w-full gap-2">
				<!-- email -->
				<FormInput
					v-model="states.email"
					type="email"
					label="Email"
					placeholder="email@domain.com"
					autocomplete="email"
					:disabled="states.loading"
					:error="computedError('email')"
					@update:model-value="clearError('email')"
				/>

				<!-- password -->
				<FormInput
					v-model="states.password"
					type="password"
					label="Password"
					placeholder="••••••••"
					:disabled="states.loading"
					autocomplete="current-password"
					:error="computedError('password')"
					@update:model-value="clearError('password')"
				/>

				<div class="flex justify-between items-center mt-1">
					<!-- remember -->
					<label class="label cursor-pointer gap-2">
						<input type="checkbox" :checked="false" class="checkbox" />
						<span class="label-text text-base">Remember me</span>
					</label>

					<!-- forgot -->
					<router-link to="/forgot-password" class="link">Forgot password?</router-link>
				</div>
			</form>

			<!-- button -->
			<div class="flex flex-col gap-2">
				<Button :label="'Login'" :loading="states.loading" @click="login" />
			</div>

			<!-- dont have an account yet -->
			<div class="flex justify-between">
				<p>Don't have an account yet?</p>
				<router-link to="/register" class="link">Register</router-link>
			</div>
		</div>
	</div>
</template>
