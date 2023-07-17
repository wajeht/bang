<script setup lang="ts">
export type InputTypes = 'text' | 'email' | 'password' | 'checkbox' | 'number';

export type Props = {
	modelValue: string;
	error?: string;
	label?: string;
	type: InputTypes;
	placeholder?: string;
	autocomplete?: string;
};

export type Emits = { (e: 'update:modelValue', value: string): void };

const emits = defineEmits<Emits>();
const states = reactive({ password: false });
const props = defineProps<Props>();

const computedValidationInputErrorClass = computed(() => {
	return props.error ? 'input-error' : '';
});

const computedValidationLabelErrorClass = computed(() => {
	return props.error ? 'text-error' : '';
});

function onInput(event: Event) {
	const target = event.target as HTMLInputElement;
	emits('update:modelValue', target.value);
}

function togglePassword() {
	states.password = !states.password;
}
</script>

<template>
	<div class="form-control w-full">
		<!-- label -->
		<label v-if="props.label" class="label">
			<span class="label-text">{{ props.label }}</span>
		</label>

		<!-- input -->
		<div class="relative">
			<input
				:type="props.type === 'password' && states.password ? 'text' : props.type"
				:value="props.modelValue"
				@input="onInput"
				:placeholder="props.placeholder"
				:autocomplete="props.autocomplete"
				:class="[computedValidationInputErrorClass, 'input input-bordered w-full pr-10']"
			/>

			<!-- password -->
			<div
				role="button"
				v-if="type === 'password'"
				class="absolute right-0 top-0 h-full flex items-center mr-3"
			>
				<i-bi:eye-slash v-if="states.password" @click="togglePassword" />
				<i-bi:eye v-if="!states.password" @click="togglePassword" />
			</div>
		</div>

		<!-- error -->
		<label v-if="props.error" class="label">
			<span :class="[computedValidationLabelErrorClass, 'label-text-alt']">{{ props.error }}</span>
		</label>
	</div>
</template>
