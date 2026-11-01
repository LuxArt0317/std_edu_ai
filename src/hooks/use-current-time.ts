import { useEffect, useState } from 'react'
/** Refresh time-sensitive summaries without a page reload. */
export function useCurrentTime() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
