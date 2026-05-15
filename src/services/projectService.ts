/**
 * projectService.ts
 * Handles all project and review API calls to the FastAPI backend.
 */
import { BACKEND_URL, CONNECTION_TIMEOUT_MS } from './backendConfig'
import { getAuthToken } from './loginService'
import type { MarkingScheme, ProjectRequirements, Project, ReviewResponse, ScoringJob, SubmitJobResponse, ReviewHistoryItem } from './backendTypes'

function authHeaders(): Record<string, string> {
    const token = getAuthToken().trim()
    if (!token) {
        throw new Error('Not authenticated. Please log in again.')
    }
    return { Authorization: `Bearer ${token}` }
}

export function buildProjectRequirementsFromStructure(
    structure: { required_sections: { name: string; requirements: string[] }[] },
): ProjectRequirements {
    return {
        required_sections: Object.fromEntries(
            structure.required_sections.map((section) => [section.name, section.requirements]),
        ),
    }
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

    const data = (await response.json()) as { marking_scheme: MarkingScheme | string }
    const raw = data.marking_scheme
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as MarkingScheme
}

// ── Step 4-5: Save project with confirmed marking scheme ──────────────────────

export async function saveProject(
    title: string,
    description: string,
    projectRequirements: ProjectRequirements,
    difyConversationId?: string,
): Promise<{ id: number }> {
    const response = await fetch(`${BACKEND_URL}/projects/`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title,
            description,
            master_requirements: projectRequirements,
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

export async function deleteProject(projectId: number): Promise<void> {
    const endpoints = [
        `${BACKEND_URL}/projects/${projectId}`,
        `${BACKEND_URL}/projects/${projectId}/`,
    ]

    let lastError: string | null = null

    for (const endpoint of endpoints) {
        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: authHeaders(),
        })

        if (response.ok) return

        const detail = await response.text()
        lastError = `DELETE ${endpoint} -> ${response.status}: ${detail || 'No response body'}`

        // If the backend is rejecting the route or method, try the alternate slash form.
        if (![404, 405, 307, 308].includes(response.status)) {
            break
        }
    }

    throw new Error(lastError ?? `Failed to delete project (${projectId})`)
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

// ── Conversation list (backend-persisted) ─────────────────────────────────────

export interface BackendConversation {
    id: number
    conversation_id: string
    title: string
    created_at: string | null
}

export async function listBackendConversations(): Promise<BackendConversation[]> {
    const response = await fetch(`${BACKEND_URL}/conversations/`, {
        headers: authHeaders(),
    })
    if (!response.ok) throw new Error(`Failed to load conversations (${response.status})`)
    return response.json() as Promise<BackendConversation[]>
}

export async function deleteBackendConversation(conversationId: string): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    })
    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to delete conversation (${response.status}): ${detail}`)
    }
}



export async function getReviewHistory(projectId: number): Promise<ReviewHistoryItem[]> {
    const response = await fetch(`${BACKEND_URL}/reviews/${projectId}/history`, {
        headers: authHeaders(),
    })
    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to load review history (${response.status}): ${detail}`)
    }
    return response.json() as Promise<ReviewHistoryItem[]>
}

// ── Async scoring jobs ────────────────────────────────────────────────────────

export async function submitScoringJob(projectId: number, files: File[]): Promise<SubmitJobResponse> {
    const formData = new FormData()
    for (const file of files) {
        formData.append('files', file)
    }
    const response = await fetch(`${BACKEND_URL}/reviews/${projectId}/score-async`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    })
    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to submit scoring job (${response.status}): ${detail}`)
    }
    return response.json() as Promise<SubmitJobResponse>
}

export async function pollJobStatus(jobId: number): Promise<ScoringJob> {
    const response = await fetch(`${BACKEND_URL}/reviews/jobs/${jobId}`, {
        headers: authHeaders(),
    })
    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to poll job status (${response.status}): ${detail}`)
    }
    return response.json() as Promise<ScoringJob>
}
