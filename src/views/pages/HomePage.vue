<script setup lang="ts"></script>

<template>
	<RegularLayout>
		<div class="flex flex-col items-center gap-7">
			<!-- title -->
			<h1 class="font-bold text-7xl">Bang</h1>

			<!-- description -->
			<p class="text-2xl text-center">
				centralized searching & synchronized cross-platform bookmarking system
			</p>

			<!-- button -->
			<div class="flex gap-4 mt-4">
				<RouterLink to="/learn-more" class="btn btn-outline">Learn more</RouterLink>
				<RouterLink to="/register" class="btn btn-neutral">Register</RouterLink>
			</div>
		</div>
	</RegularLayout>
</template>
