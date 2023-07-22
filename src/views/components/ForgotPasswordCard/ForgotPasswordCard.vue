<script setup lang="ts">
import { ZodIssue } from 'zod';
import axios, { AxiosError } from 'axios';
import type { Props as AlertType } from '../Alert/Alert.vue';

export type States = {
	email: string;
	loading: boolean;
	alert: AlertType;
	error: ZodIssue[];
};

const states = reactive<States>({
	email: '',
	loading: false,
	alert: {} as AlertType,
	error: [],
});

function clearInputs() {
	states.email = '';
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

async function forgotPassword(): Promise<void> {
	try {
		states.loading = true;

		const { error, loading, ...inputs } = states;

		await axios.post('/api/v1/auth/forgot-password', inputs);

		states.alert = {
			type: 'success',
			message: 'If you have an account, you will receive an email with instructions on how to reset your password in a few minutes.',
			icon: true,
		};

		clearInputs();
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
			<!-- title -->
			<h2 class="card-title">Forgot password</h2>

			<!-- error -->
			<Alert
				v-if="computedAlertExists"
				:type="states.alert.type"
				:message="states.alert.message"
				:icon="states.alert.icon"
			/>

			<form class="form-control w-full gap-2">
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
			</form>

			<!-- button -->
			<Button :label="'Submit'" :loading="states.loading" @click="forgotPassword" />
		</div>
	</div>
</template>
