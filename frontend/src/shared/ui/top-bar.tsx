import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { SidebarTrigger } from "./sidebar";

interface TopBarProps {
  /** O último item é a página atual. */
  crumbs: string[];
  children?: ReactNode;
}

export function TopBar({ crumbs, children }: TopBarProps) {
  const lastIndex = crumbs.length - 1;

  return (
    <header className="flex h-(--topbar-height) shrink-0 items-center gap-2 border-b border-rule bg-paper px-4 md:gap-4 md:px-8">
      <SidebarTrigger className="md:hidden" />
      <nav aria-label="Você está em" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-small text-ink-3">
          {crumbs.map((crumb, index) => {
            const isCurrent = index === lastIndex;

            return (
              <li
                key={crumb}
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "flex min-w-0 items-center gap-2"
                    : "flex min-w-0 items-center gap-2 max-sm:hidden"
                }
              >
                {index > 0 ? (
                  <ChevronRight
                    aria-hidden="true"
                    size={14}
                    className="shrink-0 max-sm:hidden"
                  />
                ) : null}
                <span
                  className={
                    isCurrent ? "truncate text-label-strong text-ink" : "truncate"
                  }
                >
                  {crumb}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
      {children}
    </header>
  );
}
