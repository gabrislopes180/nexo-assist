"use client";

import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface CheckboxProps extends ComponentProps<typeof CheckboxPrimitive.Root> {
  label: ReactNode;
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.25 pt-0.5 text-small leading-4.5 text-ink-2",
        className,
      )}
    >
      <CheckboxPrimitive.Root
        className="flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-[1.5px] border-line-radio bg-paper text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta data-[state=checked]:border-cta data-[state=checked]:bg-cta"
        {...props}
      >
        <CheckboxPrimitive.Indicator className="grid place-content-center">
          <Check aria-hidden="true" size={12} strokeWidth={2.5} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}
