import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "bg-accent text-accent-fg hover:bg-accent-hover"
          : "border border-line text-fg-soft hover:border-accent hover:text-accent",
        className,
      )}
      {...props}
    />
  );
}
