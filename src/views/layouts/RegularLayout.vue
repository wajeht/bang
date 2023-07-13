<script setup lang="ts">
type Props = { class?: string };
const props = withDefaults(defineProps<Props>(), { class: 'bg-base-200' });
</script>

<template>
	<div
		:class="[
			props.class,
			'flex flex-col p-7 justify-between items-center h-screen overflow-y-scroll scroll-smooth gap-10',
		]"
	>
		<div></div>

		<slot />

		<Footer />
	</div>
</template>
