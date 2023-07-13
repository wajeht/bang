<script setup lang="ts"></script>

<template>
	<div class="h-screen flex flex-col">
		<Navbar />
		<div class="flex w-full h-full bg-base-200">
			<Sidebar />
			<div class="p-7">
				<slot class="" />
			</div>
		</div>
	</div>
</template>
