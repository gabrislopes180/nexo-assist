import { MessageSquare, UserRound, type LucideIcon } from "lucide-react";
import type { SessionUser } from "@/entities/session";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ATTENDANCE: NavItem = {
  label: "Atendimento",
  href: "/console/employee",
  icon: MessageSquare,
};

const PROFILE: NavItem = {
  label: "Meu perfil",
  href: "/profile",
  icon: UserRound,
};

export function navItemsFor(role: SessionUser["role"]): NavItem[] {
  return role === "EMPLOYEE" ? [ATTENDANCE, PROFILE] : [PROFILE];
}
