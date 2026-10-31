"use client";

import type { ReactNode } from "react";
import { useAuthenticatedUser } from "@/entities/session";
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar";
import { navItemsFor } from "./config/nav-items";
import { AppSidebar } from "./sidebar";

interface AuthenticatedShellProps {
  children: ReactNode;
}

export function AuthenticatedShell({ children }: AuthenticatedShellProps) {
  const user = useAuthenticatedUser();

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar items={navItemsFor(user.role)} user={user} />
      <SidebarInset className="h-svh overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}
