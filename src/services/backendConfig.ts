export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.trim() || 'http://localhost:8000'
export const BACKEND_CHATBOT_KEY = 'app-UnhDDkWMmnpIj70EcEVfkomo'
export const BACKEND_WORKFLOW_KEY = import.meta.env.VITE_BACKEND_WORKFLOW_KEY?.trim() || ''

// The actual login endpoint on the FastAPI backend (prefix: /auth, route: /login)
export const AUTH_LOGIN_ENDPOINT = `${BACKEND_URL}/auth/login`

export const DIFY_API_BASE_URL = import.meta.env.VITE_DIFY_API_BASE_URL?.trim() || 'http://192.168.8.162'
export const CHAT_ENDPOINT = import.meta.env.VITE_DIFY_CHAT_ENDPOINT?.trim() || `${DIFY_API_BASE_URL}/v1/chat-messages`
export const DIFY_USER_ID = import.meta.env.VITE_DIFY_USER_ID?.trim() || ''
export const DIFY_RESPONSE_MODE = 'blocking' as const

export const WORKFLOW_ENDPOINT = `${BACKEND_URL}/api/workflows/run`

export const CONNECTION_TIMEOUT_MS = 2500
export const CHAT_REQUEST_TIMEOUT_MS = 60000
export const MOCK_RESPONSE_DELAY_MS = 250
export const VALIDATION_DRAFT_STORAGE_KEY = 'tender-validation-draft-json'
