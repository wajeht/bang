<script setup lang="ts">
import { Fireworks } from '@fireworks-js/vue';
import type { FireworksOptions } from '@fireworks-js/vue';

const mounted = ref(true);
const fw = ref<InstanceType<typeof Fireworks>>();
const options = ref<FireworksOptions>({
	opacity: 0.5,
	brightness: {
		min: 1,
		max: 100,
	},
});

async function startFireworks() {
	if (!fw.value) return;
	fw.value.start();
	await new Promise((resolve) => setTimeout(resolve, 1000));
	await fw.value.waitStop();
}

watch(fw, () => startFireworks());
</script>

<template>
	<RegularLayout class="bg-transparent">
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

			<!-- fireworks -->
			<Fireworks
				ref="fw"
				v-if="mounted"
				:autostart="true"
				:options="options"
				:style="{
					top: 0,
					left: 0,
					width: '100%',
					height: '100%',
					background: '#F2F2F2',
					position: 'fixed',
					'z-index': -1,
				}"
			/>
		</div>
	</RegularLayout>
</template>
