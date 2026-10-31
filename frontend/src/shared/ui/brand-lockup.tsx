import Image from "next/image";
import { cn } from "@/shared/lib/utils";

const MARK_SIZES = {
  sm: { width: 20, height: 17 },
  md: { width: 24, height: 20 },
} as const;

interface BrandLockupProps {
  /** `light` vai sobre fundo claro (símbolo azul); `dark`, sobre `ink` (branco). */
  variant?: "light" | "dark";
  size?: keyof typeof MARK_SIZES;
  className?: string;
}

export function BrandLockup({
  variant = "light",
  size = "md",
  className,
}: BrandLockupProps) {
  const isDark = variant === "dark";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src={isDark ? "/brand/nexo-mark-white.svg" : "/brand/nexo-mark.svg"}
        alt=""
        {...MARK_SIZES[size]}
      />
      <span className={cn("text-brand", isDark ? "text-on-ink" : "text-ink")}>
        Nexo Assist
      </span>
    </div>
  );
}
