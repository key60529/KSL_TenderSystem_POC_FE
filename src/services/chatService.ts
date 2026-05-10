import {
  BACKEND_CHATBOT_KEY,
  CHAT_ENDPOINT,
  CHAT_REQUEST_TIMEOUT_MS,
  DIFY_RESPONSE_MODE,
  MOCK_RESPONSE_DELAY_MS,
  VALIDATION_DRAFT_STORAGE_KEY,
} from './backendConfig'
import { readUsernameCookie } from './loginService'
import type { BackendConversationResponse } from './backendTypes'

interface DifyChatFile {
  type: string
  transfer_method: 'remote_url' | 'local_file'
  url?: string
  upload_file_id?: string
}

interface DifyChatRequest {
  inputs: Record<string, unknown>
  query: string
  response_mode: typeof DIFY_RESPONSE_MODE
  conversation_id: string
  user: string
  files: DifyChatFile[]
}

interface DifyChatResponse {
  event?: string
  task_id?: string
  id?: string
  message_id?: string
  conversation_id?: string
  mode?: string
  answer?: string
  created_at?: number
  metadata?: unknown
}

interface ValidationDraft {
  fileName: string
  content: string
}

export function saveValidationDraftToStorage(content: string, fileName = 'tender-structure.json') {
  const draft: ValidationDraft = {
    fileName,
    content,
  }

  window.localStorage.setItem(VALIDATION_DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

export function readValidationDraftFromStorage(): ValidationDraft | null {
  const rawDraft = window.localStorage.getItem(VALIDATION_DRAFT_STORAGE_KEY)

  if (!rawDraft) {
    return null
  }

  try {
    const parsedDraft = JSON.parse(rawDraft) as Partial<ValidationDraft>

    if (typeof parsedDraft.fileName !== 'string' || typeof parsedDraft.content !== 'string') {
      return null
    }

    return {
      fileName: parsedDraft.fileName,
      content: parsedDraft.content,
    }
  } catch {
    return null
  }
}

export function clearValidationDraftFromStorage() {
  window.localStorage.removeItem(VALIDATION_DRAFT_STORAGE_KEY)
}

export async function sendBackendChatMessage(
  message: string,
  conversationId?: string,
): Promise<BackendConversationResponse> {
  const nextConversationId = conversationId || ''
  const nextMessageId = `msg-${Date.now()}`
  const currentUsername = readUsernameCookie().trim() || 'anonymous-user'

  if (BACKEND_CHATBOT_KEY) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS)

    try {
      const requestBody: DifyChatRequest = {
        inputs: {},
        query: message,
        response_mode: DIFY_RESPONSE_MODE,
        conversation_id: nextConversationId,
        user: currentUsername,
        files: [],
      }

      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BACKEND_CHATBOT_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const result = (await response.json()) as DifyChatResponse

        return {
          status: response.status,
          messageId: result.message_id || result.id || nextMessageId,
          conversationId: result.conversation_id || nextConversationId,
          output: {
            text: result.answer || 'No response from AI.',
          },
        }
      }
    } catch (error) {
      console.error('Dify API request failed:', error)
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, MOCK_RESPONSE_DELAY_MS)
  })

  return {
    status: 200,
    messageId: nextMessageId,
    conversationId: nextConversationId,
    output: { text: 'API key missing or request failed.' },
  }
}
