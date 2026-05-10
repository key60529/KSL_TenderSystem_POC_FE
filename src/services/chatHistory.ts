import type { ChatMessage } from './backendTypes'

const CHAT_HISTORY_STORAGE_KEY = 'tender-chat-history-v1'

export interface ChatConversation {
  conversationId: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface ChatHistoryState {
  activeConversationId: string | null
  conversations: ChatConversation[]
}

const EMPTY_STATE: ChatHistoryState = {
  activeConversationId: null,
  conversations: [],
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
  }))
}

function normalizeConversation(input: Partial<ChatConversation>): ChatConversation | null {
  if (
    typeof input.conversationId !== 'string' ||
    typeof input.title !== 'string' ||
    typeof input.createdAt !== 'number' ||
    typeof input.updatedAt !== 'number' ||
    !Array.isArray(input.messages)
  ) {
    return null
  }

  const messages = input.messages
    .filter((message): message is ChatMessage => {
      return (
        typeof message === 'object' &&
        message !== null &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string'
      )
    })
    .map((message) => ({
      id: typeof message.id === 'string' ? message.id : undefined,
      role: message.role,
      content: message.content,
      timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
      attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
    }))

  return {
    conversationId: input.conversationId,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    messages,
  }
}

export function loadChatHistoryState(): ChatHistoryState {
  if (typeof window === 'undefined') {
    return EMPTY_STATE
  }

  const rawValue = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY)
  if (!rawValue) {
    return EMPTY_STATE
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ChatHistoryState>

    const conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations
          .map((conversation) => normalizeConversation(conversation))
          .filter((conversation): conversation is ChatConversation => conversation !== null)
          .sort((left, right) => right.updatedAt - left.updatedAt)
      : []

    const activeConversationId =
      typeof parsed.activeConversationId === 'string' && parsed.activeConversationId.trim().length > 0
        ? parsed.activeConversationId
        : conversations[0]?.conversationId ?? null

    return {
      activeConversationId,
      conversations,
    }
  } catch {
    return EMPTY_STATE
  }
}

export function saveChatHistoryState(state: ChatHistoryState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    CHAT_HISTORY_STORAGE_KEY,
    JSON.stringify({
      activeConversationId: state.activeConversationId,
      conversations: state.conversations,
    }),
  )
}

export function createConversationTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim()

  if (!firstUserMessage) {
    return 'New conversation'
  }

  const compactTitle = firstUserMessage.replace(/\s+/g, ' ')
  return compactTitle.length > 42 ? `${compactTitle.slice(0, 42).trimEnd()}…` : compactTitle
}

export function upsertConversation(
  conversations: ChatConversation[],
  conversation: ChatConversation,
): ChatConversation[] {
  const nextConversation: ChatConversation = {
    conversationId: conversation.conversationId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: cloneMessages(conversation.messages),
  }

  const nextConversations = conversations
    .filter((item) => item.conversationId !== conversation.conversationId)
    .concat(nextConversation)
    .sort((left, right) => right.updatedAt - left.updatedAt)

  return nextConversations
}

export function createConversationRecord(conversationId: string, messages: ChatMessage[]): ChatConversation {
  const now = Date.now()

  return {
    conversationId,
    title: createConversationTitle(messages),
    createdAt: now,
    updatedAt: now,
    messages: cloneMessages(messages),
  }
}
