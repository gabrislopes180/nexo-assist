import { cn } from "@/shared/lib/utils";

interface FilterChipsProps<T extends string> {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export function FilterChips<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: FilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap gap-1", className)}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-2.25 py-1.5 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta",
              isActive ? "bg-info-soft text-info-text" : "bg-desk text-ink-2",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "font-semibold",
                  isActive ? "text-info-text" : "text-ink-3",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
