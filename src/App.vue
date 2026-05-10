<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { readUsernameCookie } from './services/loginService'

const route = useRoute()
const username = ref('')
const displayName = computed(() => username.value || 'guest')

function syncUsernameFromCookie() {
  username.value = readUsernameCookie()
}

onMounted(() => {
  syncUsernameFromCookie()
})

watch(
  () => route.fullPath,
  () => {
    syncUsernameFromCookie()
  },
)
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900">
    <header class="sticky top-0 z-50 shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-10xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <RouterLink to="/" class="flex items-center gap-3 font-semibold tracking-tight">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm text-white shadow-sm">
            T
          </span>
          <span class="text-lg">Tender Validation System</span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <nav v-if="route.path !== '/'" class="flex items-center gap-1 text-sm font-medium text-slate-600">
            <RouterLink
              to="/tender-template"
              class="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900"
              :class="route.path === '/tender-template' ? 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white' : ''"
            >
              Chatroom
            </RouterLink>
            <RouterLink
              to="/tender-validation"
              class="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900"
              :class="route.path === '/tender-validation' ? 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white' : ''"
            >
              Validate
            </RouterLink>
          </nav>

          <div class="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">
            Welcome {{ displayName }}
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
