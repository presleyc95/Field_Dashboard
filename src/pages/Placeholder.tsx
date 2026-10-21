import { Panel } from "@/components/Panel";

type PlaceholderProps = {
  title: string;
  description: string;
  /** Build step in ARCHITECTURE.md §11 that delivers this page. */
  step: number;
};

export function Placeholder({ title, description, step }: PlaceholderProps) {
  return (
    <Panel title={title}>
      <p className="text-sm text-fg-muted">{description}</p>
      <p className="mt-3 text-xs uppercase tracking-wider text-fg-subtle">
        Arrives in build step {step}
      </p>
    </Panel>
  );
}
