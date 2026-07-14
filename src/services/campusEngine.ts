import { campusDestinations, knowledgeDocuments } from '../data/knowledge'

export type SearchResult = {
  id: string
  title: string
  category: string
  audience: string
  content: string
  score: number
}

export type NavigationResult = {
  name: string
  type: string
  location: string
  guidance: string
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

export function searchKnowledge(query: string): SearchResult[] {
  const normalized = normalize(query)
  if (!normalized) return []

  return knowledgeDocuments
    .map((document) => {
      const keywordHits = document.keywords.filter((keyword) =>
        normalized.includes(keyword.toLowerCase()),
      ).length
      const titleHit = normalize(document.title).includes(normalized) ? 3 : 0
      const contentHit = normalize(document.content).includes(normalized) ? 2 : 0
      const categoryHit = normalize(document.category).includes(normalized) ? 1 : 0

      return {
        ...document,
        score: keywordHits * 4 + titleHit + contentHit + categoryHit,
      }
    })
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
}

export function findCampusDestination(query: string): NavigationResult | null {
  const normalized = normalize(query)
  if (!normalized) return null

  const match = campusDestinations.find((destination) =>
    [destination.name, destination.type, destination.location].some((field) =>
      normalize(field).includes(normalized) || normalized.includes(normalize(field)),
    ),
  )

  return match
    ? {
        name: match.name,
        type: match.type,
        location: match.location,
        guidance: match.guidance,
      }
    : null
}

export function buildGuidedAnswer(query: string) {
  const results = searchKnowledge(query)
  const topResult = results[0]
  const destination = findCampusDestination(query)

  if (destination) {
    return `${destination.name} (${destination.type}) is in the ${destination.location}. ${destination.guidance}`
  }

  if (topResult) {
    return `${topResult.title}: ${topResult.content}`
  }

  return null
}
