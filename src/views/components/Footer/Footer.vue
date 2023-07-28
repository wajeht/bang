<script setup lang="ts">
import { computed } from 'vue';

const currentYear = computed(() => {
	return new Date().getFullYear();
});
</script>

<template>
	<div class="flex flex-col gap-5 justify-center items-center text-center">
		<!-- links -->
		<div class="flex gap-3 text-neutral-700 text-xs">
			<RouterLink to="/" title="Privacy Policy"> Home </RouterLink>
			<RouterLink to="/learn-more" title="Learn More"> About </RouterLink>
			<RouterLink to="/privacy-policy" title="Privacy Policy"> Privacy </RouterLink>
			<RouterLink to="/terms-of-service" title="Terms of Service"> Terms </RouterLink>
			<a href="http://github.com/wajeht/bang" target="_blank"> Github </a>
		</div>

		<!-- copy righty -->
		<p class="text-sm">
			Copyright © {{ currentYear }}
			<RouterLink to="/" title="Privacy Policy"> bang.jaw.dev </RouterLink>
			. All rights reserved. Made with ❤️ by
			<a href="http://github.com/wajeht" target="_blank"> @wajeht ↗️ </a>
		</p>
	</div>
</template>
