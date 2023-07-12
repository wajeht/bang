<template>
	<div class="card w-full max-w-[400px] bg-base-100 shadow-xl gap-10">
		<div class="card-body gap-6">
			<h2 class="card-title">Forgot password</h2>
			<div class="form-control w-full gap-2">
				<!-- email -->
				<div>
					<label class="label">
						<span class="label-text">Email</span>
					</label>
					<input type="email" placeholder="email@mail.com" class="input input-bordered w-full" />
				</div>
			</div>

			<!-- button -->
			<div class="flex flex-col gap-2">
				<button class="btn btn-neutral w-full">Reset</button>
				<button class="btn btn-outline w-full" @click="$router.go(-1)">Go back</button>
			</div>
		</div>
	</div>
</template>
