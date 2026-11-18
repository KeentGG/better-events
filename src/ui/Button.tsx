import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-card hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger: "bg-danger text-white shadow-card hover:brightness-95",
};

// Every size keeps at least a 44px touch target on mobile, except sm which is for dense rows.
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-sm",
  md: "h-11 gap-2 px-4 text-sm",
  lg: "h-13 gap-2 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  block,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap transition duration-150 ease-out-quint select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** Square icon-only button. `label` is required so screen readers can announce it. */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  className,
  ...props
}: Omit<ButtonProps, "children" | "block" | "loading"> & { label: string; icon: ReactNode }) {
  const box = { sm: "size-9", md: "size-11", lg: "size-13" }[size];
  return (
    <Button aria-label={label} title={label} variant={variant} size={size} className={cn(box, "px-0", className)} {...props}>
      {icon}
    </Button>
  );
}
