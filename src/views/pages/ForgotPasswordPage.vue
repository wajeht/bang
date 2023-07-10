<script setup lang="ts"></script>

<template>
	<RegularLayout class="flex flex-col gap-6">
		<!-- fotgot password -->
		<ForgotPasswordCard />

		<!-- or -->
		<Or />

		<!-- social login -->
		<SocialLoginCard
			:register-button="true"
			:login-button="true"
			:google-button="false"
			:github-button="false"
		/>
	</RegularLayout>
</template>
