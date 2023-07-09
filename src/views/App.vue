<script setup lang="ts">
const states = reactive({ count: 0 });

const increment = () => {
  states.count++;
};
</script>

<template>
	<h1 className="text-3xl font-bold underline text-red-600">Hello world!</h1>
	<Test name="testing 1 2 trhee" />
	<i-lucide:align-justify />
	<i-carbon-accessibility />
	<i-mdi-account-box style="font-size: 2em; color: red" />

  <p>{{ states.count }}</p>
  <button @click="increment">Click</button>
</template>
