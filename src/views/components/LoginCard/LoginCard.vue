<script setup lang="ts">
import { ZodIssue } from 'zod';
const router = useRouter();

function goToDashboardPage() {
	router.push('/dashboard');
}

export type States = {
	email: string;
	password: string;
	remember: boolean;
	error: ZodIssue[];
};

export type Props = { error: ZodIssue[]; loading?: boolean };

export type Emits = {
	(e: 'login', inputs: Omit<States, 'error'>): void;
};

const props = defineProps<Props>();

const emits = defineEmits<Emits>();

const states = reactive<States>({
	email: '',
	password: '',
	remember: false,
	error: props.error,
});

onUpdated(() => {
	states.error = props.error;
});

function onLogin() {
	const { error, ...rest } = states;
	emits('login', rest);
}

function computedError(type: keyof States) {
	return computed(() => {
		return states.error.find((e) => e.path[0] === type)?.message;
	}).value;
}

function clearError(type: keyof States) {
	states.error.forEach((e) => {
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
					:error="computedError('email')"
					@update:model-value="clearError('email')"
				/>

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
				<Button :label="'Login'" :loading="props.loading" @click="onLogin" />
			</div>

			<!-- dont have an account yet -->
			<div class="flex justify-between">
				<p>Don't have an account yet?</p>
				<router-link to="/register" class="link">Register</router-link>
			</div>
		</div>
	</div>
</template>
