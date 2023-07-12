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
			<h2 class="card-title">Reset Password</h2>
			<!-- form -->
			<div class="form-control w-full gap-2">
				<!-- password -->
				<div>
					<label class="label">
						<span class="label-text">Password</span>
					</label>
					<input type="password" placeholder="************" class="input input-bordered w-full" />
				</div>

				<!-- confirm password -->
				<div>
					<label class="label">
						<span class="label-text">Confirm Password</span>
					</label>
					<input type="password" placeholder="************" class="input input-bordered w-full" />
				</div>
			</div>

			<!-- button -->
			<div class="flex flex-col gap-2">
				<button @click="goToDashboardPage" class="btn btn-neutral w-full">Reset</button>
			</div>
		</div>
	</div>
</template>
