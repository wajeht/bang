<script setup lang="ts">
const router = useRouter();

function goToDashboardPage() {
	router.push('/dashboard');
}
</script>

<template>
	<div class="card w-full max-w-[400px] bg-base-100 shadow-xl gap-10">
		<!-- login card -->
		<div class="card-body gap-6">
			<!-- title -->
			<h2 class="card-title">Login</h2>
			<!-- form -->
			<div class="form-control w-full gap-2">
				<!-- email -->
				<div>
					<label class="label">
						<span class="label-text">Email</span>
					</label>
					<input type="email" placeholder="name@email.com" class="input input-bordered w-full" />
				</div>

				<!-- password -->
				<div>
					<label class="label">
						<span class="label-text">Password</span>
					</label>
					<input type="password" placeholder="************" class="input input-bordered w-full" />
				</div>

				<div class="flex justify-between items-center mt-1">
					<!-- remember -->
					<label class="label cursor-pointer gap-2">
						<input type="checkbox" :checked="false" class="checkbox checked:checkbox-primary" />
						<span class="label-text text-base">Remember me</span>
					</label>

					<!-- forgot -->
					<RouterLink to="/forgot-password" class="link hover:link-primary"
						>Forgot password?</RouterLink
					>
				</div>
			</div>

			<!-- button -->
			<div class="flex flex-col gap-2">
				<button @click="goToDashboardPage" class="btn btn-primary w-full">Login</button>
			</div>
		</div>
	</div>
</template>
