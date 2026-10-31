import { useSyncExternalStore } from "react"

// Complemento exato do breakpoint md do Tailwind (min-width: 48rem).
const MOBILE_QUERY = "(width < 48rem)"

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_QUERY).matches
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, isMobileViewport, () => false)
}
