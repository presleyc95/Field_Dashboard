import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PanelProps = {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** The template's card: neutral-900 panel, hairline border, uppercase title. */
export function Panel({ title, actions, className, children }: PanelProps) {
  return (
    <section className={cn("rounded-lg border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
          {title && (
            <h2 className="text-sm font-medium uppercase tracking-wider text-fg-soft">{title}</h2>
          )}
          {actions}
        </header>
      )}
      <div className={cn("px-5 pb-5", !(title || actions) && "pt-5")}>{children}</div>
    </section>
  );
}
