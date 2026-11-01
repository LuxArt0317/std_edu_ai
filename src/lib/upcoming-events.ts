/** Include ongoing and future events, exclude expired/invalid entries, and sort chronologically. */
export function upcomingEvents<T extends { startsAt: string; endsAt: string }>(events: readonly T[], now: number): T[] {
  return events.filter(event => {
    const start = Date.parse(event.startsAt)
    const end = Date.parse(event.endsAt)
    return Number.isFinite(start) && Number.isFinite(end) && Math.max(start, end) >= now
  }).sort((left, right) => Date.parse(left.startsAt)-Date.parse(right.startsAt))
}
