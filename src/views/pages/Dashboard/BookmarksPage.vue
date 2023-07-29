<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import { reactive, onMounted } from 'vue';

const states = reactive({
	loading: false,
	error: '',
	bookmarks: [],
});

onMounted(async () => {
	await getBookmarks();
});

async function refetchBookmarks() {
	await getBookmarks();
}

async function getBookmarks() {
	try {
		states.loading = true;
		const response = await axios.get('/api/v1/bookmarks');
		states.bookmarks = response.data.data;
	} catch (error) {
		if (error instanceof Error) {
			states.error = error.message;
			return;
		}

		if (error instanceof AxiosError) {
			states.error = error.response?.data.message;
			return;
		}
	} finally {
		states.loading = false;
	}
}
</script>

<template>
	<DashboardLayout>
		<div class="flex gap-2 items-center">
			<h1 class="text-black">Bookmarks Page</h1>
			<button @click="refetchBookmarks" class="btn-xs btn-neutral rounded-md">Refetch</button>
		</div>
		<div>
			<span v-if="states.loading" class="text-xs">Loading...</span>
			<span v-if="states.error" class="text-xs">{{ states.error }}</span>
			<pre v-if="!states.error && !states.loading" class="text-xs">{{ states.bookmarks }}</pre>
		</div>
	</DashboardLayout>
</template>
