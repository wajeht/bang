<script setup lang="ts"></script>

<template>
	<RegularLayout class="flex flex-col gap-6">
		<!-- login -->
		<RegisterCard />

		<!-- or -->
		<Or />

		<!-- social login -->
		<SocialLoginCard :login-with-email-button="true" />
	</RegularLayout>
</template>
