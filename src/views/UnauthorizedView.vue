<script setup lang="ts">
import { useRouter } from 'vue-router'
import { clearAuthSession } from '../services/loginService'

const router = useRouter()

function goToLogin() {
  clearAuthSession()
  router.push('/')
}
</script>

<template>
  <section class="flex h-full min-h-0 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
    <div class="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
      <p class="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Access denied</p>
      <h1 class="mt-4 text-3xl font-semibold tracking-tight text-slate-900">You do not have permission to view this page.</h1>
      <p class="mt-3 text-sm text-slate-500">
        Please sign in first, then try again.
      </p>

      <button
        type="button"
        @click="goToLogin"
        class="mt-8 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Return to login
      </button>
    </div>
  </section>
</template>
