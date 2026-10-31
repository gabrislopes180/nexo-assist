import type { UserRole } from "../../generated/prisma/enums.js";

export type UserKey = "marina" | "rafael" | "juliana" | "ana" | "bruno";

export type UserSeed = {
  key: UserKey;
  name: string;
  email: string;
  role: UserRole;
  department: string;
};

export const USERS: readonly UserSeed[] = [
  {
    key: "marina",
    name: "Marina Costa",
    email: "marina.costa@nexo.example",
    role: "EMPLOYEE",
    department: "Comercial",
  },
  {
    key: "rafael",
    name: "Rafael Lima",
    email: "rafael.lima@nexo.example",
    role: "ANALYST",
    department: "Service Desk",
  },
  {
    key: "juliana",
    name: "Juliana Alves",
    email: "juliana.alves@nexo.example",
    role: "EMPLOYEE",
    department: "Operações – Filial Campinas",
  },
  {
    key: "bruno",
    name: "Bruno Martins",
    email: "bruno.martins@nexo.example",
    role: "ANALYST",
    department: "Service Desk",
  },
  {
    key: "ana",
    name: "Ana Souza",
    email: "ana.souza@nexo.example",
    role: "EMPLOYEE",
    department: "Financeiro",
  },
];
