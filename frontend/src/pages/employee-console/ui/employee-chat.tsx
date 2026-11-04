"use client";

import { useChat } from "@/features/send-message";
import { ChatComposer } from "@/widgets/chat-composer";
import { ChatThread } from "@/widgets/chat-thread";
import { Button } from "@/shared/ui/button";
import { PaneLoading } from "@/shared/ui/pane-loading";
import { PaneMessage } from "@/shared/ui/pane-message";

export function EmployeeChat() {
  const chat = useChat();

  if (chat.isRecovering) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {chat.recoveryFailed ? (
          <PaneMessage tone="error" action={<Button variant="secondary" onClick={chat.retryRecovery}>Tentar de novo</Button>}>
            Não foi possível recuperar sua conversa.
          </PaneMessage>
        ) : <PaneLoading label="Recuperando sua conversa…" />}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatThread
        items={chat.items}
        agentActive={chat.status === null || chat.status === "WITH_AGENT"}
        isPending={chat.isPending}
        isAgentThinking={chat.isAgentThinking}
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
          notice={chat.notice}
          onNewConversation={chat.startNewConversation}
        />
      </div>
    </div>
  );
}
