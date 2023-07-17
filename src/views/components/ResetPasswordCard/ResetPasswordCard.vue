<script setup lang="ts">
import { ZodIssue } from 'zod';

export type States = {
	email: string;
	password: string;
	confirmPassword: string;
	error: ZodIssue[];
};

export type Props = { error: ZodIssue[]; loading?: boolean };

export type Emits = {
	(e: 'reset-password', inputs: Omit<States, 'error'>): void;
};

const props = defineProps<Props>();

const emits = defineEmits<Emits>();

const states = reactive<States>({
	email: '',
	password: '',
	confirmPassword: '',
	error: props.error,
});

onUpdated(() => {
	states.error = props.error;
});

function onSubmit() {
	const { error, ...rest } = states;
	emits('reset-password', rest);
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
				<Button :label="'Submit'" :loading="props.loading" @click="onSubmit" />
			</div>
		</div>
	</div>
</template>
