<script setup lang="ts">
import type { Bookmark } from '@/types';
import { reactive } from 'vue';

type Props = { bookmark: Bookmark };
const props = defineProps<Props>();

const states = reactive({
	hovered: false,
});

function toggleHover(): void {
	states.hovered = !states.hovered;
}
</script>

<template>
	<div>
		<!-- preview -->
		<div class="relative" v-if="props.bookmark.image_url && states.hovered">
			<img
				class="fixed h-56 z-10 p-2 bg-white rounded-lg shadow-lg"
				:src="props.bookmark.image_url"
				:alt="props.bookmark.title"
			/>
		</div>

		<!-- mask -->
		<div v-if="props.bookmark.image_url" class="avatar">
			<div class="mask mask-square w-12 h-12 border-[1px] border-gray-200">
				<img
					@mouseover="toggleHover"
					@mouseleave="toggleHover"
					:src="props.bookmark.image_url"
					:alt="props.bookmark.title"
				/>
			</div>
		</div>
	</div>
</template>
