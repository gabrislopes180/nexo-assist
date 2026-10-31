import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta aria-disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-cta text-on-ink hover:bg-info-hover",
        secondary:
          "border border-line-control bg-paper text-ink shadow-sm hover:bg-desk",
        ghost: "bg-transparent text-ink-2 hover:bg-desk",
        danger: "bg-danger-soft text-danger-text",
      },
      size: {
        md: "h-(--control-lg) gap-2 px-4 text-heading",
        sm: "h-(--control-md) gap-1.75 px-3.5 text-label",
      },
      block: {
        true: "w-full",
      },
    },
    compoundVariants: [
      { variant: "primary", size: "md", className: "shadow-cta" },
      { variant: "primary", size: "sm", className: "text-label-strong" },
      { variant: "danger", size: "sm", className: "text-label-strong" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  },
);

interface ButtonProps
  extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  iconRight?: ReactNode;
}

export function Button({
  className,
  variant,
  size,
  block,
  iconRight,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    >
      {children}
      {iconRight}
    </button>
  );
}
