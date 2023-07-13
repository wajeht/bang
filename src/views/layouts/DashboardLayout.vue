<script setup lang="ts"></script>

<template>
	<div class="h-screen flex">
		<Sidebar />
		<div class="bg-base-200 w-full">
			<Navbar />
			<div class="p-7">
				<slot />
			</div>
		</div>
	</div>
</template>
