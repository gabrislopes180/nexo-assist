"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { SessionUser } from "@/entities/session";
import { useLogout } from "@/features/logout";
import { getInitials } from "@/shared/lib/get-initials";
import { Avatar } from "@/shared/ui/avatar";
import { BrandLockup } from "@/shared/ui/brand-lockup";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/shared/ui/sidebar";
import type { NavItem } from "./config/nav-items";

interface AppSidebarProps {
  items: NavItem[];
  user: SessionUser;
}

export function AppSidebar({ items, user }: AppSidebarProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { mutate: logout, isPending, isError } = useLogout();
  // Fecha o menu do celular em qualquer navegação, inclusive pelo botão voltar.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  // O estado da mutation só muda no próximo render; a ref barra o duplo clique.
  const isLoggingOutRef = useRef(false);

  const handleLogout = () => {
    if (isLoggingOutRef.current) return;

    isLoggingOutRef.current = true;
    logout(undefined, {
      onSettled: () => {
        isLoggingOutRef.current = false;
      },
    });
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-0 px-3.5 pt-5.25 pb-0">
        <BrandLockup size="sm" className="px-2" />
      </SidebarHeader>

      <SidebarContent className="mt-5 px-3.5">
        <nav aria-label="Principal">
          <SidebarMenu>
            {items.map(({ label, href, icon: Icon }) => {
              const isActive = pathname === href;

              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-0 px-3.5 pt-0 pb-3.5">
        <div className="flex items-center gap-2.5 border-t border-rule px-2 pt-3.5 pb-1">
          <Avatar initials={getInitials(user.name)} name={user.name} />
          <div className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-label-strong text-ink">
              {user.name}
            </span>
            <span className="truncate text-micro font-normal text-ink-3">
              {user.email}
            </span>
          </div>
        </div>

        {isError ? (
          <p role="alert" className="px-2 pt-1 text-caption text-danger-text">
            Não foi possível sair. Tente de novo.
          </p>
        ) : null}

        <SidebarMenuButton
          size="sm"
          aria-busy={isPending}
          aria-disabled={isPending}
          onClick={handleLogout}
          className="aria-disabled:opacity-100"
        >
          <LogOut aria-hidden="true" />
          <span>{isPending ? "Saindo..." : "Sair"}</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
