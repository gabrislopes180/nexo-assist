import Image from "next/image";
import { cn } from "@/shared/lib/utils";

interface BrandLockupProps {
  /** `light` vai sobre fundo claro (símbolo azul); `dark`, sobre `ink` (branco). */
  variant?: "light" | "dark";
  className?: string;
}

export function BrandLockup({ variant = "light", className }: BrandLockupProps) {
  const isDark = variant === "dark";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src={isDark ? "/brand/nexo-mark-white.svg" : "/brand/nexo-mark.svg"}
        alt=""
        width={24}
        height={20}
      />
      <span className={cn("text-brand", isDark ? "text-on-ink" : "text-ink")}>
        Nexo Assist
      </span>
    </div>
  );
}
