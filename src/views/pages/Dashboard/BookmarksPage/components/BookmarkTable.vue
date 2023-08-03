<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import { reactive, onMounted } from 'vue';
import { useUrlSearchParams } from '@vueuse/core';
import type { Bookmark } from '@/types';
import { formatDate } from '@/views/utils';

const states = reactive({
    loading: false,
    error: '',
    bookmarks: [] as Bookmark[],
    url: '',
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

function addBookmark(bookmark: any): void {
    states.bookmarks.unshift(bookmark as never);
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

const computedDate = (date: Date): string => {
    return formatDate(date);
};
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- header -->
        <div class="flex justify-between">
            <h1 class="text-black text-xl font-semibold">Bookmarks</h1>


            <div class="flex gap-2 items-center">

            <!-- search -->
            <div class="form-control">
                <input type="text" placeholder="Search" class="input input-sm input-bordered w-24 md:w-auto" />
            </div>

            <!-- header actions -->
            <div class="flex gap-2">
                <AddBookmarkModal :url="states.url" @add="addBookmark" />
                <Button class="btn-neutral btn-xs" label="Filter" />
                <Button class="btn-neutral btn-xs" label="Delete" />
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
                            <input type="checkbox" class="checkbox checkbox-xs" />
                        </th>
                        <th>Title</th>
                        <th>Url</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- row -->
                    <tr v-for="bookmark in states.bookmarks" :key="bookmark.id">
                        <!-- checkbox -->
                        <th class="align-top">
                            <input type="checkbox" class="checkbox checkbox-xs" />
                        </th>

                        <!-- title -->
                        <td class="align-top">
                            <div class="flex items-center space-x-3">
                                <div v-if="bookmark.image_url" class="avatar">
                                    <div class="mask mask-squircle w-12 h-12">
                                        <img :src="bookmark.image_url" :alt="bookmark.title" />
                                    </div>
                                </div>
                                <div>
                                    <div class="font-semibold">{{ bookmark.title }}</div>
                                    <div v-if="bookmark.description" class="text-sm opacity-60">{{ bookmark.description }}
                                    </div>
                                </div>
                            </div>
                        </td>

                        <!-- url -->
                        <td class="align-top">
                            <a :href="bookmark.url" target="_blank" rel="noopener noreferrer"
                                class="flex gap-2 items-center">
                                <i-material-symbols:warning-outline v-if="!bookmark.favicon_url" class="w-[14.5px]" />
                                <img v-else :src="bookmark.favicon_url!" :alt="bookmark.title" class="h-4 w-4" />
                                <p class="italic truncate max-w-xs">{{ bookmark.url }}</p>
                            </a>
                        </td>

                        <!-- date -->
                        <td class="align-top">
                            {{ computedDate(bookmark.created_at) }}</td>

                        <!-- actions -->
                        <td class="align-top">
                            <div class="flex gap-2">
                                <Button class="btn-neutral btn-xs" label="Edit" />
                                <Button class="btn-neutral btn-xs" label="Delete" />
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
