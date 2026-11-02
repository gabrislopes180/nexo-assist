"use client";

import { useId, type ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

interface TextAreaProps extends ComponentProps<"textarea"> {
  label: string;
  error?: string;
}

/** Versão de várias linhas do TextField: mesma borda, foco e erro. */
export function TextArea({
  label,
  error,
  id,
  className,
  rows = 4,
  "aria-describedby": ariaDescribedBy,
  ...textareaProps
}: TextAreaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const describedBy =
    [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={inputId} className="text-label text-ink">
        {label}
      </label>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-20 w-full resize-y rounded-md border border-line-control bg-paper px-3.5 py-2.5 text-body text-ink shadow-xs outline-none placeholder:text-ink-3",
          "focus:border-transparent focus:shadow-none focus:outline-[1.5px] focus:-outline-offset-[1.5px] focus:outline-cta",
          error && "border-danger focus:outline-danger",
        )}
        {...textareaProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
