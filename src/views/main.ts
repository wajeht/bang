import { autoAnimatePlugin } from '@formkit/auto-animate/vue';

import { createApp, markRaw } from 'vue';
import { createPinia } from 'pinia';

import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import router from './router';
import App from './App.vue';

import './tailwind.css';

const pinia = createPinia();

const app = createApp(App);

pinia.use(({ store }) => {
	store.router = markRaw(router);
});

app.use(pinia);
app.use(router);
app.use(autoAnimatePlugin);
pinia.use(piniaPluginPersistedstate);

app.mount('#app');
