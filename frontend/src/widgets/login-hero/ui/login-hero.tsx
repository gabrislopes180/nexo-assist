import { BrandLockup } from "@/shared/ui/brand-lockup";
import {
  HERO_DESCRIPTION,
  HERO_EYEBROW,
  HERO_TITLE,
} from "../config/hero-content";
import { LoginPreview } from "./login-preview";
import { LoginStats } from "./login-stats";

export function LoginHero() {
  return (
    <aside className="hidden flex-col justify-between gap-10 bg-ink px-10 pt-11 pb-11.5 text-on-ink lg:flex xl:px-16">
      <BrandLockup variant="dark" />

      <div className="flex flex-col">
        <p className="text-label text-on-ink-muted">{HERO_EYEBROW}</p>
        <h2 className="mt-5 font-display text-display-lg xl:text-display-xl">
          {HERO_TITLE}
        </h2>
        <p className="mt-4 max-w-(--login-preview-width) text-body-lg text-on-ink-muted">
          {HERO_DESCRIPTION}
        </p>
        <div className="mt-9">
          <LoginPreview />
        </div>
      </div>

      <LoginStats />
    </aside>
  );
}
