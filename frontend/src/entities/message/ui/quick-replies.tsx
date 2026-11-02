import { cn } from "@/shared/lib/utils";

interface QuickRepliesProps {
  options: string[];
  selected: string | null;
  /** Falso depois da escolha, em respostas antigas, com turno pendente ou bloqueio. */
  interactive: boolean;
  onSelect: (option: string) => void;
}

export function QuickReplies({
  options,
  selected,
  interactive,
  onSelect,
}: QuickRepliesProps) {
  return (
    <div role="group" aria-label="Respostas rápidas" className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            aria-disabled={interactive ? undefined : true}
            onClick={() => {
              if (interactive) onSelect(option);
            }}
            className={cn(
              "rounded-md border px-3 py-1.75 text-left text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta",
              isSelected
                ? "border-info bg-info-soft text-info-text"
                : "border-rule bg-paper text-ink",
              interactive ? "cursor-pointer hover:bg-desk" : "cursor-default",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
