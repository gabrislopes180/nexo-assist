import { MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { SessionUser } from "@/entities/session";
import { getInitials } from "@/shared/lib/get-initials";
import { Avatar } from "@/shared/ui/avatar";
import { RailItem } from "@/shared/ui/rail-item";

interface ConsoleRailProps {
  /** Null enquanto a lista carrega: o badge fica oculto. */
  waitingCount: number | null;
  user: SessionUser;
}

export function ConsoleRail({ waitingCount, user }: ConsoleRailProps) {
  const label =
    waitingCount && waitingCount > 0
      ? `Conversas, ${waitingCount} esperando atendente`
      : "Conversas";

  return (
    <nav
      aria-label="Console"
      className="flex w-(--rail-width) shrink-0 flex-col items-center border-r border-rule bg-desk pt-5.75 pb-4"
    >
      <Image src="/brand/nexo-mark.svg" alt="" width={24} height={20} />
      <span className="sr-only">Nexo Assist</span>
      <div className="mt-4.75">
        <RailItem
          href="/console/analyst"
          active
          icon={MessageCircle}
          label={label}
          badge={waitingCount || undefined}
        />
      </div>
      <div className="flex-1" />
      {/* "Sair" fica no Meu perfil, que tem a barra lateral. */}
      <Link
        href="/profile"
        aria-label={`Meu perfil (${user.name})`}
        className="rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
      >
        <Avatar
          size={36}
          tone="self"
          initials={getInitials(user.name)}
          name={user.name}
        />
      </Link>
    </nav>
  );
}
