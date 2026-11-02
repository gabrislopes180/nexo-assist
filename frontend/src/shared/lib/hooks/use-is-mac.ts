import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const isMacPlatform = () =>
  /Mac|iPhone|iPad/.test(navigator.userAgent);

/** No servidor vale Mac, como no protótipo; o cliente corrige depois da hidratação. */
export function useIsMac(): boolean {
  return useSyncExternalStore(subscribe, isMacPlatform, () => true);
}
