import { createApp } from 'vue';
import { createPinia } from 'pinia';

import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import router from './router';
import App from './App.vue';

import './tailwind.css';

const pinia = createPinia();

const app = createApp(App);

app.use(router);
app.use(pinia);
pinia.use(piniaPluginPersistedstate);

app.mount('#app');
