// Auto-suggest tags based on event content using keyword matching.
// Returns tag names that should be applied to imported events.

interface KeywordMap {
  [tagName: string]: string[]
}

const KEYWORD_MAP: KeywordMap = {
  'Music': ['concert', 'music', 'band', 'live', 'festival', 'jazz', 'rock', 'pop', 'classical', 'opera', 'musical'],
  'Theatre': ['theatre', 'theater', 'play', 'drama', 'performance', 'stage', 'act', 'dramatic'],
  'Dance': ['dance', 'ballet', 'contemporary', 'tango', 'salsa', 'hip-hop', 'choreography'],
  'Art': ['art', 'exhibition', 'gallery', 'painter', 'sculpture', 'visual', 'artwork', 'creative'],
  'Food & Drink': ['food', 'wine', 'tasting', 'culinary', 'cooking', 'restaurant', 'feast', 'meal', 'café', 'beer', 'cocktail'],
  'Family': ['family', 'kids', 'children', 'workshop', 'learn', 'educational', 'school'],
  'Sport': ['sport', 'football', 'basketball', 'tennis', 'marathon', 'race', 'competition', 'athletic', 'game', 'fitness'],
  'Outdoor': ['outdoor', 'hiking', 'beach', 'park', 'nature', 'walk', 'cycling', 'trail', 'mountain', 'sea'],
  'Festival': ['festival', 'carnival', 'fair', 'celebration', 'fiesta', 'jubilee'],
  'Heritage': ['heritage', 'history', 'historical', 'museum', 'cultural', 'tradition', 'historical site', 'archaeology'],
  'Comedy': ['comedy', 'comedian', 'standup', 'humor', 'funny', 'laugh'],
  'Film': ['film', 'movie', 'cinema', 'screening', 'documentary', 'shorts', 'festival'],
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
}

export function suggestTags(
  title: string | undefined,
  description: string | undefined,
  categoryName: string | undefined,
): string[] {
  const content = [title, description, categoryName]
    .filter((s): s is string => !!s)
    .map(normalizeText)
    .join(' ')

  const matches = new Map<string, number>()

  for (const [tag, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const keyword of keywords) {
      const count = (content.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length
      if (count > 0) {
        matches.set(tag, (matches.get(tag) || 0) + count)
      }
    }
  }

  const sorted = Array.from(matches.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag)

  return sorted
}
