<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import type { Props as AlertType } from '../components/Alert/Alert.vue';
import { useRouteQuery } from '@vueuse/router';
import { reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

type Status = 'success' | 'error' | 'idle' | 'loading';

export type States = {
	token: string;
	status: Status;
	email: string;
	alert: AlertType;
};

const states = reactive<States>({
	token: '',
	status: 'idle',
	email: '',
	alert: {} as AlertType,
});

onMounted(async () => {
	const email = useRouteQuery('email');
	const token = useRouteQuery('token');

	if (!token.value?.length || !email.value?.length) {
		states.alert = {
			type: 'error',
			message: 'Invalid token or email!',
			icon: true,
		};
		states.status = 'error';
		return;
	}

	if (token.value && email.value) {
		states.token = token.value as string;
		states.email = email.value as string;
	}

	await verifyEmail();
});

const computedAlertExists = computed(() => {
	return Object.values(states.alert).some((e) => {
		if (typeof e === 'string') {
			return e.length > 0;
		}
		if (typeof e === 'boolean') {
			return e;
		}
		return false;
	});
});

const computedTitleLang = computed(() => {
	switch (states.status) {
		case 'success':
			return 'Verification successful';
		case 'error':
			return 'Verification failed';
		case 'loading':
			return 'Verifying email...';
		case 'idle':
			return 'Verify Email';
		default:
			return 'Verify Email';
	}
});

async function verifyEmail() {
	try {
		states.status = 'loading';

		await new Promise((resolve) => setTimeout(resolve, 2000));

		await axios.post('/api/v1/auth/verify-email', {
			token: states.token,
			email: states.email,
		});

		states.status = 'success';

		states.alert = {
			type: 'success',
			message:
				'Email verified successfully. We are redirecting you to the login page in a few seconds!',
			icon: true,
		};

		setTimeout(() => router.push('/login'), 5000);
	} catch (error) {
		if (error instanceof AxiosError) {
			states.status = 'error';

			if (error.response?.status && error.response.status >= 500) {
				states.alert = {
					type: 'error',
					message: 'Something went wrong, please try again later!',
					icon: true,
				};
				return;
			}

			if (error.response?.status && error.response.status >= 400) {
				if (
					error.response.data?.error &&
					error.response.data?.error.length === 1 &&
					error.response.data?.error[0]?.code === 'custom' &&
					error.response.data?.error[0].path.length === 1 &&
					error.response.data?.error[0]?.path[0] === 'alert'
				) {
					states.alert = {
						type: 'error',
						message: error?.response?.data?.error[0]?.message ?? error.response.data?.message,
						icon: true,
					};
					return;
				}
			}
		}
	} finally {
	}
}
</script>

<template>
	<RegularLayout>
		<div class="flex flex-col w-full items-center gap-6">
			<div class="w-full max-w-[400px] flex flex-col gap-6">
				<!-- error -->
				<Alert
					v-if="computedAlertExists"
					:type="states.alert.type"
					:message="states.alert.message"
					:icon="states.alert.icon"
				/>

				<!-- card -->
				<div class="card bg-base-100 shadow-xl gap-10">
					<!-- body -->
					<div class="card-body gap-6 text-center flex flex-col items-center">
						<i-tabler:mail
							v-if="states.status === 'idle' || states.status === 'loading'"
							style="font-size: xx-large"
						/>
						<i-tabler:mail-check v-if="states.status === 'success'" style="font-size: xx-large" />
						<i-tabler:mail-cancel v-if="states.status === 'error'" style="font-size: xx-large" />
						<!-- title -->
						<h2 class="card-title">{{ computedTitleLang }}</h2>
					</div>
				</div>
			</div>
		</div>
	</RegularLayout>
</template>
