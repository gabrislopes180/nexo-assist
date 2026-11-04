"use client";

import { cn } from "@/shared/lib/utils";

export interface ChoiceChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceChipsProps<T extends string> {
  legend: string;
  name: string;
  options: readonly ChoiceChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Bloqueia a troca sem tirar do foco (aria-disabled). */
  disabled?: boolean;
  className?: string;
}

/**
 * Grupo de rádio em chips: radio nativo sr-only, então Tab entra no grupo e as
 * setas trocam a opção, como em qualquer radio group.
 */
export function ChoiceChips<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
  className,
}: ChoiceChipsProps<T>) {
  return (
    <fieldset
      aria-disabled={disabled || undefined}
      className={cn("flex flex-col gap-2", className)}
    >
      <legend className="pb-2 text-label text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-md border px-3 py-1.75 text-label has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cta",
                checked
                  ? "border-info bg-info-soft text-info-text"
                  : "border-rule bg-paper text-ink hover:bg-desk",
                disabled && "cursor-not-allowed",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                aria-disabled={disabled || undefined}
                onChange={() => {
                  if (!disabled) onChange(option.value);
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
