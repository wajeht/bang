import { createApp } from 'vue';

import pinia from './store/store';
import router from './router';
import App from './App.vue';
import './tailwind.css';

const app = createApp(App);

app.use(router);
app.use(pinia);

app.mount('#app');
