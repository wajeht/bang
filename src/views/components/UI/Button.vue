<script setup lang="ts">
export type Props = {
	label: string;
	loading?: boolean;
	loadingLabel?: string
	disabled?: boolean;
	class?: string;
};

const props = withDefaults(defineProps<Props>(), {
});
</script>

<template>
	<button :class="[props.class, 'btn']" :disabled="props.disabled">
		<span v-if="props.loading" class="loading loading-spinner"></span>
		<span v-if="props.loading && props.loadingLabel">{{ props.loadingLabel }}</span>
		<span v-if="!props.loading"> {{ props.label }} </span>
	</button>
</template>
