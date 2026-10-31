import type { Metadata } from "next";
import { LoginForm } from "@/features/login";
import { BrandLockup } from "@/shared/ui/brand-lockup";
import { LoginHero } from "@/widgets/login-hero";

export const metadata: Metadata = {
  title: "Entrar | Nexo Assist",
};

export function LoginPage() {
  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-[5fr_4fr]">
      <LoginHero />

      <main className="flex min-w-0 flex-col gap-10 bg-paper px-4 py-6 lg:px-14 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:justify-end">
          <BrandLockup className="lg:hidden" />
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-small text-ink-3">
            Problema para entrar?
            <a
              href="tel:4000"
              className="rounded-xs text-label-strong text-info-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
            >
              Ligue no ramal 4000
            </a>
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center lg:pb-4.5">
          <LoginForm />
        </div>

        <footer className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-caption text-ink-3">
          <p>© 2026 Nexo · Service desk de TI</p>
          <p>Privacidade e uso de dados</p>
        </footer>
      </main>
    </div>
  );
}
