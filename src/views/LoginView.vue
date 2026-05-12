<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authenticateLogin, type LoginProvider } from '../services/loginService'

const router = useRouter()
const isConnecting = ref(false)
const loginMessage = ref('')
const form = reactive({
  username: '',
  password: '',
})

async function enterWorkspace(provider: LoginProvider) {
  isConnecting.value = true
  loginMessage.value = 'Connecting...'

  try {
    const result = await authenticateLogin({
      provider,
      username: form.username,
      password: form.password,
    })

    loginMessage.value = result.message
    await router.push('/tender-template')
  } catch (error) {
    console.error('Login flow failed:', error)
    loginMessage.value = error instanceof Error ? error.message : 'Login failed.'
  } finally {
    isConnecting.value = false
  }
}
</script>

<template>
  <section
    class="flex h-full min-h-0 items-center justify-center overflow-hidden px-4 py-6 sm:px-6 lg:px-8"
  >
    <div class="w-full max-w-lg">
      <div
        class="flex flex-col justify-center rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm sm:p-10"
      >
        <p class="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Secure access</p>
        <h1 class="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Sign in</h1>

        <form class="mt-8 space-y-4" @submit.prevent="enterWorkspace('username-password')">
          <label class="block text-left">
            <span class="mb-2 block text-sm font-medium text-slate-700">Username</span>
            <input
              v-model="form.username"
              type="text"
              autocomplete="username"
              required
              placeholder="username"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>

          <label class="block text-left">
            <span class="mb-2 block text-sm font-medium text-slate-700">Password</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              required
              placeholder="Password"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          </label>

          <button
            type="submit"
            :disabled="isConnecting"
            class="w-full rounded-2xl bg-slate-900 px-8 py-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {{ isConnecting ? 'Connecting' : 'Login with username' }}
          </button>
        </form>

        <div class="mt-4 flex items-center gap-3">
          <div class="h-px flex-1 bg-slate-200"></div>
          <span class="text-xs uppercase tracking-[0.2em] text-slate-400">or</span>
          <div class="h-px flex-1 bg-slate-200"></div>
        </div>

        <button
          type="button"
          @click="enterWorkspace('sso')"
          :disabled="isConnecting"
          class="mt-4 inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-8 py-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          {{ isConnecting ? 'Connecting' : 'Login with SSO' }}
        </button>

        <p v-if="loginMessage" class="mt-4 text-sm text-slate-500">
          {{ loginMessage }}
        </p>
      </div>
    </div>
  </section>
</template>
