<script setup lang="ts"></script>

<template>
	<RegularLayout class="flex flex-col gap-6">
		<!-- login -->
		<LoginCard />

		<!-- or -->
		<Or />

		<!-- social login -->
		                                                                                        <SocialLoginCard :register-with-email-button="true" />
	</RegularLayout>
</template>
