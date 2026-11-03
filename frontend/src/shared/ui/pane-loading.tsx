import { StatusBadge } from "./status-badge";

export function PaneLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center px-6 py-10"
    >
      <StatusBadge tone="info" pulse>
        {label}
      </StatusBadge>
    </div>
  );
}
