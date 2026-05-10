<script setup lang="ts">
import { computed } from 'vue'
import type { ValidationResult } from '../services/backendTypes'

interface Props {
  results: ValidationResult[]
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
})

const foundCount = computed(() => props.results.filter((result) => result.status === 'found').length)
const missingCount = computed(() => props.results.filter((result) => result.status === 'missing').length)
const totalCount = computed(() => props.results.length)
</script>

<template>
  <div class="space-y-4">
    <div v-if="isLoading" class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
      Analyzing...
    </div>

    <div v-else-if="results.length > 0" class="rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="rounded-full bg-slate-900 px-3 py-1 font-medium text-white">
          {{ foundCount }}/{{ totalCount }} found
        </span>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
          {{ missingCount }} missing
        </span>
      </div>
    </div>

    <div v-if="!isLoading && results.length > 0" class="space-y-3">
      <div
        v-for="(result, index) in results"
        :key="index"
        :class="[
          'rounded-2xl border p-4',
          result.status === 'found' ? 'border-green-200 bg-green-50/40' : 'border-red-200 bg-red-50/40',
        ]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h4 class="text-sm font-semibold text-slate-900">{{ result.section }}</h4>
            <p class="mt-1 text-sm text-slate-600">{{ result.message }}</p>
            <div v-if="result.location" class="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">
              {{ result.location }}
            </div>
          </div>

          <span
            :class="[
              'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
              result.status === 'found' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
            ]"
          >
            {{ result.status === 'found' ? 'Found' : 'Missing' }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="!isLoading && results.length === 0" class="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
      Ready
    </div>
  </div>
</template>
