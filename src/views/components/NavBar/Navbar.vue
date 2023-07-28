<script setup lang="ts">
import { useUserStore } from '../../store/user.store';

const userStore = useUserStore();

async function logout() {
	try {
		await userStore.logout();
	} catch (error) {
		await userStore.logout();
	}
}
</script>

<template>
	<div class="navbar bg-base-100">
		<div class="flex-1">
			<!-- <router-link class="btn btn-ghost normal-case text-xl" to="/dashboard"> Bang </router-link> -->
		</div>
		<div class="flex-none gap-2">
			<div class="form-control">
				<input type="text" placeholder="Search" class="input input-sm input-bordered w-24 md:w-auto" />
			</div>
			<div class="dropdown dropdown-end">
				<label tabindex="0" class="btn btn-ghost btn-circle avatar">
					<div class="w-10 rounded-full bg-neutral"></div>
				</label>
				<ul tabindex="0" class="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52">
					<li>
						<router-link to="/dashboard/profile"
							:class="[$route.path.startsWith('/dashboard/profile') ? 'active' : '']">
							<i-ic:outline-person />
							Profile
						</router-link>
					</li>

					<div class="divider my-0"></div>

					<li @click="logout">
						<span class="text-error">
							<i-ic:outline-logout />
							Logout
						</span>
					</li>
				</ul>
			</div>
		</div>
	</div>
</template>
