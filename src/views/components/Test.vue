<script setup lang="ts">
type Props = { name: string };
const props = defineProps<Props>();
</script>

<template>
	{{ props.name }}
</template>
