<script setup lang="ts">
import { reactive, ref } from 'vue';

const name = ref('name');

type Props = { name: string };
const props = defineProps<Props>();
</script>

<template>
	{{ props.name }}
</template>
