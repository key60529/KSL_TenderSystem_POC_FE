import { BACKEND_WORKFLOW_KEY, MOCK_RESPONSE_DELAY_MS, WORKFLOW_ENDPOINT } from './backendConfig'
import type { SectionFilePayload, ValidationResult } from './backendTypes'

function createDelay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function extractRequiredSectionsFromJson(rawValue: unknown): string[] {
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => String(item)).filter((item) => item.trim().length > 0)
  }

  if (!rawValue || typeof rawValue !== 'object') {
    return []
  }

  const value = rawValue as SectionFilePayload
  const candidates = [value.required_sections, value.requiredSections, value.sections]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => String(item)).filter((item) => item.trim().length > 0)
    }
  }

  if (value.required_sections && typeof value.required_sections === 'object' && !Array.isArray(value.required_sections)) {
    return Object.keys(value.required_sections).map((item) => item.trim()).filter((item) => item.length > 0)
  }

  return []
}

export async function parseRequiredSectionsFromFile(file: File): Promise<string[]> {
  const fileContent = await file.text()
  const parsedJson = JSON.parse(fileContent) as unknown
  return extractRequiredSectionsFromJson(parsedJson)
}

export async function runValidationWorkflow(files: File[], requiredSections: string[]): Promise<ValidationResult[]> {
  if (BACKEND_WORKFLOW_KEY) {
    try {
      const formData = new FormData()

      files.forEach((file) => {
        formData.append('files', file)
      })

      formData.append('required_sections', JSON.stringify(requiredSections))

      const response = await fetch(WORKFLOW_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${BACKEND_WORKFLOW_KEY}`,
        },
        body: formData,
      })

      if (response.ok) {
        const data = (await response.json()) as unknown
        const backendData = data as Record<string, unknown>
        const results = backendData.results as ValidationResult[] | undefined

        if (Array.isArray(results)) {
          return results
        }
      }
    } catch (error) {
      console.error('Backend workflow API error:', error)
    }
  }

  await createDelay(MOCK_RESPONSE_DELAY_MS)

  const fileNames = files.map((file) => file.name.toLowerCase())
  const hasFiles = files.length > 0

  return requiredSections.map((section) => {
    const normalizedSection = section.toLowerCase()
    const tokens = normalizedSection.split(/[^a-z0-9]+/).filter((token) => token.length > 2)
    const matchedByFileName = tokens.some((token) => fileNames.some((fileName) => fileName.includes(token)))
    const found = hasFiles && (matchedByFileName || fileNames.length > 0)

    return {
      section,
      status: found ? 'found' : 'missing',
      location: found ? 'Mock match' : undefined,
      message: found ? 'Section matched the uploaded files.' : 'Section was not matched by the uploaded files.',
    }
  })
}
