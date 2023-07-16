<template>
	<div class="card w-full max-w-[400px] bg-base-100 shadow-xl gap-10">
		<!-- login card -->
		<div class="card-body gap-6">
			<!-- title -->
			<h2 class="card-title">Register</h2>
			<!-- form -->
			<div class="form-control w-full gap-2">
				<!-- username -->
				<div>
					<label class="label">
						<span class="label-text">Username</span>
					</label>
					<input type="email" placeholder="username" class="input input-bordered w-full" />
				</div>

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

				<div class="flex flex-col mt-2 gap-1">
					<!-- agree -->
					<label class="label cursor-pointer gap-2 justify-start">
						<input type="checkbox" :checked="false" class="checkbox" />
						<span class="label-text text-base">I agree</span>
					</label>

					<!-- notice -->
					<div class="text-sm pl-1">
						Signing up signifies that you have read and agree to the
						<RouterLink to="/terms-of-service" class="link">Terms of Service</RouterLink>
						and our
						<RouterLink to="/privacy-policy" class="link">Privacy Policy</RouterLink>.
					</div>
				</div>
			</div>

			<!-- button -->
			<div class="flex flex-col gap-2">
				<button class="btn btn-neutral w-full" @click="$router.push('/login')">Register</button>
			</div>

			<!-- already have an account -->
			<div class="flex justify-between">
				<p>Already have an account?</p>
				<router-link to="/login" class="link">Login</router-link>
			</div>
		</div>
	</div>
</template>
