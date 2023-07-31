<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import axios from 'axios';
import z from 'zod'

export type InputTypes = 'text' | 'email' | 'password' | 'checkbox' | 'number' | 'textarea' | 'url';

export type Props = {
	modelValue: string;
	error?: string;
	label?: string;
	type: InputTypes;
	placeholder?: string;
	required?: boolean;
	urlIcon?: boolean;
	disabled?: boolean;
	autocomplete?: string;
};

export type Emits = { (e: 'update:modelValue', value: string): void };

const emits = defineEmits<Emits>();
const props = defineProps<Props>();
const states = reactive({
	password: false,
	validFaviconUrl: false,
	validatingFaviconUrl: false,
});

const computedValidationInputErrorClass = computed(() => {
	return props.error ? `${props.type !== 'textarea' ? 'input-error' : 'textarea-error'}` : '';
});

const computedValidationLabelErrorClass = computed(() => {
	return props.error ? 'text-error' : '';
});

const computedPasswordType = computed(() => {
	return props.type === 'password' && props.modelValue.length;
});

function onInput(event: Event) {
	const target = event.target as HTMLInputElement;
	emits('update:modelValue', target.value);
}

function togglePassword() {
	states.password = !states.password;
}

async function validateFaviconUrl() {

	const urlSchema = z.string().url();
	try {
		urlSchema.parse(props.modelValue);
	} catch (error) {
		return;
	}

	await new Promise((resolve) => setTimeout(resolve, 1000));

	states.validatingFaviconUrl = true;
	try {
		await axios.get(props.modelValue);
		states.validFaviconUrl = true;
		states.validatingFaviconUrl = false;
	} catch (error) {
		states.validFaviconUrl = false;
		states.validatingFaviconUrl = false;
	}
}

watch(
	() => props.modelValue,
	async () => {
		if (props.urlIcon) {
			await validateFaviconUrl();
		}
	},
);
</script>

<template>
	<div class="form-control w-full">
		<!-- label -->
		<label v-if="props.label" :class="['label']">
			<span class="label-text"
				>{{ props.label }} <span class="text-error" v-if="props.required">*</span></span
			>
		</label>

		<!-- textarea -->
		<textarea
			v-if="props.type === 'textarea'"
			:class="[computedValidationInputErrorClass, 'textarea textarea-bordered w-full text-[1rem]']"
			:value="props.modelValue"
			@input="onInput"
			:placeholder="props.placeholder"
			:disabled="props.disabled"
			:autocomplete="props.autocomplete"
		/>

		<!-- url -->
		<label v-if="props.type === 'url'" class="input-group">
			<input
				type="url"
				:value="props.modelValue"
				@input="onInput"
				:placeholder="props.placeholder"
				:autocomplete="props.autocomplete"
				:disabled="props.disabled"
				:class="[computedValidationInputErrorClass, 'input input-bordered w-full rounded-l-md']"
			/>
			<span v-if="props.urlIcon">
				<div v-if="states.validatingFaviconUrl" class="loading loading-spinner w-[14.5px]" />
				<img
					v-if="states.validFaviconUrl && !states.validatingFaviconUrl"
					class="w-[16px]"
					:src="props.modelValue"
					alt="favicon"
				/>
				<i-material-symbols:warning-outline
					v-if="!states.validatingFaviconUrl && !states.validFaviconUrl"
					class="w-[14.5px]"
				/>
			</span>
		</label>

		<!-- input -->
		<div v-if="props.type !== 'textarea' && props.type !== 'url'" class="relative">
			<input
				:type="props.type === 'password' && states.password ? 'text' : props.type"
				:value="props.modelValue"
				@input="onInput"
				:placeholder="props.placeholder"
				:autocomplete="props.autocomplete"
				:disabled="props.disabled"
				:class="[
					computedValidationInputErrorClass,
					props.type === 'password' ? 'pr-10' : '',
					'input input-bordered w-full',
				]"
			/>

			<!-- password -->
			<div
				role="button"
				v-if="computedPasswordType"
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
