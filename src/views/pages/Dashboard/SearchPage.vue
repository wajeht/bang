<script setup lang="ts">
import { ref } from 'vue';

const location = ref(window.location.href);
</script>

<template>
	<DashboardLayout>
		<h1 class="text-black">Search Page</h1>
		<pre>{{ location }}</pre>
	</DashboardLayout>
</template>
