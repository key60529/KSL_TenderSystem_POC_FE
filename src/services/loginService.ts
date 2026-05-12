import { AUTH_LOGIN_ENDPOINT, CONNECTION_TIMEOUT_MS } from './backendConfig'

export type LoginProvider = 'username-password' | 'sso'

export interface LoginRequest {
  username?: string
  password?: string
  provider: LoginProvider
}

export interface LoginResult {
  mode: 'backend'
  username: string
  message: string
}

const AUTH_COOKIE_NAME = 'username'
const TOKEN_STORAGE_KEY = 'auth_token'
const TOKEN_STORAGE_KEY_LEGACY = 'backend_auth_token'
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function buildCookieValue(username: string) {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(username)}; path=/; max-age=${AUTH_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
}

export function setUsernameCookie(username: string) {
  document.cookie = buildCookieValue(username)
}

export function readUsernameCookie(): string {
  const cookieEntry = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`))
  if (!cookieEntry) return ''
  return decodeURIComponent(cookieEntry.slice(`${AUTH_COOKIE_NAME}=`.length))
}

export function getAuthToken(): string {
  const sessionToken = sessionStorage.getItem(TOKEN_STORAGE_KEY)?.trim() ?? ''
  if (sessionToken) return sessionToken

  const localToken = localStorage.getItem(TOKEN_STORAGE_KEY)?.trim() ?? ''
  if (localToken) return localToken

  const legacyToken = localStorage.getItem(TOKEN_STORAGE_KEY_LEGACY)?.trim() ?? ''
  return legacyToken
}

function storeAuthToken(token: string) {
  const normalizedToken = token.trim()
  sessionStorage.setItem(TOKEN_STORAGE_KEY, normalizedToken)
  localStorage.setItem(TOKEN_STORAGE_KEY, normalizedToken)
}

export function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_STORAGE_KEY_LEGACY)
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`
}

/**
 * Attempts login against the FastAPI backend.
 * FastAPI's OAuth2PasswordRequestForm requires a form-encoded body (not JSON).
 * Throws an error when the backend rejects the credentials or is unreachable.
 */
async function tryBackendLogin(username: string, password: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)

  try {
    // FastAPI OAuth2PasswordRequestForm expects application/x-www-form-urlencoded.
    const body = new URLSearchParams({ username, password })

    const response = await fetch(AUTH_LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
      body: body.toString(),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Login failed (HTTP ${response.status}): ${detail || 'Unknown error'}`)
    }

    const data = (await response.json()) as { access_token?: string }
    if (!data.access_token) {
      throw new Error('Login failed: access_token was not returned by the backend.')
    }

    return data.access_token
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Login request timed out. Please check the backend connection.')
    }
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Login failed due to an unexpected error.')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function authenticateLogin(payload: LoginRequest): Promise<LoginResult> {
  const username = payload.username?.trim()

  if (payload.provider !== 'username-password') {
    throw new Error('SSO login is not implemented yet. Please use username and password.')
  }

  if (!username || !payload.password) {
    throw new Error('Username and password are required.')
  }

  const token = await tryBackendLogin(username, payload.password)
  storeAuthToken(token)
  setUsernameCookie(username)

  console.info('Login succeeded against backend.')
  return {
    mode: 'backend',
    username,
    message: 'Login successful. Entering workspace.',
  }
}
