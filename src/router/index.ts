import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getAuthToken } from '../services/loginService'
import LoginView from '../views/LoginView.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'login',
    component: LoginView,
    meta: { guestOnly: true },
  },
  {
    path: '/tender-template',
    name: 'tender-template',
    component: () => import('../views/TenderTemplateView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/tender-validation',
    name: 'tender-validation',
    component: () => import('../views/TenderValidationView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/unauthorized',
    name: 'unauthorized',
    component: () => import('../views/UnauthorizedView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const token = getAuthToken().trim()
  const isAuthenticated = token.length > 0

  if (to.meta.requiresAuth && !isAuthenticated) {
    return { name: 'unauthorized' }
  }

  if (to.meta.guestOnly && isAuthenticated) {
    return { name: 'tender-template' }
  }

  return true
})

export default router
