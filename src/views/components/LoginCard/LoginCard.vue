<script setup lang="ts">
import { ZodIssue } from 'zod';
import axios, { AxiosError } from 'axios';
import type { Props as AlertType } from '../Alert/Alert.vue';
import { computed, reactive } from 'vue';

export type States = {
	email: string;
	password: string;
	remember: boolean;
	loading: boolean;
	alert: AlertType;
	error: ZodIssue[];
};

const states = reactive<States>({
	email: '',
	password: '',
	remember: false,
	alert: {} as AlertType,
	loading: false,
	error: [],
});

function clearInputs() {
	states.email = '';
	states.password = '';
	states.remember = false;
	states.error = [];
	states.loading = false;

	clearAlert(true);
}

function clearAlert(slowly = false): void {
	if (slowly) {
		setTimeout(() => (states.alert = {} as AlertType), 5000);
		return;
	}
	states.alert = {} as AlertType;
}

const computedAlertExists = computed(() => {
	return Object.values(states.alert).some((e) => {
		if (typeof e === 'string') {
			return e.length > 0;
		}
		if (typeof e === 'boolean') {
			return e;
		}
		return true;
	});
});

async function login(): Promise<void> {
	try {
		states.loading = true;

		const { error, loading, ...inputs } = states;

		await axios.post('/api/v1/auth/login', inputs);

		clearInputs();
	} catch (error) {
		if (error instanceof AxiosError) {
			states.error = error.response?.data.error;

			if (error.response?.status && error.response.status >= 500) {
				states.alert = {
					type: 'error',
					message: 'Something went wrong, please try again later!',
					icon: true,
				};
				return;
			}

			if (error.response?.status && error.response.status >= 400) {
				if (
					error.response.data?.error &&
					error.response.data?.error.length === 1 &&
					error.response.data?.error[0]?.code === 'custom' &&
					error.response.data?.error[0].path.length === 1 &&
					error.response.data?.error[0]?.path[0] === 'alert'
				) {
					states.alert = {
						type: 'error',
						message: error?.response?.data?.error[0]?.message ?? error.response.data?.message,
						icon: true,
					};
					return;
				}
			}
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
	<div class="w-full max-w-[400px] flex flex-col gap-6">
		<!-- error -->
		<Alert
			v-if="computedAlertExists"
			:type="states.alert.type"
			:message="states.alert.message"
			:icon="states.alert.icon"
		/>

		<!-- card -->
		<div class="card bg-base-100 shadow-xl gap-10">
			<!-- body -->
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
	</div>
</template>
