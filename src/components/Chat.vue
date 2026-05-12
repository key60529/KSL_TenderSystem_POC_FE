<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ChatMessage } from '../services/backendTypes'
import { sendBackendChatMessage, initiateDocumentChat } from '../services/chatService'
import {
  buildProjectRequirementsFromStructure,
  saveProject,
  listBackendConversations,
  deleteBackendConversation,
} from '../services/projectService'
import {
  parseTenderStructureFromMarkdown,
  type TenderStructureDocument,
} from '../services/chatArtifacts'
import {
  createConversationRecord,
  loadChatHistoryState,
  saveChatHistoryState,
  upsertConversation,
  type ChatConversation,
} from '../services/chatHistory'

interface RenderedStructureSection {
  name: string
  requirements: string[]
}

const messages = ref<ChatMessage[]>([])
const inputMessage = ref('')
const conversationId = ref('')
const isLoading = ref(false)
const error = ref('')
const chatContainer = ref<HTMLElement | null>(null)
const conversations = ref<ChatConversation[]>([])
const activeConversationId = ref<string | null>(null)
const isHistoryCollapsed = ref(false)
const isInspectorCollapsed = ref(false)
const openStructureSections = ref<string[]>([])
const isSaveProjectDialogOpen = ref(false)
const projectName = ref('')
const isSavingProject = ref(false)
const saveProjectNotice = ref('')
const saveProjectError = ref('')

// ── Upload-to-chat modal state ─────────────────────────────────────────────
const isUploadModalOpen = ref(false)
const uploadModalFile = ref<File | null>(null)
const isUploadingDoc = ref(false)
const uploadModalError = ref('')
const uploadFileInputRef = ref<HTMLInputElement | null>(null)

const activeConversation = computed(
  () =>
    conversations.value.find(
      (conversation) => conversation.conversationId === activeConversationId.value,
    ) ?? null,
)

const isConversationLocked = computed(() => activeConversation.value?.isLocked === true)

const hasConversationHistory = computed(() => conversations.value.length > 0)

const latestStructuredResponse = computed<TenderStructureDocument | null>(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index]

    if (message?.role !== 'assistant') {
      continue
    }

    const structure = parseTenderStructureFromMarkdown(message.content)
    if (structure) {
      return structure
    }
  }

  return null
})

const structuredSections = computed<RenderedStructureSection[]>(() => {
  return latestStructuredResponse.value?.required_sections ?? []
})

const hasStructuredResponse = computed(() => structuredSections.value.length > 0)

const collapsedRailWidth = '30px'
const expandedHistoryWidth = '280px'
const expandedInspectorWidth = '50%'

const historyPanelWidth = computed(() =>
  isHistoryCollapsed.value ? collapsedRailWidth : expandedHistoryWidth,
)

const inspectorPanelWidth = computed(() =>
  isInspectorCollapsed.value ? collapsedRailWidth : expandedInspectorWidth,
)

const hasAnyCollapsedPanel = computed(() => isHistoryCollapsed.value || isInspectorCollapsed.value)

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

function syncStore() {
  if (!activeConversationId.value || messages.value.length === 0) {
    saveChatHistoryState({
      activeConversationId: activeConversationId.value,
      conversations: conversations.value,
    })
    return
  }

  const currentRecord = createConversationRecord(activeConversationId.value, messages.value)
  conversations.value = upsertConversation(conversations.value, {
    ...currentRecord,
    title: activeConversation.value?.title || currentRecord.title,
    createdAt: activeConversation.value?.createdAt ?? currentRecord.createdAt,
    updatedAt: Date.now(),
  })

  saveChatHistoryState({
    activeConversationId: activeConversationId.value,
    conversations: conversations.value,
  })
}

function loadConversation(conversationIdToLoad: string) {
  const selectedConversation = conversations.value.find(
    (item) => item.conversationId === conversationIdToLoad,
  )

  if (!selectedConversation) {
    return
  }

  activeConversationId.value = selectedConversation.conversationId
  conversationId.value = selectedConversation.conversationId
  messages.value = selectedConversation.messages.map((message) => ({ ...message }))
  error.value = ''
  scrollToBottom()

  saveChatHistoryState({
    activeConversationId: activeConversationId.value,
    conversations: conversations.value,
  })
}

function startNewConversation() {
  if (activeConversationId.value && messages.value.length > 0) {
    syncStore()
  }

  activeConversationId.value = null
  conversationId.value = ''
  messages.value = []
  error.value = ''
  inputMessage.value = ''
  openStructureSections.value = []
  projectName.value = ''
  saveProjectNotice.value = ''
  saveProjectError.value = ''

  saveChatHistoryState({
    activeConversationId: null,
    conversations: conversations.value,
  })
}

// ── Upload modal helpers ────────────────────────────────────────────────────

function openUploadModal() {
  uploadModalFile.value = null
  uploadModalError.value = ''
  isUploadModalOpen.value = true
}

function cancelUploadModal() {
  isUploadModalOpen.value = false
  uploadModalFile.value = null
  uploadModalError.value = ''
}

async function deleteConversation(conversationId: string) {
  try {
    await deleteBackendConversation(conversationId)
  } catch {
    // Non-fatal — remove from local list anyway
  }
  conversations.value = conversations.value.filter((c) => c.conversationId !== conversationId)

  // If we deleted the active conversation, reset the chat
  if (activeConversationId.value === conversationId) {
    activeConversationId.value = null
    conversationId = ''
    messages.value = []
    error.value = ''
  }

  saveChatHistoryState({
    activeConversationId: activeConversationId.value,
    conversations: conversations.value,
  })
}

function handleUploadFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  uploadModalFile.value = file
  uploadModalError.value = ''
}

async function confirmUploadModal() {
  const file = uploadModalFile.value
  if (!file) {
    uploadModalError.value = 'Please select a tender document to upload.'
    return
  }

  isUploadingDoc.value = true
  uploadModalError.value = ''

  try {
    // Save any in-progress conversation before starting fresh
    if (activeConversationId.value && messages.value.length > 0) {
      syncStore()
    }

    // Reset chat state
    activeConversationId.value = null
    conversationId.value = ''
    messages.value = []
    error.value = ''
    inputMessage.value = ''
    openStructureSections.value = []
    projectName.value = ''
    saveProjectNotice.value = ''
    saveProjectError.value = ''

    // Close modal before the network call so the user sees the chat loading state
    isUploadModalOpen.value = false

    // Show a placeholder user message with the file name
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: `📄 Uploaded: **${file.name}**`,
      timestamp: Date.now(),
    }
    messages.value.push(userMessage)
    isLoading.value = true
    scrollToBottom()

    const response = await initiateDocumentChat(file)

    conversationId.value = response.conversationId
    activeConversationId.value = response.conversationId

    messages.value.push({
      id: response.messageId,
      role: 'assistant',
      content: response.output.text,
      timestamp: Date.now(),
    })

    // Persist the new conversation
    const record = createConversationRecord(response.conversationId, messages.value)
    conversations.value = upsertConversation(conversations.value, {
      ...record,
      title: file.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    saveChatHistoryState({
      activeConversationId: response.conversationId,
      conversations: conversations.value,
    })

    scrollToBottom()
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Failed to upload document. Please try again.'
  } finally {
    isUploadingDoc.value = false
    isLoading.value = false
    uploadModalFile.value = null
  }
}

function getConversationPreview(conversation: ChatConversation) {
  const firstMessage = conversation.messages
    .find((message) => message.role === 'user')
    ?.content.trim()
  const preview = firstMessage || conversation.title
  return preview.replace(/\s+/g, ' ')
}

function formatConversationDate(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getDisplayMessageContent(message: string) {
  // Remove the special marker line before the markdown renderer runs.
  return message
    .replace(/^\s*#### File icon location\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function shouldShowStructureAction(message: string) {
  return message.includes('#### File icon location')
}

function renderInlineMarkdown(value: string, isUserMessage: boolean) {
  const codeClass = isUserMessage
    ? 'rounded bg-white/15 px-1.5 py-0.5 font-mono text-[0.9em] text-current'
    : 'rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-current'

  const inlineCodeBlocks: string[] = []
  const tokenizedValue = value.replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `@@INLINE_CODE_${inlineCodeBlocks.length}@@`
    inlineCodeBlocks.push(`<code class="${codeClass}">${escapeHtml(code)}</code>`)
    return token
  })

  let rendered = escapeHtml(tokenizedValue)
    .replace(
      /\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener" class="font-medium underline underline-offset-2">$1</a>',
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/_(.+?)_/g, '<em class="italic">$1</em>')

  inlineCodeBlocks.forEach((snippet, index) => {
    rendered = rendered.replace(`@@INLINE_CODE_${index}@@`, snippet)
  })

  return rendered
}

function renderMarkdown(message: string, isUserMessage = false) {
  const normalized = getDisplayMessageContent(message).replace(/\r\n/g, '\n')
  const codeBlocks: string[] = []

  const withCodeTokens = normalized.replace(
    /```([^\n`]*)\n([\s\S]*?)```/g,
    (_, languageRaw: string, code: string) => {
      const language = languageRaw.trim().toLowerCase()

      if (language === 'json') {
        // Hide JSON fenced blocks completely in the chat bubble.
        return ''
      }

      const token = `__CODE_BLOCK_${codeBlocks.length}__`
      codeBlocks.push(
        `<pre class="overflow-x-auto rounded-2xl px-4 py-3 text-sm leading-6 ${isUserMessage ? 'bg-white/10 text-white' : 'bg-slate-950 text-slate-100'}"><code class="font-mono">${escapeHtml(code.trimEnd())}</code></pre>`,
      )
      return token
    },
  )

  const lines = withCodeTokens.split('\n')
  const blocks: string[] = []
  let paragraphLines: string[] = []
  let listItems: string[] = []

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return
    }

    blocks.push(
      `<p class="whitespace-pre-wrap break-words">${paragraphLines.map((line) => renderInlineMarkdown(line, isUserMessage)).join('<br />')}</p>`,
    )
    paragraphLines = []
  }

  function flushList() {
    if (listItems.length === 0) {
      return
    }

    blocks.push(
      `<ul class="space-y-1 pl-5">${listItems.map((item) => `<li class="list-disc">${renderInlineMarkdown(item, isUserMessage)}</li>`).join('')}</ul>`,
    )
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const codeTokenMatch = line.match(/^__CODE_BLOCK_(\d+)__$/)
    if (codeTokenMatch) {
      flushParagraph()
      flushList()
      const codeIndex = Number(codeTokenMatch[1])
      const codeBlock = codeBlocks[codeIndex]
      if (codeBlock) {
        blocks.push(codeBlock)
      }
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      const headingLevel = Math.min(headingMatch[1]?.length ?? 0, 3)
      const headingText = headingMatch[2] ?? ''
      blocks.push(
        `<h${headingLevel}>${renderInlineMarkdown(headingText, isUserMessage)}</h${headingLevel}>`,
      )
      continue
    }

    const listMatch = line.match(/^[-*+]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      listItems.push(listMatch[1] ?? '')
      continue
    }

    flushList()
    paragraphLines.push(line)
  }

  flushParagraph()
  flushList()

  return blocks.join('<div class="h-2"></div>')
}

function isStructureSectionOpen(sectionName: string) {
  return openStructureSections.value.includes(sectionName)
}

function toggleStructureSection(sectionName: string) {
  if (openStructureSections.value.includes(sectionName)) {
    openStructureSections.value = openStructureSections.value.filter((name) => name !== sectionName)
    return
  }

  openStructureSections.value = [...openStructureSections.value, sectionName]
}

function openInspectorPanel() {
  isInspectorCollapsed.value = false
}

function openSaveProjectDialog() {
  saveProjectNotice.value = ''
  saveProjectError.value = ''

  if (!hasStructuredResponse.value) {
    saveProjectError.value = 'No structured assistant response is available to save.'
    return
  }

  isSaveProjectDialogOpen.value = true
  projectName.value = ''
}

function cancelSaveProjectDialog() {
  // Close the dialog without taking any save action.
  isSaveProjectDialogOpen.value = false
  projectName.value = ''
  saveProjectError.value = ''
}

async function confirmSaveProjectDialog() {
  const name = projectName.value.trim()
  const structure = latestStructuredResponse.value

  if (!hasStructuredResponse.value || !structure) {
    saveProjectError.value = 'No structured assistant response is available to save.'
    return
  }

  if (!name) {
    saveProjectError.value = 'Please enter a project name.'
    return
  }

  isSavingProject.value = true
  saveProjectError.value = ''
  saveProjectNotice.value = ''

  try {
    const projectRequirements = buildProjectRequirementsFromStructure(structure)
    await saveProject(name, '', projectRequirements, conversationId.value || undefined)

    // Lock the active conversation so it cannot be continued
    if (activeConversationId.value) {
      const idx = conversations.value.findIndex(
        (c) => c.conversationId === activeConversationId.value,
      )

      const conversationToLock = conversations.value[idx]

      if (idx !== -1 && conversationToLock) {
        conversations.value[idx] = {
          ...conversationToLock,
          isLocked: true,
        }

        saveChatHistoryState({
          activeConversationId: activeConversationId.value,
          conversations: conversations.value,
        })
      }
    }

    // Close the dialog automatically on success
    isSaveProjectDialogOpen.value = false

  } catch (err) {
    saveProjectError.value = err instanceof Error ? err.message : 'Failed to save project.'
  } finally {
    isSavingProject.value = false
  }
}

async function sendMessage() {
  const text = inputMessage.value.trim()
  if (!text || isLoading.value || isConversationLocked.value) {
    return
  }

  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  }

  messages.value.push(userMessage)
  inputMessage.value = ''
  isLoading.value = true
  error.value = ''
  scrollToBottom()

  try {
    const response = await sendBackendChatMessage(text, conversationId.value)

    if (response.conversationId) {
      conversationId.value = response.conversationId
      activeConversationId.value = response.conversationId
    }

    messages.value.push({
      id: response.messageId,
      role: 'assistant',
      content: response.output.text,
      timestamp: Date.now(),
    })

    if (conversationId.value || response.conversationId) {
      const storedConversationId = conversationId.value || response.conversationId
      if (storedConversationId) {
        activeConversationId.value = storedConversationId
        const draftConversation = createConversationRecord(storedConversationId, messages.value)
        conversations.value = upsertConversation(conversations.value, {
          conversationId: storedConversationId,
          title: activeConversation.value?.title || draftConversation.title,
          createdAt: activeConversation.value?.createdAt ?? draftConversation.createdAt,
          updatedAt: Date.now(),
          messages: messages.value.map((message) => ({ ...message })),
        })
        saveChatHistoryState({
          activeConversationId: storedConversationId,
          conversations: conversations.value,
        })
      }
    }

    scrollToBottom()
  } catch (err) {
    error.value = 'Message delivery failed. Please try again later.'
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendMessage()
  }
}

watch(latestStructuredResponse, (structure) => {
  openStructureSections.value = structure?.required_sections.map((section) => section.name) ?? []
})

onMounted(async () => {
  // Load conversation list from backend (persisted per user)
  try {
    const backendConvs = await listBackendConversations()
    // Merge backend list with any locally cached messages
    const historyState = loadChatHistoryState()
    const localMap = new Map(historyState.conversations.map((c) => [c.conversationId, c]))

    conversations.value = backendConvs.map((bc) => {
      const local = localMap.get(bc.conversation_id)
      return {
        conversationId: bc.conversation_id,
        title: bc.title || bc.conversation_id.slice(0, 12),
        createdAt: bc.created_at ? new Date(bc.created_at).getTime() : Date.now(),
        updatedAt:
          local?.updatedAt ?? (bc.created_at ? new Date(bc.created_at).getTime() : Date.now()),
        messages: local?.messages ?? [],
      }
    })

    // Restore active conversation if one was open
    if (historyState.activeConversationId) {
      loadConversation(historyState.activeConversationId)
      return
    }
  } catch {
    // Fall back to local history if backend is unreachable
    const historyState = loadChatHistoryState()
    conversations.value = historyState.conversations
    if (historyState.activeConversationId) {
      loadConversation(historyState.activeConversationId)
      return
    }
  }

  scrollToBottom()
})
</script>

<template>
  <div
    class="relative flex h-full min-h-0 overflow-hidden"
    :class="hasAnyCollapsedPanel ? 'gap-3' : 'gap-4'"
  >
    <aside
      class="min-h-0 shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out"
      :style="{ width: historyPanelWidth }"
    >
      <Transition name="panel-fade" mode="out-in">
        <div v-if="isHistoryCollapsed" key="history-collapsed" class="flex h-full min-h-0">
          <button
            type="button"
            @click="isHistoryCollapsed = false"
            class="flex h-full w-full items-center justify-center rounded-3xl bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Open history panel"
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

        <div v-else key="history-expanded" class="flex h-full min-h-0 flex-col">
          <div class="shrink-0 border-b border-slate-100 px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">History</p>
                <h2 class="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  Conversations
                </h2>
              </div>

              <button
                type="button"
                @click="isHistoryCollapsed = true"
                class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Hide history panel"
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

          <div class="min-h-0 flex-1 overflow-y-auto p-3">
            <div v-if="hasConversationHistory" class="space-y-2">
              <div
                v-for="conversation in conversations"
                :key="conversation.conversationId"
                class="group relative"
              >
                <button
                  type="button"
                  @click="loadConversation(conversation.conversationId)"
                  :class="[
                    'w-full rounded-2xl border px-4 py-3 text-left transition',
                    conversation.conversationId === activeConversationId
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100',
                  ]"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <svg
                          v-if="conversation.isLocked"
                          viewBox="0 0 20 20"
                          class="h-3 w-3 shrink-0 opacity-60"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-label="Locked"
                        >
                          <rect x="4" y="9" width="12" height="9" rx="2" />
                          <path d="M7 9V6a3 3 0 0 1 6 0v3" />
                        </svg>
                        <p class="truncate text-sm font-medium">{{ conversation.title }}</p>
                      </div>
                      <p class="mt-1 truncate text-xs opacity-70">
                        {{ getConversationPreview(conversation) }}
                      </p>
                    </div>
                  </div>

                  <div
                    class="mt-3 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.18em]"
                    :class="
                      conversation.conversationId === activeConversationId
                        ? 'text-slate-300'
                        : 'text-slate-400'
                    "
                  >
                    <span>{{ conversation.conversationId.slice(0, 12) }}</span>
                    <span>{{ formatConversationDate(conversation.updatedAt) }}</span>
                  </div>
                </button>

                <!-- Delete button — visible on hover -->
                <button
                  type="button"
                  @click.stop="deleteConversation(conversation.conversationId)"
                  class="absolute right-2 top-2 hidden rounded-full p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 group-hover:flex"
                  aria-label="Delete conversation"
                >
                  <svg
                    viewBox="0 0 20 20"
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 8v8M10 8v8M14 8v8M4 5h12M8 5V3h4v2" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              v-else
              class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"
            >
              No conversation history yet.
            </div>
          </div>
        </div>
      </Transition>
    </aside>

    <section
      :class="[
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out',
        isInspectorCollapsed ? 'flex-1' : 'flex-1'
      ]"
    >
      <div class="shrink-0 border-b border-slate-100 px-4 py-3">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Workspace</p>
            <h2 class="mt-1 text-lg font-semibold tracking-tight text-slate-900">Chatroom</h2>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              @click="openUploadModal"
              class="rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-700"
            >
              New
            </button>
          </div>
        </div>
      </div>

      <div
        ref="chatContainer"
        class="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4 sm:px-5"
      >
        <div
          v-if="messages.length === 0"
          class="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500 shadow-sm"
        >
          Start a conversation by typing a message below.
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['mb-4 flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
        >
          <div
            :class="[
              'max-w-[min(44rem,85%)] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm',
              msg.role === 'user'
                ? 'rounded-br-md bg-slate-900 text-white'
                : 'rounded-bl-md border border-slate-200 bg-white text-slate-900',
            ]"
          >
            <div
              class="markdown-content"
              v-html="renderMarkdown(msg.content, msg.role === 'user')"
            />

            <button
              v-if="shouldShowStructureAction(msg.content)"
              type="button"
              @click="openInspectorPanel"
              :disabled="!isInspectorCollapsed"
              class="mt-3 inline-flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition"
              :class="
                isInspectorCollapsed
                  ? 'border-slate-300 bg-slate-50 text-slate-900 hover:border-slate-400 hover:bg-white'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              "
            >
              Please check the structure in the preview panel.
            </button>
          </div>
        </div>

        <div v-if="isLoading" class="flex justify-start">
          <div
            class="rounded-3xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm"
            aria-live="polite"
            aria-label="Assistant is thinking"
          >
            <span class="thinking-dots" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </div>
        </div>

        <div
          v-if="error"
          class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ error }}
        </div>
      </div>

      <div class="shrink-0 border-t border-slate-100 bg-white p-3 sm:p-4">
        <!-- Locked banner -->
        <div
          v-if="isConversationLocked"
          class="mb-3 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700"
        >
          <svg
            viewBox="0 0 20 20"
            class="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="9" width="12" height="9" rx="2" />
            <path d="M7 9V6a3 3 0 0 1 6 0v3" />
          </svg>
          <span>This conversation has been saved as a project and is now read-only.</span>
        </div>

        <div class="flex items-end gap-3">
          <textarea
            v-model="inputMessage"
            :disabled="isLoading || isConversationLocked"
            @keydown="handleKeyDown"
            :placeholder="
              isConversationLocked
                ? 'Conversation locked — start a new chat to continue.'
                : 'Type your message...'
            "
            rows="1"
            class="h-20 min-h-[3.25rem] flex-1 resize-none rounded-3xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
          />

          <button
            type="button"
            @click="sendMessage"
            :disabled="!inputMessage.trim() || isLoading || isConversationLocked"
            class="h-12 shrink-0 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {{ isLoading ? 'Sending' : 'Send' }}
          </button>
        </div>
      </div>
    </section>

    <aside
      class="min-h-0 shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-[width] duration-300 ease-in-out"
      :style="{ width: inspectorPanelWidth }"
    >
      <Transition name="panel-fade" mode="out-in">
        <div v-if="isInspectorCollapsed" key="inspector-collapsed" class="flex h-full min-h-0">
          <button
            type="button"
            @click="isInspectorCollapsed = false"
            class="flex h-full w-full items-center justify-center rounded-3xl bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Open structure panel"
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

        <div v-else key="inspector-expanded" class="flex h-full min-h-0 flex-col">
          <div class="shrink-0 border-b border-slate-100 px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Preview</p>
                <h2 class="mt-1 text-lg font-semibold tracking-tight text-slate-900">Structure</h2>
              </div>

              <button
                type="button"
                @click="isInspectorCollapsed = true"
                class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Hide structure panel"
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

          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div v-if="hasStructuredResponse" class="space-y-3">
              <div
                v-for="section in structuredSections"
                :key="section.name"
                class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
              >
                <button
                  type="button"
                  @click="toggleStructureSection(section.name)"
                  class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-100"
                >
                  <span class="text-sm font-semibold text-slate-900">{{ section.name }}</span>
                  <span
                    class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                  >
                    <svg
                      v-if="isStructureSectionOpen(section.name)"
                      viewBox="0 0 20 20"
                      class="h-4 w-4"
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
                  </span>
                </button>

                <div
                  v-show="isStructureSectionOpen(section.name)"
                  class="border-t border-slate-200 px-4 py-3"
                >
                  <ul class="space-y-2 text-sm leading-6 text-slate-700">
                    <li
                      v-for="(requirement, requirementIndex) in section.requirements"
                      :key="`${section.name}-${requirementIndex}`"
                      class="flex gap-2"
                    >
                      <span class="shrink-0 select-none text-slate-400">-</span>
                      <span class="break-words">{{ requirement }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div
              v-else
              class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"
            >
              The latest assistant response has no structured JSON yet.
            </div>
          </div>

          <div class="shrink-0 border-t border-slate-100 bg-white p-3">
            <div
              v-if="saveProjectNotice"
              class="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              {{ saveProjectNotice }}
            </div>
            <button
              type="button"
              @click="openSaveProjectDialog"
              :disabled="isConversationLocked"
              class="w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {{ isConversationLocked ? 'Saved as Project' : 'Save As Project' }}
            </button>
          </div>
        </div>
      </Transition>
    </aside>

    <!-- ── Upload-to-chat modal ───────────────────────────────────────────── -->
    <div
      v-if="isUploadModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 id="upload-modal-title" class="text-lg font-semibold tracking-tight text-slate-900">
          Upload Tender Document
        </h3>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Select a tender document (PDF or DOCX) to start a new chat. The document will be analysed
          and a marking scheme will be extracted automatically.
        </p>

        <!-- Hidden file input -->
        <input
          ref="uploadFileInputRef"
          type="file"
          accept=".pdf,.docx,.doc"
          class="sr-only"
          @change="handleUploadFileChange"
        />

        <!-- Drop zone / file picker trigger -->
        <button
          type="button"
          @click="uploadFileInputRef?.click()"
          :disabled="isUploadingDoc"
          class="mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-8 w-8 text-slate-400"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <polyline points="16 8 12 4 8 8" />
            <line x1="12" y1="4" x2="12" y2="16" />
          </svg>
          <span v-if="uploadModalFile" class="font-medium text-slate-900 break-all text-center">{{
            uploadModalFile.name
          }}</span>
          <span v-else>Click to choose a file&nbsp;&nbsp;·&nbsp;&nbsp;PDF or DOCX</span>
        </button>

        <div
          v-if="uploadModalError"
          class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ uploadModalError }}
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            @click="cancelUploadModal"
            :disabled="isUploadingDoc"
            class="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmUploadModal"
            :disabled="!uploadModalFile || isUploadingDoc"
            class="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {{ isUploadingDoc ? 'Uploading…' : 'Upload & Start Chat' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Save-project dialog ─────────────────────────────────────────────── -->
    <div
      v-if="isSaveProjectDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-project-title"
    >
      <div class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 id="save-project-title" class="text-lg font-semibold tracking-tight text-slate-900">
          Save Structure as Project?
        </h3>
        <p class="mt-3 text-sm leading-6 text-slate-600">
          Are you sure you want to save this Structure as a project? After saving, this Structure
          will no longer be editable.
        </p>

        <label class="mt-5 block">
          <span class="mb-2 block text-sm font-medium text-slate-700">Project name</span>
          <input
            v-model="projectName"
            type="text"
            placeholder="Project name"
            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
          />
        </label>

        <div
          v-if="saveProjectError"
          class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ saveProjectError }}
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            @click="cancelSaveProjectDialog"
            class="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="confirmSaveProjectDialog"
            :disabled="isSavingProject"
            class="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {{ isSavingProject ? 'Saving…' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.markdown-content :deep(a) {
  color: inherit;
}

.markdown-content :deep(p) {
  margin: 0;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin: 0;
  font-weight: 600;
  line-height: 1.35;
}

.markdown-content :deep(pre) {
  margin: 0;
}

.markdown-content :deep(code) {
  white-space: pre-wrap;
}

.markdown-content :deep(ul) {
  margin: 0;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  min-width: 1.6rem;
}

.thinking-dots span {
  width: 0.34rem;
  height: 0.34rem;
  border-radius: 9999px;
  background: currentColor;
  animation: thinking-bounce 1.05s infinite ease-in-out;
}

.thinking-dots span:nth-child(2) {
  animation-delay: 0.14s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0.28s;
}

.structure-link-button {
  position: relative;
  overflow: hidden;
}

.structure-link-button::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0));
  opacity: 0;
  transition: opacity 180ms ease;
}

.structure-link-button:hover::before {
  opacity: 1;
}

@keyframes thinking-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  40% {
    transform: translateY(-0.28rem);
    opacity: 1;
  }
}
</style>
