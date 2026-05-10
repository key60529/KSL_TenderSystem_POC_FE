/**
 * projectService.ts
 * Handles all project and review API calls to the FastAPI backend.
 */
import { BACKEND_URL, CONNECTION_TIMEOUT_MS } from './backendConfig'
import { getAuthToken } from './loginService'
import type { MarkingScheme, Project, ReviewResponse } from './backendTypes'

function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${getAuthToken()}` }
}

// ── Step 1-2: Upload tender document → get marking scheme from Dify ───────────

export async function analyseMarkingScheme(file: File): Promise<MarkingScheme> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${BACKEND_URL}/reviews/analyse-scheme`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    })

    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Scheme analysis failed (${response.status}): ${detail}`)
    }

    const data = (await response.json()) as { marking_scheme: MarkingScheme }
    return data.marking_scheme
}

// ── Step 4-5: Save project with confirmed marking scheme ──────────────────────

export async function saveProject(
    title: string,
    description: string,
    markingScheme: MarkingScheme,
    difyConversationId?: string,
): Promise<{ id: number }> {
    const response = await fetch(`${BACKEND_URL}/projects/`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title,
            description,
            master_requirements: markingScheme,
            dify_conversation_id: difyConversationId ?? '',
        }),
    })

    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to save project (${response.status}): ${detail}`)
    }

    return response.json() as Promise<{ id: number }>
}

// ── Step 6-7: List projects + fetch marking scheme ────────────────────────────

export async function listProjects(): Promise<Project[]> {
    const response = await fetch(`${BACKEND_URL}/projects/`, {
        headers: authHeaders(),
    })

    if (!response.ok) throw new Error(`Failed to load projects (${response.status})`)
    return response.json() as Promise<Project[]>
}

export async function getProject(projectId: number): Promise<Project> {
    const response = await fetch(`${BACKEND_URL}/projects/${projectId}`, {
        headers: authHeaders(),
    })

    if (!response.ok) throw new Error(`Failed to load project (${response.status})`)
    return response.json() as Promise<Project>
}

// ── Step 8-10: Score tenderer submissions ─────────────────────────────────────

export async function scoreSubmissions(
    projectId: number,
    files: File[],
): Promise<ReviewResponse> {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))

    // Scoring can take a while for multiple large files — use a generous timeout
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 5 * 60 * 1000) // 5 min

    try {
        const response = await fetch(`${BACKEND_URL}/reviews/${projectId}/score`, {
            method: 'POST',
            headers: authHeaders(),
            body: formData,
            signal: controller.signal,
        })

        if (!response.ok) {
            const detail = await response.text()
            throw new Error(`Scoring failed (${response.status}): ${detail}`)
        }

        return response.json() as Promise<ReviewResponse>
    } finally {
        window.clearTimeout(timeoutId)
    }
}
