<script setup lang="ts">
export type Props = {
	label: string;
	loading?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
	loading: false,
});
</script>

<template>
	<button class="btn btn-neutral w-full" :disabled="props.loading">
		<span v-if="props.loading" class="loading loading-spinner"></span>
		<span v-else> {{ props.label }} </span>
	</button>
</template>
