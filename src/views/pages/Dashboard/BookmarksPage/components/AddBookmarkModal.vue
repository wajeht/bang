<script setup lang="ts">
import { ZodIssue } from 'zod';
import axios, { AxiosError } from 'axios';
import { useUserStore } from '../../../../store/user.store';
import { computed, reactive, onMounted, nextTick } from 'vue';

const userStore = useUserStore();

type States = {
	showModal: boolean;
	loading: boolean;
	error: ZodIssue[];
	title: string;
	url: string;
	favicon_url: string;
	description: string;
};

const states = reactive<States>({
	showModal: false,
	loading: false,
	error: [],
	title: '',
	url: '',
	favicon_url: '',
	description: '',
});

const props = defineProps<{ url?: string }>();

type Emits = { (e: 'add', bookmark: any): void };

const emits = defineEmits<Emits>();

async function getUrlInfo(
	url: string,
): Promise<{ title: string; url: string; description: string; favicon_url: string }> {
	try {
		const { data } = await axios.get(`/api/v1/bangs//url?url=${url}`);
		return data.data[0];
	} catch (error) {
		return {
			title: '',
			url: '',
			description: '',
			favicon_url: '',
		};
	}
}

onMounted(() => {
	nextTick(async () => {
		if (props.url) {
			const urlInfo = await getUrlInfo(props.url);

			states.url = props.url;
			states.title = urlInfo.title;
			states.favicon_url = urlInfo.favicon_url;
			states.description = urlInfo.description;

			toggleModal();
		}
	});
});

function computedError(type: keyof States): string | undefined {
	return computed(() => {
		return states.error.find((e) => {
			if (e.path.length === 0 && e.code === 'custom') {
				return e;
			}

			if (e.path[0] === type) {
				return e;
			}
		})?.message;
	}).value;
}

function clearError(type: keyof States) {
	states.error.forEach((e) => {
		if (e.path.length === 0 && e.code === 'custom') {
			states.error.splice(states.error.indexOf(e), 1);
		}

		if (e.path[0] === type) {
			states.error.splice(states.error.indexOf(e), 1);
		}
	});
}

async function add() {
	try {
		states.loading = true;

		const post = {
			title: states.title,
			url: states.url,
			favicon_url: states.favicon_url,
			description: states.description,
			user_id: userStore.user?.id,
		};

		if (post.description === '' || post.description === null) {
			delete post.description;
		}

		if (post.favicon_url === '' || post.favicon_url === null) {
			delete post.favicon_url;
		}

		const { data } = await axios.post('/api/v1/bookmarks', post);

		states.title = '';
		states.url = '';
		states.favicon_url = '';
		states.description = '';

		emits('add', data.data[0]);
		toggleModal();
	} catch (error) {
		if (error instanceof AxiosError) {
			if (error.response?.status && error.response.status >= 400) {
				states.error = error.response?.data.error;

				return;
			}
		}
	} finally {
		states.loading = false;
	}
}

function toggleModal() {
	states.showModal = !states.showModal;
}
</script>

<template>
	<button class="btn-xs btn-neutral rounded-md" @click="toggleModal">Add Bookmark</button>

	<div class="modal" :class="{ 'modal-open': states.showModal }">
		<div class="modal-box">
			<!-- title -->
			<h3 class="font-bold text-lg">Add Bookmark</h3>

			<!-- form -->
			<div class="py-4 form-control w-full gap-2">
				<!-- title -->
				<FormInput
					v-model="states.title"
					type="text"
					label="Title"
					placeholder="title"
					:required="true"
					:disabled="states.loading"
					:error="computedError('title')"
					@update:model-value="clearError('title')"
				/>

				<!-- url -->
				<FormInput
					v-model="states.url"
					type="url"
					label="URL"
					:required="true"
					placeholder="example.com"
					:disabled="states.loading"
					:error="computedError('url')"
					@update:model-value="clearError('url')"
				/>

				<!-- favicon_url -->
				<FormInput
					v-model="states.favicon_url"
					type="url"
					label="Favicon URL"
					:url-icon="true"
					placeholder="example.com/favicon.ico"
					:disabled="states.loading"
					:error="computedError('favicon_url')"
					@update:model-value="clearError('favicon_url')"
				/>

				<!-- description -->
				<FormInput
					v-model="states.description"
					type="textarea"
					label="Description"
					placeholder="description"
					:disabled="states.loading"
					:error="computedError('description')"
					@update:model-value="clearError('description')"
				/>
			</div>

			<!-- button actions -->
			<div class="modal-action">
				<button :disabled="states.loading" class="btn btn-ghost" @click="toggleModal">
					Cancel
				</button>
				<button :disabled="states.loading" class="btn btn-neutral" @click="add">Add</button>
			</div>
		</div>
	</div>
</template>
