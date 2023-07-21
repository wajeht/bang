<script setup lang="ts">
import { ZodIssue } from 'zod';

export type States = {
	username: string;
	email: string;
	password: string;
	agree: boolean;
	error: ZodIssue[];
};

export type Props = { error: ZodIssue[]; loading?: boolean };

export type Emits = { (e: 'register', inputs: Omit<States, 'error'>): void };

const props = defineProps<Props>();

const emits = defineEmits<Emits>();

const states = reactive<States>({
	username: '',
	email: '',
	password: '',
	agree: false,
	error: props.error,
});

onUpdated(() => {
	states.error = props.error;
});

function clear() {
	states.username = '';
	states.email = '';
	states.password = '';
	states.agree = false;
	states.error = [];
}

function onRegister() {
	const { error, ...rest } = states;
	emits('register', rest);
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

watch(
	() => props.loading,
	(prev, curr) => {
		if (prev === true && curr === false) {
			clear();
		}
	},
	{ immediate: true },
);
</script>

<template>
	<div class="card w-full max-w-[400px] bg-base-100 shadow-xl gap-10">
		<!-- login card -->
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
					:disabled="props.loading"
					:error="computedError('username')"
				/>

				<!-- email -->
				<FormInput
					v-model="states.email"
					type="email"
					label="Email"
					placeholder="email@domain.com"
					:disabled="props.loading"
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
					:disabled="props.loading"
					autocomplete="current-password"
					:error="computedError('password')"
					@update:model-value="clearError('password')"
				/>

				<div class="flex flex-col mt-2 gap-1">
					<!-- agree -->
					<div class="w-fit">
						<label :class="[props.loading ? '' : 'cursor-pointer', 'label gap-2 justify-start']">
							<input
								type="checkbox"
								:disabled="props.loading"
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
				<Button :label="'Register'" :loading="props.loading" @click="onRegister" />
			</div>

			<!-- already have an account -->
			<div class="flex justify-between">
				<p>Already have an account?</p>
				<router-link to="/login" class="link">Login</router-link>
			</div>
		</div>
	</div>
</template>
