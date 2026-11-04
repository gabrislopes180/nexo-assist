"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  filterCounts,
  useConsoleConversation,
  useConsoleConversations,
  visibleConversations,
  type ConversationFilter,
} from "@/entities/conversation";
import { useAuthenticatedUser } from "@/entities/session";
import { useMediaQuery } from "@/shared/lib/hooks/use-media-query";
import { useNow } from "@/shared/lib/hooks/use-now";
import { cn } from "@/shared/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";
import { ConsoleRail } from "@/widgets/console-rail";
import { ConsoleThread } from "@/widgets/console-thread";
import { ConversationList } from "@/widgets/conversation-list";
import { TicketPanel } from "@/widgets/ticket-panel";
import { useConsoleLiveUpdates } from "../api/use-console-live-updates";
import {
  parseConversationParam,
  resolveSelectedConversationId,
} from "../lib/selected-conversation";

export function AnalystConsole() {
  const user = useAuthenticatedUser();
  const router = useRouter();
  const pathname = usePathname() ?? "/console/analyst";
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isLg = useMediaQuery("(min-width: 64rem)");
  const isXl = useMediaQuery("(min-width: 80rem)");
  useConsoleLiveUpdates();
  // Horários relativos ("há 5 min") andam sozinhos, sem depender de refetch.
  const now = useNow(30_000);

  const list = useConsoleConversations();
  const all = list.data ?? [];
  const visible = visibleConversations(all, filter, search);
  const counts = filterCounts(all);

  const selectedId = resolveSelectedConversationId({
    param: parseConversationParam(searchParams?.get("conversation") ?? null),
    visibleIds: visible.map((conversation) => conversation.id),
    isWide: isLg,
  });
  const selected = useConsoleConversation(selectedId);

  // Mantém os outros parâmetros da URL ao trocar a conversa.
  const urlWith = (conversation: string | null) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (conversation) params.set("conversation", conversation);
    else params.delete("conversation");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const select = (id: string) => {
    const navigate = isLg ? router.replace : router.push;
    navigate(urlWith(id), { scroll: false });
    setSheetOpen(false);
    setPanelDismissed(false);
  };
  const clearSelection = () => router.push(urlWith(null), { scroll: false });

  const conversation = selected.data;
  const showInlinePanel = isXl && !panelDismissed && conversation !== undefined;

  return (
    <div className="flex h-svh w-full overflow-hidden bg-paper">
      <ConsoleRail
        waitingCount={list.data ? counts.waiting : null}
        user={user}
      />
      <ConversationList
        className={cn(selectedId !== null && "max-lg:hidden")}
        query={list}
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        selectedId={selectedId}
        onSelect={select}
        now={now}
      />
      {selectedId ? (
        <ConsoleThread
          key={selectedId}
          conversationId={selectedId}
          onBack={isLg ? undefined : clearSelection}
          onClearSelection={clearSelection}
          showPanelButton={!isXl || panelDismissed}
          onOpenPanel={() =>
            isXl ? setPanelDismissed(false) : setSheetOpen(true)
          }
          now={now}
        />
      ) : (
        <section className="hidden min-w-0 flex-1 items-center justify-center bg-thread lg:flex">
          <p className="text-small text-ink-3">
            Selecione uma conversa para ver o histórico.
          </p>
        </section>
      )}
      {conversation && showInlinePanel ? (
        <TicketPanel
          key={conversation.id}
          conversation={conversation}
          now={now}
          onClose={() => setPanelDismissed(true)}
        />
      ) : null}
      {conversation && !showInlinePanel ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="right"
            showCloseButton={false}
            aria-describedby={undefined}
            className="w-(--panel-width) max-w-full gap-0 bg-paper p-0 sm:max-w-none"
          >
            <SheetTitle className="sr-only">
              Chamados de {conversation.owner.name}
            </SheetTitle>
            <TicketPanel
              key={conversation.id}
              conversation={conversation}
              now={now}
              onClose={() => setSheetOpen(false)}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
