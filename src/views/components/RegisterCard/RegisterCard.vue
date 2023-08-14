<script setup lang="ts">
import { ZodIssue } from 'zod';
import { axios, AxiosError } from '@/views/utils';
import type { Props as AlertType } from '@/views/components/Alert/Alert.vue';
import { computed, reactive } from 'vue';

export type States = {
	username: string;
	email: string;
	password: string;
	agree: boolean;
	alert: AlertType;
	error: ZodIssue[];
	loading: boolean;
};

const states = reactive<States>({
	username: '',
	email: '',
	password: '',
	alert: {} as AlertType,
	agree: false,
	error: [],
	loading: false,
});

function clearInputs(): void {
	states.username = '';
	states.email = '';
	states.password = '';
	states.agree = false;
	states.error = [];
	states.loading = false;

	clearAlert(true);
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

async function register(): Promise<void> {
	try {
		states.loading = true;

		const { error, loading, ...inputs } = states;

		await axios.post('/api/v1/auth/register', inputs);

		states.alert = {
			type: 'success',
			message: 'Thanks for registering! Please check your email to verify your account.',
			icon: true,
		};

		clearInputs();
	} catch (error: unknown | AxiosError) {
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

		<!-- card -->
		<div class="card bg-base-100 shadow-xl gap-10">
			<!-- body card -->
			<div class="card-body gap-6">
				<!-- title -->
				<h2 class="card-title">Register</h2>

				<!-- form -->
				<form class="form-control w-full gap-2">
					<!-- username -->
					<FormInput
						v-model="states.username"
						@update:model-value="clearError('username')"
						type="text"
						label="Username"
						placeholder="username"
						autocomplete="username"
						:disabled="states.loading"
						:error="computedError('username')"
					/>

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

					<div class="flex flex-col mt-2 gap-1">
						<!-- agree -->
						<div class="w-fit">
							<label :class="[states.loading ? '' : 'cursor-pointer', 'label gap-2 justify-start']">
								<input
									type="checkbox"
									:disabled="states.loading"
									v-model="states.agree"
									:checked="false"
									class="checkbox"
								/>
								<span class="label-text text-base">I agree</span>
							</label>
						</div>

						<!-- notice -->
						<div class="text-sm pl-1">
							Signing up signifies that you have read and agree to the
							<RouterLink to="/terms-of-service" class="link">Terms of Service</RouterLink>
							and our
							<RouterLink to="/privacy-policy" class="link">Privacy Policy</RouterLink>.
						</div>
					</div>
				</form>

				<!-- button -->
				<div class="flex flex-col gap-2">
					<Button
						:label="'Register'"
						class="btn-neutral"
						:loading="states.loading"
						@click="register"
					/>
				</div>

				<!-- already have an account -->
				<div class="flex justify-between">
					<p>Already have an account?</p>
					<router-link to="/login" class="link">Login</router-link>
				</div>
			</div>
		</div>
	</div>
</template>
