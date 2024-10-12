import { createMemoryHistory, createRouter } from 'vue-router'

import HomePage from './pages/Home.vue'

const routes = [
  { path: '/', component: HomePage },
]

export const router = createRouter({
  history: createMemoryHistory(),
  routes,
})
