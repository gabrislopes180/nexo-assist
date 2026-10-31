import { HERO_PREVIEW } from "../config/hero-content";

export function LoginPreview() {
  return (
    <div
      role="img"
      aria-label={HERO_PREVIEW.label}
      className="flex w-full max-w-(--login-preview-width) flex-col rounded-xl border border-on-ink-rule bg-on-ink-surface bg-clip-padding p-4.5 xl:ml-24"
    >
      <p className="self-end rounded-lg bg-paper px-3.5 py-1.75 text-small text-ink">
        {HERO_PREVIEW.userMessage}
      </p>

      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 text-caption text-on-ink-muted">
        <span className="text-caption-strong text-on-ink">
          {HERO_PREVIEW.agentName}
        </span>
        <span>{HERO_PREVIEW.agentActions.join(" · ")}</span>
      </p>

      <p className="mt-1.5 max-w-95 rounded-lg bg-on-ink-rule px-3.5 py-2.5 text-small leading-5 text-on-ink">
        {HERO_PREVIEW.agentMessage}
      </p>

      <p className="mt-1.5 flex flex-wrap items-center rounded-lg bg-paper px-3 py-1.75 text-caption text-ink-3 sm:rounded-pill">
        <span
          aria-hidden="true"
          className="mr-2 size-2 rounded-pill bg-warning"
        />
        <span className="mr-2 text-caption-strong text-ink">
          {HERO_PREVIEW.ticketNumber}
        </span>
        {HERO_PREVIEW.ticketSummary}
      </p>
    </div>
  );
}
