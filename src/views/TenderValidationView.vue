<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import FileUploadZone from '../components/FileUploadZone.vue'
import { listProjects, getProject, scoreSubmissions } from '../services/projectService'
import type {
  Project,
  MarkingScheme,
  TendererResult,
  CriterionResult,
} from '../services/backendTypes'

// ── State ─────────────────────────────────────────────────────────────────────

const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = ref<Project | null>(null)
const tendererFiles = ref<File[]>([])
const reviewResults = ref<TendererResult[]>([])
const isLoadingProjects = ref(false)
const isScoring = ref(false)
const error = ref('')
const projectError = ref('')

const TENDERER_MAX_FILES = 20
const TENDERER_ACCEPTED_FORMATS = ['pdf', 'docx', 'doc']
const CSV_FILE_PREFIX = 'tender-review'

// ── Computed ──────────────────────────────────────────────────────────────────

const markingScheme = computed<MarkingScheme | null>(
  () => selectedProject.value?.master_requirements ?? null,
)

const criteriaList = computed(() =>
  markingScheme.value ? Object.entries(markingScheme.value) : [],
)

const canScore = computed(
  () => selectedProject.value !== null && tendererFiles.value.length > 0 && !isScoring.value,
)

const hasResults = computed(() => reviewResults.value.length > 0)

const disqualifiedCount = computed(
  () => reviewResults.value.filter((t) => t.is_disqualified).length,
)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  isLoadingProjects.value = true
  try {
    projects.value = await listProjects()
  } catch (e) {
    projectError.value = e instanceof Error ? e.message : 'Could not load projects.'
  } finally {
    isLoadingProjects.value = false
  }
})

// ── Handlers ──────────────────────────────────────────────────────────────────

async function selectProject(id: number) {
  selectedProjectId.value = id
  selectedProject.value = null
  reviewResults.value = []
  error.value = ''
  try {
    selectedProject.value = await getProject(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load project.'
  }
}

function handleTendererFilesSelected(files: File[]) {
  tendererFiles.value = files
  reviewResults.value = []
  error.value = ''
}

async function runScoring() {
  if (!selectedProject.value) return
  isScoring.value = true
  error.value = ''
  reviewResults.value = []
  try {
    const response = await scoreSubmissions(selectedProject.value.id, tendererFiles.value)
    reviewResults.value = response.tenderers
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Scoring failed.'
  } finally {
    isScoring.value = false
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

function downloadReport() {
  if (!hasResults.value) return
  const headers = [
    'Tenderer',
    'DQ',
    'Criterion',
    'Score',
    'Max Score',
    'Status',
    'DQ Reason',
    'Evidence',
    'Comment',
  ]
  const rows: string[][] = []

  for (const tenderer of reviewResults.value) {
    if (tenderer.results.length === 0) {
      rows.push([
        tenderer.tenderer_file,
        tenderer.is_disqualified ? 'YES' : 'NO',
        '',
        '',
        '',
        '',
        '',
        '',
        tenderer.error ?? '',
      ])
      continue
    }
    for (const r of tenderer.results) {
      rows.push([
        tenderer.tenderer_file,
        tenderer.is_disqualified ? 'YES' : 'NO',
        r.criterion,
        r.score !== null ? String(r.score) : '',
        r.max_score !== null ? String(r.max_score) : '',
        r.status,
        r.dq_reason ?? '',
        r.evidence ?? '',
        r.comment ?? '',
      ])
    }
  }

  const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${CSV_FILE_PREFIX}-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalScore(results: CriterionResult[]): string {
  const scored = results.filter((r) => r.score !== null)
  if (scored.length === 0) return '—'
  const sum = scored.reduce((acc, r) => acc + (r.score ?? 0), 0)
  const max = scored.reduce((acc, r) => acc + (r.max_score ?? 0), 0)
  return `${sum} / ${max}`
}

function statusClass(status: string) {
  if (status === 'pass') return 'bg-emerald-100 text-emerald-700'
  if (status === 'dq') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'
}
</script>

<template>
  <section class="h-full min-h-0 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-slate-900">Tender Review</h1>
        <button
          v-if="hasResults"
          type="button"
          @click="downloadReport"
          class="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[300px_1fr]">
        <!-- Left: Project selector + marking scheme -->
        <div class="flex flex-col gap-4">
          <!-- Project list -->
          <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 class="mb-3 text-sm font-semibold text-slate-900">Select Project</h2>

            <div v-if="isLoadingProjects" class="text-sm text-slate-400">Loading projects…</div>
            <div
              v-else-if="projectError"
              class="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-600"
            >
              {{ projectError }}
            </div>
            <div v-else-if="projects.length === 0" class="text-sm text-slate-400">
              No projects found. Save one from the Chat page first.
            </div>
            <ul v-else class="space-y-1">
              <li v-for="project in projects" :key="project.id">
                <button
                  type="button"
                  @click="selectProject(project.id)"
                  :class="[
                    'w-full rounded-2xl px-3 py-2 text-left text-sm transition',
                    selectedProjectId === project.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100',
                  ]"
                >
                  {{ project.title }}
                </button>
              </li>
            </ul>
          </div>

          <!-- Marking scheme display -->
          <div
            v-if="selectedProject"
            class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 class="mb-3 text-sm font-semibold text-slate-900">Marking Scheme</h2>
            <div v-if="criteriaList.length === 0" class="text-sm text-slate-400">
              No criteria saved for this project.
            </div>
            <ul v-else class="space-y-2">
              <li
                v-for="[criterion, detail] in criteriaList"
                :key="criterion"
                class="rounded-2xl bg-slate-50 px-3 py-2"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-slate-800">{{ criterion }}</span>
                  <span
                    class="ml-2 shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {{ detail.max_score }} pts
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-slate-500">{{ detail.description }}</p>
              </li>
            </ul>
          </div>
        </div>

        <!-- Right: Upload + results -->
        <div class="flex flex-col gap-6">
          <!-- File upload -->
          <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 class="mb-3 text-sm font-semibold text-slate-900">Tenderer Submissions</h2>
            <p class="mb-4 text-xs text-slate-500">
              Upload one file per tenderer (PDF or DOCX). Each will be independently scored against
              the marking scheme.
            </p>

            <FileUploadZone
              :max-files="TENDERER_MAX_FILES"
              :accepted-formats="TENDERER_ACCEPTED_FORMATS"
              :initial-files="tendererFiles"
              @files-selected="handleTendererFilesSelected"
            />

            <div v-if="error" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {{ error }}
            </div>

            <div class="mt-4 flex items-center gap-3">
              <button
                type="button"
                @click="runScoring"
                :disabled="!canScore"
                class="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {{ isScoring ? 'Scoring…' : 'Run Review' }}
              </button>
              <span v-if="isScoring" class="text-xs text-slate-400"
                >This may take a minute per file…</span
              >
            </div>
          </div>

          <!-- Results -->
          <div v-if="hasResults" class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-sm font-semibold text-slate-900">Results</h2>
              <span
                v-if="disqualifiedCount > 0"
                class="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700"
              >
                {{ disqualifiedCount }} DQ'd
              </span>
            </div>

            <div class="space-y-6">
              <div
                v-for="tenderer in reviewResults"
                :key="tenderer.tenderer_file"
                :class="[
                  'rounded-2xl border p-4',
                  tenderer.is_disqualified
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-slate-50',
                ]"
              >
                <!-- Tenderer header -->
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold text-slate-900">{{ tenderer.tenderer_file }}</p>
                    <p v-if="!tenderer.error" class="text-xs text-slate-500">
                      Total: {{ totalScore(tenderer.results) }}
                    </p>
                  </div>
                  <span
                    v-if="tenderer.is_disqualified"
                    class="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white"
                    >DQ</span
                  >
                  <span
                    v-else
                    class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                    >Qualified</span
                  >
                </div>

                <!-- Error state -->
                <p v-if="tenderer.error" class="mt-2 text-sm text-red-600">{{ tenderer.error }}</p>

                <!-- Criterion rows -->
                <div v-else class="mt-3 space-y-2">
                  <div
                    v-for="result in tenderer.results"
                    :key="result.criterion"
                    class="rounded-xl bg-white px-3 py-2 shadow-sm"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <span class="text-sm font-medium text-slate-800">{{ result.criterion }}</span>
                      <div class="flex shrink-0 items-center gap-2">
                        <span v-if="result.score !== null" class="text-xs text-slate-500">
                          {{ result.score }} / {{ result.max_score }}
                        </span>
                        <span
                          :class="[
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            statusClass(result.status),
                          ]"
                        >
                          {{ result.status.toUpperCase() }}
                        </span>
                      </div>
                    </div>
                    <p v-if="result.dq_reason" class="mt-1 text-xs text-red-600">
                      ⛔ {{ result.dq_reason }}
                    </p>
                    <p v-if="result.comment" class="mt-1 text-xs text-slate-500">
                      {{ result.comment }}
                    </p>
                    <p v-if="result.evidence" class="mt-0.5 text-xs italic text-slate-400">
                      📍 {{ result.evidence }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
