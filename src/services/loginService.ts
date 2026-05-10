import { AUTH_LOGIN_ENDPOINT, CONNECTION_TIMEOUT_MS } from './backendConfig'

export type LoginProvider = 'username-password' | 'sso'

export interface LoginRequest {
  username?: string
  password?: string
  provider: LoginProvider
}

export interface LoginResult {
  mode: 'backend' | 'mock'
  username: string
  message: string
}

const AUTH_COOKIE_NAME = 'username'
const TOKEN_STORAGE_KEY = 'auth_token'
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
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? ''
}

function storeAuthToken(token: string) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`
}

/**
 * Attempts login against the FastAPI backend.
 * FastAPI's OAuth2PasswordRequestForm requires form-encoded body (not JSON).
 * Returns the JWT access_token on success, or null on failure.
 */
async function tryBackendLogin(username: string, password: string): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)

  try {
    // FastAPI OAuth2PasswordRequestForm expects application/x-www-form-urlencoded
    const body = new URLSearchParams({ username, password })

    const response = await fetch(AUTH_LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
      body: body.toString(),
    })

    if (!response.ok) {
      console.warn(`Login failed: HTTP ${response.status}`)
      return null
    }

    const data = await response.json()
    return data.access_token ?? null
  } catch (error) {
    console.warn('Backend login unreachable, falling back to mock mode.', error)
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function authenticateLogin(payload: LoginRequest): Promise<LoginResult> {
  const username = payload.username?.trim() || 'guest'

  if (payload.provider === 'username-password' && payload.username && payload.password) {
    const token = await tryBackendLogin(payload.username, payload.password)

    if (token) {
      storeAuthToken(token)
      setUsernameCookie(username)
      console.info('Login succeeded against backend.')
      return {
        mode: 'backend',
        username,
        message: 'Login successful. Entering workspace.',
      }
    }

    // Credentials were provided but backend rejected or was unreachable — use mock
    console.warn('Backend login failed or unavailable. Using mock mode.')
  }

  // SSO or fallback mock path
  setUsernameCookie(username)
  return {
    mode: 'mock',
    username,
    message: 'Backend unavailable. Using mock mode.',
  }
}
