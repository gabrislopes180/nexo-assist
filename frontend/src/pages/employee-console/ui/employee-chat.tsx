"use client";

import { useChat } from "@/features/send-message";
import { ChatComposer } from "@/widgets/chat-composer";
import { ChatThread } from "@/widgets/chat-thread";

export function EmployeeChat() {
  const {
    items,
    isPending,
    count,
    limit,
    lock,
    send,
    retry,
    selectTicket,
    startNewConversation,
  } = useChat();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatThread
        items={items}
        isPending={isPending}
        lockedOut={lock !== null}
        onRetry={retry}
        onSelectTicket={selectTicket}
      />
      <div className="shrink-0 px-4 pb-4.5 xl:px-(--chat-gutter)">
        <ChatComposer
          onSend={send}
          count={count}
          max={limit}
          busy={isPending}
          lock={lock}
          onNewConversation={startNewConversation}
        />
      </div>
    </div>
  );
}
