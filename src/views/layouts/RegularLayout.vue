<script setup lang="ts">
type Props = { class?: string };
const props = withDefaults(defineProps<Props>(), { class: 'bg-base-200' });
</script>

<template>
	<div :class="[props.class, 'h-screen flex flex-col p-7 justify-between items-center']">
		<div></div>

		<slot />

		<Footer />
	</div>
</template>
