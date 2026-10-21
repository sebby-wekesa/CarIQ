import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "quiet" | "plate";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-60 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-forest text-white hover:bg-forest-deep",
  secondary: "border border-ink/20 bg-surface text-ink hover:border-ink/40",
  quiet: "text-forest underline-offset-4 hover:underline",
  plate: "bg-plate text-ink hover:bg-[#ffda3e]",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-base",
  lg: "min-h-13 px-6 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], variant !== "quiet" && sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; pending?: boolean };

export function Button({ variant, size, pending, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
