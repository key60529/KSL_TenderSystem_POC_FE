<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import FileUploadZone from '../components/FileUploadZone.vue'
import { deleteProject, getProject, listProjects, submitScoringJob, pollJobStatus } from '../services/projectService'
import type { Project, JobFile, ScoringJob } from '../services/backendTypes'

const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = ref<Project | null>(null)
const tendererFiles = ref<File[]>([])
const jobFiles = ref<JobFile[]>([])  // live per-file status from polling
const isLoadingProjects = ref(false)
const isScoring = ref(false)
const isDeletingProject = ref(false)
const error = ref('')
const projectError = ref('')
const projectSearchQuery = ref('')
const expandedMarkingSections = ref<string[]>([])
const expandedResultSections = ref<Record<string, string[]>>({})  // file_name -> open section names
const isProjectPanelCollapsed = ref(false)
const isMarkingPanelCollapsed = ref(false)
const isDesktopLayout = ref(true)
const projectPanelRef = ref<HTMLElement | null>(null)
const markingPanelRef = ref<HTMLElement | null>(null)

const TENDERER_MAX_FILES = 20
const TENDERER_ACCEPTED_FORMATS = ['pdf', 'docx', 'doc']
const CSV_FILE_PREFIX = 'tender-review'
const DESKTOP_MEDIA_QUERY = '(min-width: 1280px)'
const collapsedRailWidth = '36px'
const expandedProjectWidth = '360px'
const expandedMarkingWidth = '380px'
const POLL_INTERVAL_MS = 4000

let mediaQueryList: MediaQueryList | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// ── Computed ─────────────────────────────────────────────────────────────────

const criteriaList = computed<[string, string[]][]>(() => {
  const requiredSections = selectedProject.value?.master_requirements?.required_sections
  if (!requiredSections || typeof requiredSections !== 'object') return []
  return Object.entries(requiredSections) as [string, string[]][]
})

const filteredProjects = computed(() => {
  const query = projectSearchQuery.value.trim().toLowerCase()
  if (!query) return projects.value
  return projects.value.filter((p) =>
    p.title.toLowerCase().includes(query) || (p.description?.toLowerCase().includes(query) ?? false)
  )
})

const canScore = computed(() =>
  selectedProject.value !== null && tendererFiles.value.length > 0 && !isScoring.value
)

const hasResults = computed(() => jobFiles.value.length > 0)

const rankedDoneFiles = computed(() => {
  return [...jobFiles.value]
    .filter((f) => f.status === 'done' && f.result)
    .sort((a, b) => {
      const scoreA = a.result?.overall_summary?.overall_score ?? -1
      const scoreB = b.result?.overall_summary?.overall_score ?? -1
      return scoreB - scoreA
    })
})

const pendingOrProcessingFiles = computed(() =>
  jobFiles.value.filter((f) => f.status === 'pending' || f.status === 'processing')
)

const failedFiles = computed(() => jobFiles.value.filter((f) => f.status === 'failed'))

const allDone = computed(() =>
  jobFiles.value.length > 0 && jobFiles.value.every((f) => f.status === 'done' || f.status === 'failed')
)

const hasProjectList = computed(() => filteredProjects.value.length > 0)

const projectPanelWidth = computed(() => {
  if (!isDesktopLayout.value) return '100%'
  return isProjectPanelCollapsed.value ? collapsedRailWidth : expandedProjectWidth
})

const markingPanelWidth = computed(() => {
  if (!isDesktopLayout.value) return '100%'
  return isMarkingPanelCollapsed.value ? collapsedRailWidth : expandedMarkingWidth
})

const showCollapsedProjectRail = computed(() => isDesktopLayout.value && isProjectPanelCollapsed.value)
const showCollapsedMarkingRail = computed(() => isDesktopLayout.value && isMarkingPanelCollapsed.value)

// ── Layout / lifecycle ────────────────────────────────────────────────────────

function syncExpandedSections() {
  expandedMarkingSections.value = criteriaList.value.map(([s]) => s)
}

function syncLayoutMode() {
  if (typeof window === 'undefined') return
  mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY)
  isDesktopLayout.value = mediaQueryList.matches
}

function handleMediaQueryChange(event: MediaQueryListEvent) {
  isDesktopLayout.value = event.matches
  if (!event.matches) {
    isProjectPanelCollapsed.value = false
    isMarkingPanelCollapsed.value = false
  }
}

function toggleProjectPanel() { isProjectPanelCollapsed.value = !isProjectPanelCollapsed.value }
function toggleMarkingPanel() { isMarkingPanelCollapsed.value = !isMarkingPanelCollapsed.value }

onMounted(async () => {
  isLoadingProjects.value = true
  syncLayoutMode()
  mediaQueryList?.addEventListener('change', handleMediaQueryChange)
  try {
    projects.value = await listProjects()
  } catch (e) {
    projectError.value = e instanceof Error ? e.message : 'Could not load projects.'
  } finally {
    isLoadingProjects.value = false
  }
})

onBeforeUnmount(() => {
  mediaQueryList?.removeEventListener('change', handleMediaQueryChange)
  stopPolling()
})

// ── Project selection ─────────────────────────────────────────────────────────

async function selectProject(id: number) {
  selectedProjectId.value = id
  selectedProject.value = null
  jobFiles.value = []
  error.value = ''
  try {
    selectedProject.value = await getProject(id)
    syncExpandedSections()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load project.'
  }
}

function clearSelectedProject() {
  selectedProjectId.value = null
  selectedProject.value = null
  jobFiles.value = []
  tendererFiles.value = []
  error.value = ''
  expandedMarkingSections.value = []
  stopPolling()
}

function isSectionOpen(sectionName: string) {
  return expandedMarkingSections.value.includes(sectionName)
}

function toggleSection(sectionName: string) {
  if (expandedMarkingSections.value.includes(sectionName)) {
    expandedMarkingSections.value = expandedMarkingSections.value.filter((s) => s !== sectionName)
  } else {
    expandedMarkingSections.value = [...expandedMarkingSections.value, sectionName]
  }
}

function handleTendererFilesSelected(files: File[]) {
  tendererFiles.value = files
  jobFiles.value = []
  error.value = ''
  stopPolling()
}

// ── Async scoring + polling ───────────────────────────────────────────────────

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollOnce(jobId: number) {
  try {
    const job: ScoringJob = await pollJobStatus(jobId)
    jobFiles.value = job.files
    if (job.status === 'done' || job.status === 'failed' || job.status === 'partial') {
      stopPolling()
      isScoring.value = false
      // expand all result sections for the first done file
      for (const f of job.files) {
        if (f.result?.sections) {
          expandedResultSections.value[f.file_name] = f.result.sections.map((s) => s.section_name)
        }
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Polling error.'
    stopPolling()
    isScoring.value = false
  }
}

async function runScoring() {
  if (!selectedProject.value) return
  isScoring.value = true
  error.value = ''
  jobFiles.value = []
  stopPolling()
  try {
    const response = await submitScoringJob(selectedProject.value.id, tendererFiles.value)
    // Optimistically populate pending entries so UI shows immediately
    jobFiles.value = tendererFiles.value.map((f, i) => ({
      id: i,
      file_name: f.name,
      status: 'pending' as const,
      result: null,
      error: null,
    }))
    // Start polling
    const jobId = response.job_id
    pollTimer = setInterval(() => pollOnce(jobId), POLL_INTERVAL_MS)
    // Also poll once immediately
    await pollOnce(jobId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to submit scoring job.'
    isScoring.value = false
  }
}

async function removeSelectedProjectById(projectId: number) {
  if (isDeletingProject.value) return
  const project = projects.value.find((p) => p.id === projectId)
  if (!project) return
  const confirmed = window.confirm(`Delete project "${project.title}"? This cannot be undone.`)
  if (!confirmed) return
  isDeletingProject.value = true
  error.value = ''
  try {
    await deleteProject(projectId)
    projects.value = projects.value.filter((p) => p.id !== projectId)
    if (selectedProject.value?.id === projectId) clearSelectedProject()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not delete project.'
  } finally {
    isDeletingProject.value = false
  }
}

// ── Result helpers ────────────────────────────────────────────────────────────

function isResultSectionOpen(fileName: string, sectionName: string) {
  return (expandedResultSections.value[fileName] ?? []).includes(sectionName)
}

function toggleResultSection(fileName: string, sectionName: string) {
  const current = expandedResultSections.value[fileName] ?? []
  if (current.includes(sectionName)) {
    expandedResultSections.value[fileName] = current.filter((s) => s !== sectionName)
  } else {
    expandedResultSections.value[fileName] = [...current, sectionName]
  }
}

function rankLabel(index: number): string {
  return ['🥇', '🥈', '🥉'][index] ?? `#${index + 1}`
}

function scorePercent(score: number, total: number): number {
  if (total === 0) return 0
  return Math.round((score / total) * 100)
}

function scoreBarColor(pct: number): string {
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-amber-400'
  return 'bg-red-400'
}

function downloadReport() {
  if (!hasResults.value) return
  const headers = ['Rank', 'File', 'Overall Score', 'Sections Found', 'Section', 'Exists', 'Requirement', 'Fulfilled', 'Score', 'Evidence']
  const rows: string[][] = []
  rankedDoneFiles.value.forEach((f, rank) => {
    const summary = f.result?.overall_summary
    const sections = f.result?.sections ?? []
    if (sections.length === 0) {
      rows.push([String(rank + 1), f.file_name, String(summary?.overall_score ?? ''), String(summary?.sections_found ?? ''), '', '', '', '', '', ''])
    }
    for (const sec of sections) {
      for (const req of sec.requirements) {
        rows.push([
          String(rank + 1), f.file_name,
          String(summary?.overall_score ?? ''), String(summary?.sections_found ?? ''),
          sec.section_name, sec.section_exists ? 'Yes' : 'No',
          req.requirement, req.fulfilled ? 'Yes' : 'No',
          String(req.score), req.evidence,
        ])
      }
    }
  })
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
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
</script>

<template>
  <section class="h-full min-h-0 overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
    <div class="mx-auto flex h-full min-h-0 max-w-10xl flex-col gap-4 xl:flex-row">
      <aside
        ref="projectPanelRef"
        class="min-h-0 shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out"
        :style="{ width: projectPanelWidth }"
      >
        <Transition name="panel-fade" mode="out-in">
          <div
            v-if="showCollapsedProjectRail"
            key="project-collapsed"
            class="flex h-full min-h-0"
          >
            <button
              type="button"
              @click="toggleProjectPanel"
              class="flex h-full w-full items-center justify-center rounded-3xl bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Open project panel"
            >
                          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 15l-5-5 5-5" />
            </svg>
            </button>
          </div>

          <div v-else key="project-expanded" class="flex h-full min-h-0 flex-col">
            <div class="shrink-0 border-b border-slate-100 px-4 py-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    Select Project
                  </p>
                  <h2 class="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                    Project Library
                  </h2>
                </div>
                <button
                  type="button"
                  @click="toggleProjectPanel"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Collapse project panel"
                >
              <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M8 5l5 5-5 5" />
              </svg>
                </button>
              </div>

            </div>

            <div class="flex min-h-0 flex-1 flex-col p-4">
              <div v-if="isLoadingProjects" class="text-sm text-slate-400">Loading projects…</div>
              <div
                v-else-if="projectError"
                class="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-600"
              >
                {{ projectError }}
              </div>
              <template v-else>
                <div class="flex items-center justify-between gap-3">
                  <label class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Search Projects
                  </label>
                </div>
                <input
                  v-model="projectSearchQuery"
                  type="text"
                  placeholder="Type to filter projects…"
                  class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
                />

                <div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  <div
                    v-if="!hasProjectList"
                    class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"
                  >
                    No matching projects found.
                  </div>

                  <div v-else class="space-y-2">
                    <div
                      v-for="project in filteredProjects"
                      :key="project.id"
                      :class="[
                        'w-full rounded-2xl border px-4 py-3 text-left transition',
                        selectedProjectId === project.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100',
                      ]"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          @click="selectProject(project.id)"
                          class="min-w-0 flex-1 text-left"
                        >
                          <span class="block truncate text-sm font-medium">
                            {{ project.title }}
                          </span>
                          <p v-if="project.description" class="mt-1 truncate text-xs opacity-70">
                            {{ project.description }}
                          </p>
                        </button>

                        <button
                          type="button"
                          @click.stop="removeSelectedProjectById(project.id)"
                          :disabled="isDeletingProject"
                          class="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          :aria-label="`Delete project ${project.title}`"
                        >
                          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M8 3.5h4" />
                            <path d="M4.5 5.5h11" />
                            <path d="M7.5 5.5l.5 11h4l.5-11" />
                            <path d="M9 9v4" />
                            <path d="M11 9v4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </Transition>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div class="shrink-0 border-b border-slate-100 px-4 py-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Tender Response
              </p>
              <h2 class="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                Tender Response
              </h2>
            </div>
            <button
              v-if="hasResults && allDone"
              type="button"
              @click="downloadReport"
              class="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 gap-4">
          <!-- Upload zone -->
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <FileUploadZone
              :max-files="TENDERER_MAX_FILES"
              :accepted-formats="TENDERER_ACCEPTED_FORMATS"
              :initial-files="tendererFiles"
              @files-selected="handleTendererFilesSelected"
            />
            <div v-if="error" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {{ error }}
            </div>
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                @click="runScoring"
                :disabled="!canScore"
                class="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {{ isScoring ? 'Processing…' : 'Run Review' }}
              </button>
              <span v-if="isScoring && !allDone" class="text-xs text-slate-400">
                Files are scored one-by-one — this may take several minutes…
              </span>
            </div>
          </div>

          <!-- Per-file queue progress -->
          <div v-if="hasResults" class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p class="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Queue Progress</p>
            <div class="space-y-2">
              <div
                v-for="f in jobFiles"
                :key="f.id"
                class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5"
              >
                <span class="min-w-0 flex-1 truncate text-sm text-slate-700">{{ f.file_name }}</span>
                <span
                  :class="[
                    'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    f.status === 'done'       ? 'bg-emerald-100 text-emerald-700' :
                    f.status === 'processing' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                    f.status === 'failed'     ? 'bg-red-100 text-red-700' :
                                                'bg-slate-100 text-slate-500',
                  ]"
                >
                  {{ f.status === 'pending' ? 'Waiting…' : f.status === 'processing' ? 'Scoring…' : f.status === 'done' ? 'Done ✓' : 'Failed ✗' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Failed files -->
          <div v-if="failedFiles.length > 0" class="rounded-3xl border border-red-200 bg-red-50 p-4">
            <p class="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-red-500">Errors</p>
            <div v-for="f in failedFiles" :key="f.id" class="text-sm text-red-700">
              <span class="font-medium">{{ f.file_name }}</span>: {{ f.error ?? 'Unknown error' }}
            </div>
          </div>

          <!-- Ranked results -->
          <div v-if="rankedDoneFiles.length > 0" class="rounded-3xl border border-slate-200 bg-white p-4">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Results</p>
                <p class="mt-1 text-sm text-slate-500">Ranked by overall score, highest first.</p>
              </div>
              <span v-if="pendingOrProcessingFiles.length > 0" class="text-xs text-slate-400 animate-pulse">
                {{ pendingOrProcessingFiles.length }} file(s) still processing…
              </span>
            </div>

            <div class="space-y-5">
              <div
                v-for="(f, rank) in rankedDoneFiles"
                :key="f.id"
                class="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden"
              >
                <div class="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100">
                  <span class="text-xl leading-none">{{ rankLabel(rank) }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-slate-900">{{ f.file_name }}</p>
                    <p class="text-xs text-slate-500 mt-0.5">{{ f.result?.overall_summary?.general_evaluation }}</p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-xl font-bold text-slate-900">{{ f.result?.overall_summary?.overall_score ?? '—' }}</p>
                    <p class="text-xs text-slate-400">overall score</p>
                  </div>
                </div>

                <div class="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div class="flex items-center gap-3 text-xs text-slate-500">
                    <span>{{ f.result?.overall_summary?.sections_found }} / {{ f.result?.overall_summary?.total_sections }} sections found</span>
                  </div>
                  <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      :class="['h-full rounded-full transition-all duration-500', scoreBarColor(scorePercent(f.result?.overall_summary?.overall_score ?? 0, f.result?.overall_summary?.total_sections ?? 1))]"
                      :style="{ width: scorePercent(f.result?.overall_summary?.overall_score ?? 0, f.result?.overall_summary?.total_sections ?? 1) + '%' }"
                    />
                  </div>
                </div>

                <div class="divide-y divide-slate-100">
                  <div
                    v-for="section in f.result?.sections"
                    :key="section.section_name"
                    class="overflow-hidden"
                  >
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-100"
                      @click="toggleResultSection(f.file_name, section.section_name)"
                    >
                      <div class="min-w-0 flex-1 flex items-center gap-2">
                        <span :class="['shrink-0 h-2 w-2 rounded-full', section.section_exists ? 'bg-emerald-500' : 'bg-red-400']" />
                        <span class="truncate text-sm font-medium text-slate-800">{{ section.section_name }}</span>
                      </div>
                      <div class="flex items-center gap-3 shrink-0">
                        <span class="text-xs text-slate-500 max-w-[160px] truncate">{{ section.section_evaluation }}</span>
                        <svg
                          viewBox="0 0 20 20" class="h-4 w-4 text-slate-400 transition-transform duration-200"
                          :class="{ 'rotate-90': isResultSectionOpen(f.file_name, section.section_name) }"
                          fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                        ><path d="M8 5l5 5-5 5" /></svg>
                      </div>
                    </button>

                    <div
                      v-if="isResultSectionOpen(f.file_name, section.section_name)"
                      class="border-t border-slate-100 bg-white px-4 py-3 space-y-2"
                    >
                      <div
                        v-for="req in section.requirements"
                        :key="req.requirement"
                        class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div class="flex items-start justify-between gap-2">
                          <p class="text-sm text-slate-800 flex-1">{{ req.requirement }}</p>
                          <div class="flex shrink-0 items-center gap-2">
                            <span class="text-xs font-medium text-slate-600">{{ req.score }}</span>
                            <span :class="['rounded-full px-2 py-0.5 text-xs font-medium', req.fulfilled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700']">
                              {{ req.fulfilled ? 'Met' : 'Unmet' }}
                            </span>
                          </div>
                        </div>
                        <p v-if="req.evaluation" class="mt-1 text-xs text-slate-500">{{ req.evaluation }}</p>
                        <p v-if="req.evidence" class="mt-0.5 text-xs italic text-slate-400">📍 {{ req.evidence }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside
        ref="markingPanelRef"
        class="min-h-0 shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out"
        :style="{ width: markingPanelWidth }"
      >
        <Transition name="panel-fade" mode="out-in">
          <div
            v-if="showCollapsedMarkingRail"
            key="marking-collapsed"
            class="flex h-full min-h-0"
          >
            <button
              type="button"
              @click="toggleMarkingPanel"
              class="flex h-full w-full items-center justify-center rounded-3xl bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Open marking scheme panel"
            >
              <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M8 5l5 5-5 5" />
              </svg>
            </button>
          </div>

          <div v-else key="marking-expanded" class="flex h-full min-h-0 flex-col">
            <div class="shrink-0 border-b border-slate-100 px-4 py-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    Marking Scheme
                  </p>
                  <h2 class="mt-1 truncate text-lg font-semibold tracking-tight text-slate-900">
                    {{ selectedProject?.title ?? 'No Project Selected' }}
                  </h2>
                  <p v-if="selectedProject?.description" class="mt-1 text-sm text-slate-500">
                    {{ selectedProject.description }}
                  </p>
                </div>
                <button
                  type="button"
                  @click="toggleMarkingPanel"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Collapse marking scheme panel"
                >
                  <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 5l-5 5 5 5" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              <div
                v-if="!selectedProject"
                class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"
              >
                Choose a project to view its marking scheme.
              </div>

              <div v-else-if="criteriaList.length === 0" class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No required sections saved for this project.
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="[sectionName, requirements] in criteriaList"
                  :key="sectionName"
                  class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                >
                  <button
                    type="button"
                    @click="toggleSection(sectionName)"
                    class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-100"
                    :aria-expanded="isSectionOpen(sectionName)"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-slate-900">{{ sectionName }}</p>
                      <p class="mt-1 text-xs text-slate-500">
                        {{ requirements.length }} requirement(s)
                      </p>
                    </div>
                    <span class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                      <svg
                        v-if="isSectionOpen(sectionName)"
                        viewBox="0 0 20 20"
                        class="h-4 w-4 transition-transform duration-300"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 8l5 5 5-5" />
                      </svg>
                      <svg
                        v-else
                        viewBox="0 0 20 20"
                        class="h-4 w-4 transition-transform duration-300"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M8 5l5 5-5 5" />
                      </svg>
                    </span>
                  </button>

                  <div v-if="isSectionOpen(sectionName)" class="border-t border-slate-200 px-4 py-3">
                    <ul class="space-y-2 text-sm leading-6 text-slate-700">
                      <li
                        v-for="(requirement, requirementIndex) in requirements"
                        :key="`${sectionName}-${requirementIndex}`"
                        class="flex gap-2"
                      >
                        <span class="shrink-0 select-none text-slate-400">-</span>
                        <span class="break-words">{{ requirement }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
