<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { clearAuthSession, getAuthToken, readUsernameCookie } from './services/loginService'

const route = useRoute()
const router = useRouter()
const username = ref('')
const authToken = ref(getAuthToken())
const isUserMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)
const displayName = computed(() => username.value || 'guest')
const isAuthenticated = computed(() => authToken.value.trim().length > 0)

function syncAuthState() {
  authToken.value = getAuthToken()
  username.value = readUsernameCookie()
}

function toggleUserMenu() {
  isUserMenuOpen.value = !isUserMenuOpen.value
}

function closeUserMenu() {
  isUserMenuOpen.value = false
}

function handleLogout() {
  clearAuthSession()
  closeUserMenu()
  router.push('/')
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (userMenuRef.value && target && !userMenuRef.value.contains(target)) {
    closeUserMenu()
  }
}

onMounted(() => {
  syncAuthState()
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})

watch(
  () => route.fullPath,
  () => {
    syncAuthState()
    closeUserMenu()
  },
)
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900">
    <header class="sticky top-0 z-50 shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-10xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-3 font-semibold tracking-tight">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm text-white shadow-sm">
            T
          </span>
          <span class="text-lg">Tender Validation System</span>
        </div>

        <div class="flex items-center gap-3">
          <nav v-if="isAuthenticated" class="flex items-center gap-1 text-sm font-medium text-slate-600">
            <RouterLink
              to="/tender-template"
              class="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900"
              :class="route.path === '/tender-template' ? 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white' : ''"
            >
              Marking Scheme
            </RouterLink>
            <RouterLink
              to="/tender-validation"
              class="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900"
              :class="route.path === '/tender-validation' ? 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white' : ''"
            >
              Tender Scoring
            </RouterLink>
          </nav>

          <div v-if="isAuthenticated" ref="userMenuRef" class="relative">
            <button
              type="button"
              @click="toggleUserMenu"
              class="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            >
              Welcome {{ displayName }}
            </button>

            <div
              v-if="isUserMenuOpen"
              class="absolute right-0 top-[calc(100%+0.5rem)] w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            >
              <button
                type="button"
                @click="handleLogout"
                class="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="min-h-0 flex-1 overflow-hidden">
      <div class="h-full min-h-0">
        <RouterView />
      </div>
    </main>
  </div>
</template>
