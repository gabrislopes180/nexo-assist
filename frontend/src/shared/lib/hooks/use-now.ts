import { useEffect, useState } from "react";

/** "Agora" que anda sozinho: datas relativas ("há 5 min") sem depender de refetch. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
