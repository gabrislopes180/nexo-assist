import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/lib/utils";

interface RailItemProps {
  icon: LucideIcon;
  /** Nome acessível; o número do badge deve entrar aqui. */
  label: string;
  href?: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}

const BASE =
  "relative inline-flex size-10 items-center justify-center rounded-lg text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta";

export function RailItem({
  icon: Icon,
  label,
  href,
  active = false,
  badge,
  onClick,
}: RailItemProps) {
  const className = cn(BASE, active && "bg-paper shadow-raised");
  const content = (
    <>
      <Icon aria-hidden="true" size={19} />
      {badge ? (
        <span
          aria-hidden="true"
          className="absolute top-1 left-6 inline-flex h-4 items-center rounded-pill bg-cta px-1.25 text-badge text-on-ink ring-2 ring-desk"
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(className, "cursor-pointer")}
    >
      {content}
    </button>
  );
}
