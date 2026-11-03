import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

type SearchFieldProps = Omit<ComponentProps<"input">, "type">;

export function SearchField({
  className,
  placeholder = "Pesquisar conversa ou chamado",
  "aria-label": ariaLabel = "Pesquisar conversa ou chamado",
  ...inputProps
}: SearchFieldProps) {
  return (
    <label
      className={cn(
        "flex h-(--control-md) items-center gap-2.5 rounded-pill bg-desk px-3 text-ink-3 focus-within:outline-2 focus-within:outline-cta",
        className,
      )}
    >
      <Search aria-hidden="true" size={15} className="shrink-0" />
      <input
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-full min-w-0 flex-1 bg-transparent text-small leading-normal text-ink outline-none placeholder:text-ink-3"
        {...inputProps}
      />
    </label>
  );
}
