import { useCallback, useSyncExternalStore } from 'react'

/**
 * Reads a media query without duplicating the CSS breakpoints as JS numbers:
 * the query string is the same range syntax used in the stylesheet, so the
 * layout and the behaviour switch at exactly the same point.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', listener)
      return () => list.removeEventListener('change', listener)
    },
    [query],
  )

  const read = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return serverValue
    return window.matchMedia(query).matches
  }, [query, serverValue])

  return useSyncExternalStore(subscribe, read, () => serverValue)
}

export const MQ_COMPACT = '(width <= 1023px)'
export const MQ_MOBILE = '(width <= 720px)'
export const MQ_HINTS_IN_STAGE = '(width <= 1180px)'
export const MQ_COARSE = '(pointer: coarse)'
