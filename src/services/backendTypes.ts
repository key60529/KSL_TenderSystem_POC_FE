export interface ChatAttachment {
  id: string
  fileName: string
  mimeType: string
  content: string
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  attachments?: ChatAttachment[]
}

export interface BackendConversationResponse {
  status: number
  messageId: string
  conversationId: string
  output: {
    text: string
  }
  attachments?: ChatAttachment[]
}

export interface ValidationResult {
  section: string
  status: 'found' | 'missing'
  location?: string
  message: string
}

export interface SectionFilePayload {
  required_sections?: string[] | Record<string, string[]>
  requiredSections?: string[]
  sections?: string[]
}

// ── Marking scheme / project types ───────────────────────────────────────────

export interface MarkingCriterion {
  description: string
  max_score: number
}

export interface MarkingScheme {
  [criterion: string]: MarkingCriterion
}

export interface ProjectRequirements {
  required_sections: Record<string, string[]>
}

export interface Project {
  id: number
  title: string
  description: string | null
  master_requirements: ProjectRequirements | MarkingScheme | null
}

// ── Review / scoring types ────────────────────────────────────────────────────

export interface CriterionResult {
  criterion: string
  score: number | null
  max_score: number | null
  status: 'pass' | 'fail' | 'dq'
  is_disqualified: boolean
  dq_reason: string | null
  evidence: string | null
  comment: string | null
}

export interface TendererResult {
  tenderer_file: string
  is_disqualified: boolean
  error?: string
  results: CriterionResult[]
}

export interface ReviewResponse {
  review_id: number
  project_id: number
  tenderer_count: number
  tenderers: TendererResult[]
}

// ── Async queue-based scoring types ──────────────────────────────────────────

export interface RequirementResult {
  requirement: string
  fulfilled: boolean
  score: number
  evaluation: string
  evidence: string
}

export interface SectionResult {
  section_name: string
  section_exists: boolean
  section_evaluation: string
  requirements: RequirementResult[]
}

export interface OverallSummary {
  total_sections: number
  sections_found: number
  overall_score: number
  general_evaluation: string
}

export interface ScoringResult {
  overall_summary: OverallSummary
  sections: SectionResult[]
}

export type JobFileStatus = 'pending' | 'processing' | 'done' | 'failed'
export type JobStatus = 'pending' | 'processing' | 'done' | 'partial' | 'failed'

export interface JobFile {
  id: number
  file_name: string
  status: JobFileStatus
  result: ScoringResult | null
  error: string | null
}

export interface ScoringJob {
  job_id: number
  project_id: number
  status: JobStatus
  files: JobFile[]
}

export interface SubmitJobResponse {
  job_id: number
  project_id: number
  file_count: number
  status: string
}


// ── Review history (manual refresh) ─────────────────────────────────────────

export interface ReviewHistoryFile {
  id: number
  file_name: string
  status: JobFileStatus
  result: ScoringResult | null
  error: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ReviewHistoryItem {
  job_id: number
  project_id: number
  status: JobStatus
  workflow_id: string | null
  created_at: string | null
  updated_at: string | null
  files: ReviewHistoryFile[]
}
