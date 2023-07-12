<script setup lang="ts">
type Props = {
	loginWithEmailButton?: boolean;
	registerWithEmailButton?: boolean;
	registerButton?: boolean;
	loginButton?: boolean;
	googleButton?: boolean;
	githubButton?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
	loginWithEmailButton: false,
	registerWithEmailButton: false,
	loginButton: false,
	registerButton: false,
	googleButton: true,
	githubButton: true,
});
</script>

<template>
	<div class="card w-full max-w-[400px] bg-base-100 shadow-xl gap-10">
		<div class="card-body gap-6">
			<!-- button -->
			<div class="flex flex-col gap-2">
				<!-- login -->
				<RouterLink v-if="props.loginButton" to="/login">
					<button class="btn btn-neutral w-full">
						<i-mdi:email-outline />
						Login
					</button>
				</RouterLink>

				<!-- register -->
				<RouterLink v-if="props.registerButton" to="/login">
					<button class="btn w-full">
						<i-mdi:email-outline />
						Register
					</button>
				</RouterLink>

				<!-- google -->
				<button
					v-if="props.googleButton"
					class="btn bg-white border border-neutral-200 hover:bg-neutral-200 w-full"
				>
					<i-devicon:google />
					Login with Google
				</button>

				<!-- login email -->
				<RouterLink v-if="props.loginWithEmailButton" to="/login">
					<button class="btn w-full btn-neutral">
						<i-mdi:email-outline />
						Login with Email
					</button>
				</RouterLink>

				<!-- signup email -->
				<RouterLink v-if="props.registerWithEmailButton" to="/register">
					<button class="btn w-full btn-neutral">
						<i-mdi:email-outline />
						Sign up with Email
					</button>
				</RouterLink>

				<!-- github -->
				<button
					v-if="props.githubButton"
					class="btn bg-green-700 hover:bg-green-800 text-white w-full"
				>
					<i-mdi:github style="color: white" />
					Login with Github
				</button>
			</div>
		</div>
	</div>
</template>
