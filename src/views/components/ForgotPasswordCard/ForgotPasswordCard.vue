<script setup lang="ts">
import { ZodIssue } from 'zod';

export type States = {
	email: string;
	error: ZodIssue[];
};

export type Props = { error: ZodIssue[]; loading?: boolean };

export type Emits = {
	(e: 'forgot-password', inputs: Omit<States, 'error'>): void;
};

const props = defineProps<Props>();

const emits = defineEmits<Emits>();

const states = reactive<States>({
	email: '',
	error: props.error,
});

onUpdated(() => {
	states.error = props.error;
});

function onSubmit() {
	const { error, ...rest } = states;
	emits('forgot-password', rest);
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
		<div class="card-body gap-6">
			<h2 class="card-title">Forgot password</h2>
			<div class="form-control w-full gap-2">
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
			</div>

			<!-- button -->
			<Button :label="'Submit'" :loading="props.loading" @click="onSubmit" />
		</div>
	</div>
</template>
