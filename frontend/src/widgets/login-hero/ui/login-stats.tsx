import { HERO_STATS } from "../config/hero-content";

export function LoginStats() {
  return (
    <ul className="flex border-t border-on-ink-rule pt-6">
      {HERO_STATS.map(({ value, label, online }) => (
        <li
          key={label}
          className="flex flex-1 flex-col gap-1 border-on-ink-rule not-first:border-l not-first:pl-6"
        >
          <span className="flex items-center gap-2 font-display text-display-md leading-none">
            {value}
            {online ? (
              <span
                aria-hidden="true"
                className="size-2 rounded-pill bg-success"
              />
            ) : null}
          </span>
          <span className="text-small text-on-ink-muted">{label}</span>
        </li>
      ))}
    </ul>
  );
}
