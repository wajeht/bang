<script setup lang="ts">
export type Props = {
	type: 'success' | 'info' | 'warning' | 'error';
	icon?: boolean;
	message: string;
};

const props = defineProps<Props>();

const computedClass = computed(() => {
	switch (props.type) {
		case 'success':
			return 'alert-success';
		case 'info':
			return 'alert-info';
		case 'warning':
			return 'alert-warning';
		case 'error':
			return 'alert-error';
	}
});
</script>

<template>
	<div :class="[computedClass, 'alert']">
		<i-material-symbols:info-outline v-if="props.icon && props.type === 'info'" />
		<i-material-symbols:check-circle-outline-rounded
			v-if="props.icon && props.type === 'success'"
		/>
		<i-material-symbols:warning-outline v-if="props.icon && props.type === 'warning'" />
		<i-material-symbols:dangerous-outline v-if="props.icon && props.type === 'error'" />
		<span>{{ props.message }}</span>
	</div>
</template>
