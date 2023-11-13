<script setup lang="ts">
import { ZodIssue } from 'zod';
import { axios, AxiosError } from '@/views/utils';
import { useUserStore } from '@/views/store/user.store';
import { computed, reactive, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';

const userStore = useUserStore();
const router = useRouter();

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

type Props = { url?: string };

const props = defineProps<Props>();

type Emits = { (e: 'add', bookmark: any): void };

const emits = defineEmits<Emits>();

async function getUrlInfo(url: string): Promise<any> {
	try {
		const { data } = await axios.get(`/api/v1/bangs//url?url=${url}`);
		return data.data[0];
	} catch (error: unknown | AxiosError) {
		if (error instanceof AxiosError) {
			if (error.response?.status && error.response.status >= 400) {
				states.error = error.response?.data.error;
			}
		}
	} finally {
		states.loading = false;
	}
}

async function syncUrlInfo(url: string): Promise<void> {
	try {
		let modifiedUrl = url;

		if (!modifiedUrl.includes('http')) {
			modifiedUrl = `https://${url}`;
		}

		const urlInfo = await getUrlInfo(modifiedUrl);
		states.url = urlInfo.url ?? '';
		states.title = urlInfo.title ?? '';
		states.favicon_url = urlInfo.favicon_url ?? '';
		states.description = urlInfo.description ?? '';
	} catch (error) {
		throw error;
	}
}

onMounted(() => {
	nextTick(async () => {
		if (props.url) {
			await syncUrlInfo(props.url);
			states.expanded = true;
			toggleModal();
		}
	});
});

function clearStates(): void {
	states.title = '';
	states.url = '';
	states.favicon_url = '';
	states.description = '';
}

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

function clearError(type: keyof States): void {
	states.error.forEach((e) => {
		if (e.path.length === 0 && e.code === 'custom') {
			states.error.splice(states.error.indexOf(e), 1);
		}

		if (e.path[0] === type) {
			states.error.splice(states.error.indexOf(e), 1);
		}
	});
}

async function add(): Promise<void> {
	states.loading = true;

	if (!states.expanded && states.url) {
		try {
			await syncUrlInfo(states.url);
		} catch (error) {
			states.loading = false;
			return;
		}
		states.expanded = true;
		states.loading = false;
		return;
	}

	try {
		const post = {
			title: states.title,
			url: states.url,
			favicon_url: states.favicon_url,
			description: states.description,
			// @ts-ignore
			user_id: userStore.user?.id,
		};

		if (post.description === '' || post.description === null) {
			// @ts-ignore
			delete post.description;
		}

		if (post.favicon_url === '' || post.favicon_url === null) {
			// @ts-ignore
			delete post.favicon_url;
		}

		const { data } = await axios.post('/api/v1/bookmarks', post);

		clearStates();

		router.replace(`/dashboard/bookmarks`); // clear the ?url query param

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

function toggleModal(): void {
	states.showModal = !states.showModal;
	if (!states.showModal) {
		setTimeout(() => {
			states.expanded = false;
		}, 300);
	}
}

const computedAddButtonLang = computed(() => {
	if (states.expanded) {
		return 'Add';
	}

	return 'Next';
});
</script>

<template>
	<Button @click="toggleModal" class="btn-neutral btn-xs">
		<i-gridicons:add-outline />
	</Button>

	<div class="modal" :class="{ 'modal-open': states.showModal }">
		<div class="modal-box">
			<!-- title -->
			<h3 class="font-bold text-lg">Add Bookmark</h3>

			<!-- form -->
			<div class="py-4 form-control w-full gap-2">
				<!-- title -->
				<FormInput
					v-if="states.expanded"
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
					v-if="states.expanded"
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
					v-if="states.expanded"
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
				<Button label="Cancel" @click="toggleModal" :disabled="states.loading" />
				<Button
					:label="computedAddButtonLang"
					@click="add"
					:disabled="states.loading"
					:loading="states.loading"
					loading-label="Loading..."
					class="btn-neutral"
				/>
			</div>
		</div>
	</div>
</template>
