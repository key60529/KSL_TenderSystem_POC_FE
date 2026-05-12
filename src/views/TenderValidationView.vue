<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import FileUploadZone from '../components/FileUploadZone.vue'
import {
  deleteProject,
  getProject,
  listProjects,
  submitScoringJob,
  getReviewHistory,
} from '../services/projectService'
import type { Project, JobFile, ReviewHistoryItem } from '../services/backendTypes'
const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = ref<Project | null>(null)
const tendererFiles = ref<File[]>([])
const jobFiles = ref<JobFile[]>([])
const reviewHistory = ref<ReviewHistoryItem[]>([])
const selectedReviewJobId = ref<number | null>(null)
const isLoadingProjects = ref(false)
const isLoadingHistory = ref(false)
const isScoring = ref(false)
const isDeletingProject = ref(false)
const error = ref('')
const projectError = ref('')
const historyError = ref('')
const submitNotice = ref('')
const projectSearchQuery = ref('')
const isUploadPanelCollapsed = ref(false)
const expandedMarkingSections = ref<string[]>([])
const expandedResultSections = ref<Record<string, string[]>>({})
const expandedResultFiles = ref<string[]>([])
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
let mediaQueryList: MediaQueryList | null = null
// ── Computed ─────────────────────────────────────────────────────────────────
const criteriaList = computed<[string, string[]][]>(() => {
  const requiredSections = selectedProject.value?.master_requirements?.required_sections
  if (!requiredSections || typeof requiredSections !== 'object') return []
  return Object.entries(requiredSections) as [string, string[]][]
})
const filteredProjects = computed(() => {
  const query = projectSearchQuery.value.trim().toLowerCase()
  if (!query) return projects.value
  return projects.value.filter(
    (p) =>
      p.title.toLowerCase().includes(query) ||
      (p.description?.toLowerCase().includes(query) ?? false),
  )
})
const canScore = computed(
  () => selectedProject.value !== null && tendererFiles.value.length > 0 && !isScoring.value,
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
  jobFiles.value.filter((f) => f.status === 'pending' || f.status === 'processing'),
)
const failedFiles = computed(() => jobFiles.value.filter((f) => f.status === 'failed'))
const allDone = computed(
  () =>
    jobFiles.value.length > 0 &&
    jobFiles.value.every((f) => f.status === 'done' || f.status === 'failed'),
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
const showCollapsedProjectRail = computed(
  () => isDesktopLayout.value && isProjectPanelCollapsed.value,
)
const showCollapsedMarkingRail = computed(
  () => isDesktopLayout.value && isMarkingPanelCollapsed.value,
)
const selectedTendererFileCount = computed(() => tendererFiles.value.length)
const selectedTendererFileSummary = computed(() => {
  const count = selectedTendererFileCount.value
  if (count === 0) return 'No files selected'
  if (count === 1) return `1 file selected: ${tendererFiles.value[0]?.name ?? '1 file'}`
  return `${count} files selected`
})
const activeReviewJob = computed(() =>
  reviewHistory.value.find((job) => job.job_id === selectedReviewJobId.value) ?? null,
)
const historySummary = computed(() => {
  if (isLoadingHistory.value) return 'Loading review history…'
  if (reviewHistory.value.length === 0) return 'No review history yet.'
  return `${reviewHistory.value.length} review run(s) loaded.`
})
// ── Helpers ───────────────────────────────────────────────────────────────────
function syncExpandedSections() {
  expandedMarkingSections.value = criteriaList.value.map(([s]) => s)
}
function syncResultExpansionFromFiles(files: JobFile[]) {
  expandedResultSections.value = {}
  expandedResultFiles.value = []
  for (const file of files) {
    if (file.result?.sections) {
      expandedResultSections.value[file.file_name] = file.result.sections.map(
        (section) => section.section_name,
      )
    }
    if (file.result?.overall_summary) {
      expandedResultFiles.value.push(file.file_name)
    }
  }
}
function setActiveReviewJob(job: ReviewHistoryItem | null) {
  selectedReviewJobId.value = job?.job_id ?? null
  jobFiles.value = job?.files ?? []
  syncResultExpansionFromFiles(jobFiles.value)
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
function toggleProjectPanel() {
  isProjectPanelCollapsed.value = !isProjectPanelCollapsed.value
}
function toggleMarkingPanel() {
  isMarkingPanelCollapsed.value = !isMarkingPanelCollapsed.value
}
function toggleUploadPanel() {
  isUploadPanelCollapsed.value = !isUploadPanelCollapsed.value
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
function isResultSectionOpen(fileName: string, sectionName: string) {
  return (expandedResultSections.value[fileName] ?? []).includes(sectionName)
}
function isResultFileOpen(fileName: string) {
  return expandedResultFiles.value.includes(fileName)
}
function toggleResultFile(fileName: string) {
  if (expandedResultFiles.value.includes(fileName)) {
    expandedResultFiles.value = expandedResultFiles.value.filter((name) => name !== fileName)
  } else {
    expandedResultFiles.value = [...expandedResultFiles.value, fileName]
  }
}
function toggleResultSection(fileName: string, sectionName: string) {
  const current = expandedResultSections.value[fileName] ?? []
  if (current.includes(sectionName)) {
    expandedResultSections.value[fileName] = current.filter((s) => s !== sectionName)
  } else {
    expandedResultSections.value[fileName] = [...current, sectionName]
  }
}
function sectionScoreAverage(section: { requirements: { score: number }[] }) {
  const scores = section.requirements
    .map((req) => req.score)
    .filter((score) => Number.isFinite(score))
  if (scores.length === 0) return 0
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}
function sectionFulfilledCount(section: { requirements: { fulfilled: boolean }[] }) {
  return section.requirements.filter((req) => req.fulfilled).length
}
function rankLabel(index: number): string {
  return ['🥇', '🥈', '🥉'][index] ?? `#${index + 1}`
}
function formatDateTime(value: string | null) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
// ── Data loading ──────────────────────────────────────────────────────────────
async function loadReviewHistory(projectId: number, keepSelected = false) {
  isLoadingHistory.value = true
  historyError.value = ''
  try {
    const history = await getReviewHistory(projectId)
    reviewHistory.value = history
    if (history.length === 0) {
      setActiveReviewJob(null)
      return
    }
    const selectedStillExists = keepSelected
      ? history.find((job) => job.job_id === selectedReviewJobId.value) ?? null
      : null
    setActiveReviewJob(selectedStillExists ?? history[0] ?? null)
  } catch (e) {
    historyError.value = e instanceof Error ? e.message : 'Could not load review history.'
    reviewHistory.value = []
    setActiveReviewJob(null)
  } finally {
    isLoadingHistory.value = false
  }
}
async function refreshReviewHistory() {
  if (selectedProjectId.value === null) return
  await loadReviewHistory(selectedProjectId.value, true)
}
function selectHistoryJob(jobId: number) {
  const job = reviewHistory.value.find((item) => item.job_id === jobId) ?? null
  if (!job) return
  setActiveReviewJob(job)
}
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
})
// ── Project selection ─────────────────────────────────────────────────────────
async function selectProject(id: number) {
  selectedProjectId.value = id
  selectedProject.value = null
  tendererFiles.value = []
  error.value = ''
  projectError.value = ''
  historyError.value = ''
  submitNotice.value = ''
  reviewHistory.value = []
  setActiveReviewJob(null)
  try {
    selectedProject.value = await getProject(id)
    syncExpandedSections()
    await loadReviewHistory(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load project.'
  }
}
function clearSelectedProject() {
  selectedProjectId.value = null
  selectedProject.value = null
  reviewHistory.value = []
  setActiveReviewJob(null)
  tendererFiles.value = []
  error.value = ''
  historyError.value = ''
  submitNotice.value = ''
  expandedMarkingSections.value = []
}
function handleTendererFilesSelected(files: File[]) {
  tendererFiles.value = files
  error.value = ''
  submitNotice.value = ''
}
// ── Submission ────────────────────────────────────────────────────────────────
async function runScoring() {
  if (!selectedProject.value) return
  isScoring.value = true
  error.value = ''
  submitNotice.value = ''
  try {
    const response = await submitScoringJob(selectedProject.value.id, tendererFiles.value)
    setActiveReviewJob(null)
    submitNotice.value = `Review submitted as job #${response.job_id}. Use Refresh History to load the latest status.`
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to submit scoring job.'
  } finally {
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
function downloadReport() {
  if (!hasResults.value) return
  const headers = [
    'Rank',
    'File',
    'Overall Score',
    'Sections Found',
    'Section',
    'Exists',
    'Requirement',
    'Fulfilled',
    'Score',
    'Evidence',
  ]
  const rows: string[][] = []
  rankedDoneFiles.value.forEach((f, rank) => {
    const summary = f.result?.overall_summary
    const sections = f.result?.sections ?? []
    if (sections.length === 0) {
      rows.push([
        String(rank + 1),
        f.file_name,
        String(summary?.overall_score ?? ''),
        String(summary?.sections_found ?? ''),
        '',
        '',
        '',
        '',
        '',
        '',
      ])
    }
    for (const sec of sections) {
      for (const req of sec.requirements) {
        rows.push([
          String(rank + 1),
          f.file_name,
          String(summary?.overall_score ?? ''),
          String(summary?.sections_found ?? ''),
          sec.section_name,
          sec.section_exists ? 'Yes' : 'No',
          req.requirement,
          req.fulfilled ? 'Yes' : 'No',
          String(req.score),
          req.evidence,
        ])
      }
    }
  })
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n')
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
          <div v-if="showCollapsedProjectRail" key="project-collapsed" class="flex h-full min-h-0">
            <button
              type="button"
              @click="toggleProjectPanel"
              class="flex h-full w-full items-center justify-center rounded-3xl bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Open project panel"
            >
              <svg
                viewBox="0 0 20 20"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
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
                  <svg
                    viewBox="0 0 20 20"
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
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
                          <svg
                            viewBox="0 0 20 20"
                            class="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
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
      <section
        class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
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
          <!-- Upload + run controls -->
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Files</p>
                <p class="mt-0.5 truncate text-sm text-slate-600">
                  {{
                    isUploadPanelCollapsed
                      ? `${selectedTendererFileCount} file(s) selected`
                      : selectedTendererFileSummary
                  }}
                </p>
              </div>
              <button
                type="button"
                @click="toggleUploadPanel"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                :aria-label="
                  isUploadPanelCollapsed ? 'Expand upload panel' : 'Collapse upload panel'
                "
                :aria-expanded="!isUploadPanelCollapsed"
              >
                <svg
                  viewBox="0 0 20 20"
                  class="h-4 w-4 transition-transform duration-200"
                  :class="{ 'rotate-90': isUploadPanelCollapsed }"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 5l5 5-5 5" />
                </svg>
              </button>
            </div>
            <div
              v-if="!isUploadPanelCollapsed"
              class="mt-2 rounded-2xl border border-slate-200 bg-white p-2.5"
            >
              <FileUploadZone
                :max-files="TENDERER_MAX_FILES"
                :accepted-formats="TENDERER_ACCEPTED_FORMATS"
                :initial-files="tendererFiles"
                :compact="true"
                @files-selected="handleTendererFilesSelected"
              />
            </div>
          </div>
          <div
            class="sticky top-0 z-20 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur"
          >
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                @click="runScoring"
                :disabled="!canScore"
                class="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {{ isScoring ? 'Submitting…' : 'Run Review' }}
              </button>
              <button
                type="button"
                @click="refreshReviewHistory"
                :disabled="selectedProjectId === null || isLoadingHistory"
                class="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ isLoadingHistory ? 'Refreshing…' : 'Refresh History' }}
              </button>
              <span class="text-sm text-slate-500">
                {{
                  selectedTendererFileCount > 0
                    ? `${selectedTendererFileCount} file(s) ready for submission`
                    : 'Select at least one file to start the review.'
                }}
              </span>
            </div>
            <p class="mt-3 text-xs text-slate-400">
              Submit once, then refresh the history manually to see the latest backend result.
            </p>
          </div>
          <div v-if="submitNotice" class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {{ submitNotice }}
          </div>
          <div v-if="error" class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {{ error }}
          </div>
          <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                  Review History
                </p>
                <p class="mt-1 text-sm text-slate-500">
                  {{ historySummary }}
                </p>
              </div>
              <span
                v-if="activeReviewJob"
                class="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600"
              >
                Selected job #{{ activeReviewJob.job_id }} · {{ activeReviewJob.status }}
              </span>
            </div>
            <div v-if="historyError" class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {{ historyError }}
            </div>
            <div v-else-if="isLoadingHistory && reviewHistory.length === 0" class="text-sm text-slate-500">
              Loading history…
            </div>
            <div v-else-if="reviewHistory.length === 0" class="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              No review history yet.
            </div>
            <div v-else class="space-y-2">
              <button
                v-for="job in reviewHistory"
                :key="job.job_id"
                type="button"
                @click="selectHistoryJob(job.job_id)"
                :class="[
                  'w-full rounded-2xl border px-4 py-3 text-left transition',
                  selectedReviewJobId === job.job_id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                ]"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium">
                      Job #{{ job.job_id }} · {{ job.status }}
                    </p>
                    <p class="mt-1 text-xs opacity-70">
                      {{ formatDateTime(job.created_at) }}
                    </p>
                    <p class="mt-2 truncate text-xs opacity-70">
                      {{ job.files.map((file) => file.file_name).join(', ') }}
                    </p>
                  </div>
                  <span class="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
                    {{ job.files.length }} file(s)
                  </span>
                </div>
              </button>
            </div>
          </div>
          <!-- Selected review summary -->
          <div v-if="hasResults" class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p class="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
              Selected Review
            </p>
            <div class="space-y-2">
              <div
                v-for="f in jobFiles"
                :key="f.id"
                class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5"
              >
                <span class="min-w-0 flex-1 truncate text-sm text-slate-700">{{
                  f.file_name
                }}</span>
                <span
                  :class="[
                    'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    f.status === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : f.status === 'processing'
                        ? 'bg-blue-100 text-blue-700 animate-pulse'
                        : f.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-500',
                  ]"
                >
                  {{
                    f.status === 'pending'
                      ? 'Waiting…'
                      : f.status === 'processing'
                        ? 'Scoring…'
                        : f.status === 'done'
                          ? 'Done ✓'
                          : 'Failed ✗'
                  }}
                </span>
              </div>
            </div>
          </div>
          <!-- Failed files -->
          <div
            v-if="failedFiles.length > 0"
            class="rounded-3xl border border-red-200 bg-red-50 p-4"
          >
            <p class="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-red-500">Errors</p>
            <div v-for="f in failedFiles" :key="f.id" class="text-sm text-red-700">
              <span class="font-medium">{{ f.file_name }}</span
              >: {{ f.error ?? 'Unknown error' }}
            </div>
          </div>
          <!-- Ranked results -->
          <div
            v-if="rankedDoneFiles.length > 0"
            class="rounded-3xl border border-slate-200 bg-white p-4"
          >
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Results</p>
                <p class="mt-1 text-sm text-slate-500">
                  Each Tender Response is grouped into summary, section status, and requirement
                  details.
                </p>
              </div>
              <span
                v-if="pendingOrProcessingFiles.length > 0"
                class="text-xs text-slate-400 animate-pulse"
              >
                {{ pendingOrProcessingFiles.length }} file(s) still processing…
              </span>
            </div>
            <div class="space-y-4">
              <div
                v-for="(f, rank) in rankedDoneFiles"
                :key="f.id"
                class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
              >
                <button
                  type="button"
                  class="flex w-full items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-4 text-left transition hover:bg-slate-50"
                  @click="toggleResultFile(f.file_name)"
                  :aria-expanded="isResultFileOpen(f.file_name)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-xl leading-none">{{ rankLabel(rank) }}</span>
                      <p class="truncate text-sm font-semibold text-slate-900">{{ f.file_name }}</p>
                    </div>
                    <p class="mt-1 line-clamp-2 text-sm text-slate-500">
                      {{ f.result?.overall_summary?.general_evaluation }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-start gap-3">
                    <div class="text-right">
                      <p class="text-xl font-bold text-slate-900">
                        {{ f.result?.overall_summary?.overall_score ?? '—' }}
                      </p>
                      <p class="text-xs text-slate-400">overall score</p>
                    </div>
                    <svg
                      viewBox="0 0 20 20"
                      class="mt-1 h-4 w-4 text-slate-400 transition-transform duration-200"
                      :class="{ 'rotate-90': isResultFileOpen(f.file_name) }"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 5l5 5-5 5" />
                    </svg>
                  </div>
                </button>
                <div v-if="isResultFileOpen(f.file_name)" class="space-y-4 px-4 py-4">
                  <div class="rounded-2xl border border-slate-200 bg-white p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                          Overall summary
                        </p>
                        <p class="mt-1 text-sm text-slate-600">
                          {{ f.result?.overall_summary?.general_evaluation }}
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-2 text-xs">
                        <span class="rounded-full bg-slate-900 px-3 py-1 font-medium text-white">
                          {{ f.result?.overall_summary?.sections_found ?? 0 }}/{{
                            f.result?.overall_summary?.total_sections ?? 0
                          }}
                          sections found
                        </span>
                        <span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                          Score: {{ f.result?.overall_summary?.overall_score ?? '—' }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="space-y-3">
                    <div
                      v-for="section in f.result?.sections"
                      :key="section.section_name"
                      class="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <button
                        type="button"
                        class="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                        @click="toggleResultSection(f.file_name, section.section_name)"
                        :aria-expanded="isResultSectionOpen(f.file_name, section.section_name)"
                      >
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              :class="[
                                'h-2.5 w-2.5 shrink-0 rounded-full',
                                section.section_exists ? 'bg-emerald-500' : 'bg-red-400',
                              ]"
                            />
                            <span class="truncate text-sm font-semibold text-slate-900">{{
                              section.section_name
                            }}</span>
                            <span
                              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                              :class="
                                section.section_exists
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              "
                            >
                              {{ section.section_exists ? 'Exists' : 'Missing' }}
                            </span>
                          </div>
                          <p class="mt-1 text-sm text-slate-500">
                            {{ section.section_evaluation }}
                          </p>
                        </div>
                        <div class="flex shrink-0 items-start gap-3">
                          <div class="text-right">
                            <p class="text-sm font-semibold text-slate-900">
                              {{ sectionScoreAverage(section) }}/10
                            </p>
                            <p class="text-xs text-slate-400">avg score</p>
                          </div>
                          <svg
                            viewBox="0 0 20 20"
                            class="mt-1 h-4 w-4 text-slate-400 transition-transform duration-200"
                            :class="{
                              'rotate-90': isResultSectionOpen(f.file_name, section.section_name),
                            }"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M8 5l5 5-5 5" />
                          </svg>
                        </div>
                      </button>
                      <div
                        v-if="isResultSectionOpen(f.file_name, section.section_name)"
                        class="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-2"
                      >
                        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span
                            >{{ sectionFulfilledCount(section) }} /
                            {{ section.requirements.length }} requirements fulfilled</span
                          >
                          <span class="rounded-full bg-white px-2.5 py-1 text-slate-600"
                            >Section exists: {{ section.section_exists ? 'Yes' : 'No' }}</span
                          >
                        </div>
                        <div
                          v-for="req in section.requirements"
                          :key="req.requirement"
                          class="rounded-xl border border-slate-200 bg-white px-3 py-3"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 flex-1">
                              <p class="text-sm font-medium text-slate-900">
                                {{ req.requirement }}
                              </p>
                              <p class="mt-1 text-xs text-slate-500">{{ req.evaluation }}</p>
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                              <span
                                class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                              >
                                {{ req.score }}/10
                              </span>
                              <span
                                :class="[
                                  'rounded-full px-2.5 py-1 text-xs font-medium',
                                  req.fulfilled
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-red-100 text-red-700',
                                ]"
                              >
                                {{ req.fulfilled ? 'Fulfilled' : 'Not fulfilled' }}
                              </span>
                            </div>
                          </div>
                          <p
                            v-if="req.evidence"
                            class="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs italic text-slate-500"
                          >
                            Evidence: {{ req.evidence }}
                          </p>
                        </div>
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
          <div v-if="showCollapsedMarkingRail" key="marking-collapsed" class="flex h-full min-h-0">
            <button
              type="button"
              @click="toggleMarkingPanel"
              class="flex h-full w-full items-center justify-center rounded-3xl bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Open marking scheme panel"
            >
              <svg
                viewBox="0 0 20 20"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
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
                  <svg
                    viewBox="0 0 20 20"
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
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
              <div
                v-else-if="criteriaList.length === 0"
                class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"
              >
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
                    <span
                      class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                    >
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
                  <div
                    v-if="isSectionOpen(sectionName)"
                    class="border-t border-slate-200 px-4 py-3"
                  >
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
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}
.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
