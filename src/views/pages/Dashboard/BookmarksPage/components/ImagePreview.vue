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
		<!-- if no image -->
		<div v-if="!props.bookmark.image_url" class="avatar">
			<div class="mask mask-square w-12 h-12 border-[1px] border-gray-200 bg-neutral-100"></div>
		</div>

		<!-- if image -->
		<div
			@mouseenter="toggleHover"
			@mouseleave="toggleHover"
			v-if="props.bookmark.image_url"
			class="avatar"
		>
			<div class="mask mask-square w-12 h-12 border-[1px] border-gray-200">
				<img :src="props.bookmark.image_url" :alt="props.bookmark.title" />
			</div>
		</div>

		<!-- preview -->
		<div class="relative" v-if="props.bookmark.image_url && states.hovered">
			<img
				class="fixed h-56 z-10 p-2 bg-white rounded-lg shadow-lg"
				:src="props.bookmark.image_url"
				:alt="props.bookmark.title"
			/>
		</div>
	</div>
</template>
