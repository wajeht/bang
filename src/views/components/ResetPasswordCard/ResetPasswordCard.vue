<script setup lang="ts">
import { ZodIssue } from 'zod';
import axios, { AxiosError } from 'axios';
import type { Props as AlertType } from '../Alert/Alert.vue';
import { useRouteQuery } from '@vueuse/router';
import { useRouter } from 'vue-router';
import { computed, onMounted, reactive } from 'vue';
import { createGlobalState } from '@vueuse/core';

const router = useRouter();

export type States = {
	email: string;
	password: string;
	token: string;
	confirmPassword: string;
	alert: AlertType;
	loading: boolean;
	error: ZodIssue[];
};

const states = reactive<States>({
	email: '',
	token: '',
	password: '',
	alert: {} as AlertType,
	confirmPassword: '',
	loading: false,
	error: [],
});

onMounted(async () => {
	const email = useRouteQuery('email');
	const token = useRouteQuery('token');

	if (!token.value?.length || !email.value?.length) {
		states.alert = {
			type: 'error',
			message: 'Invalid token or email!',
			icon: true,
		};
		return;
	}

	if (token.value && token.value) {
		states.token = token.value as string;
		states.email = email.value as string;
	}
});

function clearInputs() {
	states.email = '';
	states.password = '';
	states.confirmPassword = '';
	states.token = '';
	states.error = [];
	states.loading = false;

	clearAlert(true);
}

function computedError(type: keyof States): string | undefined {
	return computed(() => {
		return states.error?.find((e) => {
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

function reidreToLoginPageIn(seconds: number): void {
	setTimeout(() => {
		router.push('/login');
	}, seconds * 1000);
}

async function resetPassword(): Promise<void> {
	try {
		states.loading = true;

		const { error, loading, ...inputs } = states;

		await axios.post('/api/v1/auth/reset-password', inputs);

		states.alert = {
			type: 'success',
			message:
				"Youre password has been reset. We'll redirect you to the login page in a few seconds.",
			icon: true,
		};

		clearInputs();

		reidreToLoginPageIn(5); // 5 seconds because clear alert is 5 seconds
	} catch (error) {
		if (error instanceof AxiosError) {
			if (error.response?.status && error.response.status >= 500) {
				states.alert = {
					type: 'error',
					message: 'Something went wrong, please try again later!',
					icon: true,
				};
				return;
			}

			if (error.response?.status && error.response.status >= 400) {
				states.error = error.response?.data.error;
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

		<!-- card card -->
		<div class="card bg-base-100 shadow-xl gap-10">
			<!-- body -->
			<div class="card-body gap-6">
				<!-- title -->
				<h2 class="card-title">Reset Password</h2>

				<!-- form -->
				<form class="form-control w-full gap-2">
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
				</form>

				<!-- button -->
				<div class="flex flex-col gap-2">
					<Button :label="'Submit'" :loading="states.loading" @click="resetPassword" />
				</div>
			</div>
		</div>
	</div>
</template>
