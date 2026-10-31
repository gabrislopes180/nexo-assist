import type { Metadata } from "next";
import { SessionGate } from "@/entities/session";
import { StatusBadge } from "@/shared/ui/status-badge";
import { TopBar } from "@/shared/ui/top-bar";
import { ChatComposer } from "@/widgets/chat-composer";

export const metadata: Metadata = {
  title: "Atendimento | Nexo Assist",
};

export function EmployeeConsolePage() {
  return (
    <SessionGate requiredRole="EMPLOYEE">
      <h1 className="sr-only">Atendimento</h1>
      <TopBar crumbs={["Service desk de TI", "Atendimento"]}>
        <StatusBadge tone="success" variant="pill">
          Assistente online
        </StatusBadge>
      </TopBar>
      <div className="flex-1" />
      <div className="px-4 pb-4.5 xl:px-(--chat-gutter)">
        <ChatComposer />
      </div>
    </SessionGate>
  );
}
