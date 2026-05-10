export interface JsonMarkdownBlock {
  raw: string
  value: unknown
}

export interface TenderStructureSection {
  name: string
  requirements: string[]
}

export interface TenderStructureDocument {
  required_sections: TenderStructureSection[]
}

const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/gi

function normalizeRequirementList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
}

function normalizeTenderStructureDocument(value: unknown): TenderStructureDocument | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawSections = (value as Record<string, unknown>).required_sections
  if (!rawSections || typeof rawSections !== 'object' || Array.isArray(rawSections)) {
    return null
  }

  const sections = Object.entries(rawSections as Record<string, unknown>)
    .map(([name, requirements]) => ({
      name: String(name).trim(),
      requirements: normalizeRequirementList(requirements),
    }))
    .filter((section) => section.name.length > 0)

  if (sections.length === 0) {
    return null
  }

  return {
    required_sections: sections,
  }
}

function tryParseJsonPayload(raw: string): TenderStructureDocument | null {
  if (!raw.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return normalizeTenderStructureDocument(parsed)
  } catch {
    return null
  }
}

export function extractJsonMarkdownBlocks(markdown: string): JsonMarkdownBlock[] {
  const blocks: JsonMarkdownBlock[] = []
  const seenPayloads = new Set<string>()

  for (const match of markdown.matchAll(JSON_FENCE_PATTERN)) {
    const raw = (match[1] ?? '').trim()
    if (!raw) {
      continue
    }

    try {
      const value = JSON.parse(raw) as unknown
      const normalized = JSON.stringify(value)

      if (seenPayloads.has(normalized)) {
        continue
      }

      seenPayloads.add(normalized)
      blocks.push({ raw: JSON.stringify(value, null, 2), value })
    } catch {
      continue
    }
  }

  return blocks
}

export function hasJsonMarkdownBlocks(markdown: string): boolean {
  return extractJsonMarkdownBlocks(markdown).length > 0
}

export function parseTenderStructureFromMarkdown(markdown: string): TenderStructureDocument | null {
  const fencedBlocks = extractJsonMarkdownBlocks(markdown)

  for (const block of fencedBlocks) {
    const normalized = normalizeTenderStructureDocument(block.value)
    if (normalized) {
      return normalized
    }
  }

  return tryParseJsonPayload(markdown)
}
