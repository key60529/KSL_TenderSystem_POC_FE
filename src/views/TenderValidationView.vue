<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import FileUploadZone from '../components/FileUploadZone.vue'
import { deleteProject, getProject, listProjects, scoreSubmissions } from '../services/projectService'
import type { CriterionResult, Project, TendererResult } from '../services/backendTypes'

const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = ref<Project | null>(null)
const tendererFiles = ref<File[]>([])
const reviewResults = ref<TendererResult[]>([])
const isLoadingProjects = ref(false)
const isScoring = ref(false)
const isDeletingProject = ref(false)
const error = ref('')
const projectError = ref('')
const projectSearchQuery = ref('')
const expandedMarkingSections = ref<string[]>([])
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

const criteriaList = computed<[string, string[]][]>(() => {
  const requiredSections = selectedProject.value?.master_requirements?.required_sections

  if (!requiredSections || typeof requiredSections !== 'object') {
    return []
  }

  return Object.entries(requiredSections) as [string, string[]][]
})

const filteredProjects = computed(() => {
  const query = projectSearchQuery.value.trim().toLowerCase()
  if (!query) return projects.value
  return projects.value.filter((project) => {
    const titleMatch = project.title.toLowerCase().includes(query)
    const descriptionMatch = project.description?.toLowerCase().includes(query) ?? false
    return titleMatch || descriptionMatch
  })
})


const canScore = computed(
  () => selectedProject.value !== null && tendererFiles.value.length > 0 && !isScoring.value,
)


const hasResults = computed(() => reviewResults.value.length > 0)
const disqualifiedCount = computed(() => reviewResults.value.filter((t) => t.is_disqualified).length)
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

function syncExpandedSections() {
  expandedMarkingSections.value = criteriaList.value.map(([sectionName]) => sectionName)
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

async function selectProject(id: number) {
  selectedProjectId.value = id
  selectedProject.value = null
  reviewResults.value = []
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
  reviewResults.value = []
  tendererFiles.value = []
  error.value = ''
  expandedMarkingSections.value = []
}

function isSectionOpen(sectionName: string) {
  return expandedMarkingSections.value.includes(sectionName)
}

function toggleSection(sectionName: string) {
  if (expandedMarkingSections.value.includes(sectionName)) {
    expandedMarkingSections.value = expandedMarkingSections.value.filter((item) => item !== sectionName)
    return
  }

  expandedMarkingSections.value = [...expandedMarkingSections.value, sectionName]
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

async function removeSelectedProjectById(projectId: number) {
  if (isDeletingProject.value) return

  const project = projects.value.find((item) => item.id === projectId)
  if (!project) return

  const confirmed = window.confirm(`Delete project "${project.title}"? This cannot be undone.`)
  if (!confirmed) return

  isDeletingProject.value = true
  error.value = ''
  try {
    await deleteProject(projectId)
    projects.value = projects.value.filter((item) => item.id !== projectId)
    if (selectedProject.value?.id === projectId) {
      clearSelectedProject()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not delete project.'
  } finally {
    isDeletingProject.value = false
  }
}

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
              v-if="hasResults"
              type="button"
              @click="downloadReport"
              class="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
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
                {{ isScoring ? 'Scoring…' : 'Run Review' }}
              </button>
              <span v-if="isScoring" class="text-xs text-slate-400">
                This may take a minute per file…
              </span>
            </div>
          </div>

          <div v-if="hasResults" class="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Results</p>
                <p class="mt-1 text-sm text-slate-500">
                  Review each tenderer’s score and disqualification status.
                </p>
              </div>
              <span
                v-if="disqualifiedCount > 0"
                class="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700"
              >
                {{ disqualifiedCount }} DQ'd
              </span>
            </div>

            <div class="space-y-4">
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
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-slate-900">
                      {{ tenderer.tenderer_file }}
                    </p>
                    <p v-if="!tenderer.error" class="text-xs text-slate-500">
                      Total: {{ totalScore(tenderer.results) }}
                    </p>
                  </div>
                  <span
                    v-if="tenderer.is_disqualified"
                    class="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white"
                  >
                    DQ
                  </span>
                  <span
                    v-else
                    class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                  >
                    Qualified
                  </span>
                </div>

                <p v-if="tenderer.error" class="mt-2 text-sm text-red-600">
                  {{ tenderer.error }}
                </p>

                <div v-else class="mt-3 space-y-2">
                  <div
                    v-for="result in tenderer.results"
                    :key="result.criterion"
                    class="rounded-2xl border border-slate-200 bg-white px-3 py-2"
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
