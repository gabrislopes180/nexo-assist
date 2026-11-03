import {
  MessageCircle,
  MessageSquare,
  UserRound,
  type LucideIcon,
} from "lucide-react";
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

const CONVERSATIONS: NavItem = {
  label: "Conversas",
  href: "/console/analyst",
  icon: MessageCircle,
};

const PROFILE: NavItem = {
  label: "Meu perfil",
  href: "/profile",
  icon: UserRound,
};

export function navItemsFor(role: SessionUser["role"]): NavItem[] {
  return role === "EMPLOYEE" ? [ATTENDANCE, PROFILE] : [CONVERSATIONS, PROFILE];
}
