"use client";

import { useChat } from "@/features/send-message";
import { ChatComposer } from "@/widgets/chat-composer";
import { ChatThread } from "@/widgets/chat-thread";

export function EmployeeChat() {
  const chat = useChat();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatThread
        items={chat.items}
        isPending={chat.isPending}
        lockedOut={chat.lock !== null}
        draftsLocked={chat.lock !== null && !chat.lock.allowsDrafts}
        onRetry={chat.retry}
        onSelectTicket={chat.selectTicket}
        onSelectReply={chat.selectReply}
        draftOp={chat.draftOp}
        onConfirmDraft={chat.confirmDraft}
        onCancelDraft={chat.cancelDraft}
        onRetryDraft={chat.retryDraft}
        onEditDraft={chat.editDraft}
      />
      <div className="shrink-0 px-4 pb-4.5 xl:px-(--chat-gutter)">
        <ChatComposer
          onSend={chat.send}
          count={chat.count}
          max={chat.limit}
          busy={chat.isPending}
          lock={chat.lock}
          onNewConversation={chat.startNewConversation}
        />
      </div>
    </div>
  );
}
