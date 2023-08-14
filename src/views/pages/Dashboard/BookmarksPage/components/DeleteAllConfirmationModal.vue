<script setup lang="ts">
import { ZodIssue } from 'zod';
import { useUserStore } from '@/views/store/user.store';
import {  reactive } from 'vue';
import { useRouter } from 'vue-router';


type States = {
	showModal: boolean;
	loading: boolean;
	error: ZodIssue[];
	title: string;
	url: string;
	favicon_url: string;
	description: string;
	expanded: boolean;
};

const states = reactive<States>({
	showModal: false,
	loading: false,
	error: [],
	title: '',
	url: '',
	expanded: false,
	favicon_url: '',
	description: '',
});

function toggleModal(): void {
	states.showModal = !states.showModal;
	if (!states.showModal) {
		setTimeout(() => {
			states.expanded = false;
		}, 300);
	}
}

</script>

<template>
	<Button @click="toggleModal" class="btn-neutral btn-xs">
        <i-iconamoon:trash />
	</Button>

	<div class="modal" :class="{ 'modal-open': states.showModal }">
		<div class="modal-box">
			<!-- title -->
			<h3 class="font-bold text-lg">Confirm Bookmark</h3>

			<!-- form -->
			<div class="py-4 form-control w-full gap-2">
                <!-- // modal content -->
			</div>

			<!-- button actions -->
			<div class="modal-action">
				<Button label="Cancel" @click="toggleModal" :disabled="states.loading" />
				<Button
					label="Delete"
					@click="()=> {}"
					:disabled="states.loading"
					:loading="states.loading"
					loading-label="Loading..."
					class="btn-neutral"
				/>
			</div>
		</div>
	</div>
</template>
