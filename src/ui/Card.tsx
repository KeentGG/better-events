import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardVariant = "raised" | "outline" | "sunken" | "highlight";

const variants: Record<CardVariant, string> = {
  raised: "border border-line bg-surface-raised shadow-card",
  outline: "border border-line bg-transparent",
  sunken: "bg-surface-sunken",
  highlight: "border border-line bg-surface-raised shadow-card",
};

export function Card({
  variant = "raised",
  interactive,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant; interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card p-4",
        variants[variant],
        interactive && "cursor-pointer transition duration-150 ease-out-quint hover:shadow-raised active:scale-[0.99]",
        className,
      )}
      {...props}
    />
  );
}
