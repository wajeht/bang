<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import { reactive, onMounted, computed } from 'vue';
import { useUrlSearchParams } from '@vueuse/core';
import type { Bookmark } from '@/types';
import { formatDate } from '@/views/utils';

const states = reactive({
	loading: false,
	error: '',
	search: '',
	bookmarks: [] as Bookmark[],
	url: '',
	check: {
		bookmarks: [] as Bookmark[],
		loading: false,
	},
});

onMounted(async () => {
	await getBookmarks();
});

onMounted(() => {
	const param = useUrlSearchParams();

	if (param.url !== undefined) {
		states.url = param.url as string;
	}
});

async function refetchBookmarks(): Promise<void> {
	await getBookmarks();
}

function addBookmark(bookmark: Bookmark): void {
	states.bookmarks.unshift(bookmark);
}

async function deleteBookmark(bookmark: Bookmark): Promise<void> {
	try {
		await axios.delete(`/api/v1/bookmarks/${bookmark.id}`, {
			data: {
				user_id: bookmark.user_id,
			},
		});
		states.bookmarks = states.bookmarks.filter((bm) => bm.id !== bookmark.id);
	} catch (error: unknown | AxiosError) {
		if (error instanceof Error) {
			states.error = error.message;
			return;
		}

		if (error instanceof AxiosError) {
			states.error = error.response?.data.message;
			return;
		}
	}
}

async function getBookmarks(): Promise<void> {
	try {
		states.loading = true;
		const response = await axios.get('/api/v1/bookmarks');
		states.bookmarks = response.data.data;
	} catch (error: unknown | AxiosError) {
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

const computedSearch = computed(() => {
	return states.bookmarks.filter((bookmark) => {
		const searchContent =
			bookmark.title +
			' ' +
			bookmark.url +
			' ' +
			bookmark.description +
			' ' +
			formatDate(bookmark.created_at);

		return searchContent.toLowerCase().includes(states.search.toLowerCase());
	});
});

const computedDate = (date: Date): string => {
	return computed(() => formatDate(date)).value;
};

async function deleteAllBookmarks() {
	states.check.loading = true;

	const results = await Promise.allSettled(
		states.check.bookmarks.map((bookmark) =>
			axios.delete(`/api/v1/bookmarks/${bookmark.id}`, {
				data: {
					user_id: bookmark.user_id,
				},
			}),
		),
	);

	const failedDeletions = results.filter((result) => result.status === 'rejected');

	if (failedDeletions.length) {
		// Assuming you want to show the first error message (you can change this logic as needed)
		// @ts-ignore
		const firstError = failedDeletions[0].reason;
		if (firstError instanceof Error) {
			states.error = firstError.message;
		} else if (firstError.response && firstError.response.data) {
			states.error = firstError.response.data.message;
		} else {
			states.error = 'An unknown error occurred.';
		}
	} else {
		// Only update the bookmarks state if all deletions were successful
		states.bookmarks = states.bookmarks.filter(
			(bookmark) => !states.check.bookmarks.some((bm) => bm.id === bookmark.id),
		);
	}

	states.check.loading = false;
}

function selectAllBookmarks() {
	if (states.check.bookmarks.length) {
		states.check.bookmarks = [];
		return;
	}

	states.check.bookmarks = states.bookmarks;
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<!-- header -->
		<div class="flex justify-between">
			<h1 class="text-black text-xl font-semibold">Bookmarks</h1>

			<div class="flex gap-2 items-center">
				<!-- search -->
				<div class="form-control">
					<input
						v-model="states.search"
						type="text"
						placeholder="Search"
						class="input input-sm input-bordered w-24 md:w-auto"
					/>
				</div>

				<!-- header actions -->
				<div class="flex gap-2">
					<AddBookmarkModal :url="states.url" @add="addBookmark" />
					<Button
						v-if="states.check.bookmarks.length > 0"
						class="btn-neutral btn-xs"
						@click="deleteAllBookmarks"
						:disabled="states.check.bookmarks.length === 0"
					>
						<i-iconamoon:trash />
					</Button>
					<Button class="btn-neutral btn-xs">
						<i-mdi:filter-multiple-outline />
					</Button>
				</div>
			</div>
		</div>

		<!-- table -->
		<div class="overflow-x-auto">
			<table class="table bg-white rounded-md">
				<!-- head -->
				<thead>
					<tr>
						<th>
							<input type="checkbox" class="checkbox checkbox-xs" @click="selectAllBookmarks" />
						</th>
						<th>Title</th>
						<th>Url</th>
						<th>Date</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<!-- row -->
					<tr v-for="bookmark in computedSearch" :key="bookmark.id">
						<!-- checkbox -->
						<th class="align-middle">
							<input
								type="checkbox"
								class="checkbox checkbox-xs"
								v-model="states.check.bookmarks"
								:value="bookmark"
							/>
						</th>

						<!-- title -->
						<td class="align-middle">
							<div class="flex items-center space-x-3">
								<ImagePreview :bookmark="bookmark" />
								<div>
									<div class="font-semibold">{{ bookmark.title }}</div>
									<div v-if="bookmark.description" class="text-sm opacity-60">
										{{ bookmark.description }}
									</div>
								</div>
							</div>
						</td>

						<!-- url -->
						<td class="align-middle">
							<a
								:href="bookmark.url"
								target="_blank"
								rel="noopener noreferrer"
								class="flex gap-2 items-center hover:underline"
							>
								<i-material-symbols:warning-outline
									v-if="!bookmark.favicon_url"
									class="w-[14.5px]"
								/>
								<img v-else :src="bookmark.favicon_url!" :alt="bookmark.title" class="h-4 w-4" />
								<p class="truncate max-w-xs" :title="bookmark.url">{{ bookmark.url }} ↗</p>
							</a>
						</td>

						<!-- date -->
						<td class="align-middle">
							{{ computedDate(bookmark.created_at) }}
						</td>

						<!-- actions -->
						<td class="align-middle">
							<div class="flex gap-2">
								<Button class="btn-neutral btn-xs">
									<i-iconamoon:edit-duotone />
								</Button>
								<Button class="btn-neutral btn-xs" @click="deleteBookmark(bookmark)">
									<i-iconamoon:trash />
								</Button>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>
