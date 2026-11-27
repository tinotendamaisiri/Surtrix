// At most 5 AI drafts per visitor per UTC day (#113), so judges testing at once can not use
// up the AI budget. Every press counts, even a draft that fails. The Firestore rules hold
// the same limit; this decides on the page whether to ask at all.
export const DRAFTS_PER_DAY = 5
export const DRAFT_LIMIT_MESSAGE = `You have drafted ${DRAFTS_PER_DAY} skills today. You can draft again tomorrow.`

const DAY_MS = 24 * 60 * 60 * 1000

export function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS)
}

// The count to save for this press, or null when today's drafts are used up.
export function nextDraftCount(saved: { count: number; atMs: number } | null, nowMs: number): number | null {
  if (!saved || utcDay(saved.atMs) !== utcDay(nowMs)) return 1
  return saved.count >= DRAFTS_PER_DAY ? null : saved.count + 1
}
