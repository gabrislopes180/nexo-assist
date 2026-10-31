"use client";

import { Eye, type LucideIcon } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface TextFieldProps extends Omit<ComponentProps<"input">, "size"> {
  label: string;
  icon?: LucideIcon;
  /** Ação à direita do rótulo, como "Esqueci minha senha". */
  labelAction?: ReactNode;
  error?: string;
}

export function TextField({
  label,
  icon: Icon,
  labelAction,
  error,
  id,
  type = "text",
  className,
  "aria-describedby": ariaDescribedBy,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const isPassword = type === "password";
  const isMasked = isPassword && !isPasswordVisible;
  const describedBy =
    [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-label text-ink">
          {label}
        </label>
        {labelAction}
      </div>

      <div
        className={cn(
          "flex h-(--control-lg) items-center gap-2.5 rounded-md border border-line-control bg-paper pr-2 pl-3.5 text-ink-3 shadow-xs",
          "has-[input:focus]:border-transparent has-[input:focus]:text-info-text has-[input:focus]:shadow-none has-[input:focus]:outline-[1.5px] has-[input:focus]:-outline-offset-[1.5px] has-[input:focus]:outline-cta",
          error &&
            "border-danger text-danger-text has-[input:focus]:text-danger-text has-[input:focus]:outline-danger",
        )}
      >
        {Icon ? <Icon aria-hidden="true" size={16} className="shrink-0" /> : null}
        <input
          id={inputId}
          type={isPassword && isPasswordVisible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3",
            isMasked && "tracking-[2px]",
          )}
          {...inputProps}
        />
        {isPassword ? (
          <button
            type="button"
            aria-label="Mostrar senha"
            aria-pressed={isPasswordVisible}
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            className="inline-flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-3 focus-visible:outline-2 focus-visible:outline-cta"
          >
            <Eye aria-hidden="true" size={16} />
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
