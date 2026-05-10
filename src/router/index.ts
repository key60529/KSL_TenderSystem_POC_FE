import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/tender-template',
      name: 'tender-template',
      component: () => import('../views/TenderTemplateView.vue'),
    },
    {
      path: '/tender-validation',
      name: 'tender-validation',
      component: () => import('../views/TenderValidationView.vue'),
    },
  ],
})

export default router
