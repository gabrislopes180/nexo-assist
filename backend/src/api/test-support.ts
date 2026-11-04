import type { ChatService } from "../chat/chat-service.js";
import type { ConsoleService } from "../console/console-service.js";
import type { ConsoleTicketService } from "../console/console-ticket-service.js";
import type { KnowledgeService } from "../knowledge/knowledge-service.js";

const unused = () => Promise.reject(new Error("console não usado nestes testes"));
const unusedChat = () => Promise.reject(new Error("chat não usado nestes testes"));

/** Só para testes de rota que não exercitam o console. */
export const unusedConsoleService: ConsoleService = {
  listConversations: unused,
  getConversation: unused,
  getMessages: unused,
  getTickets: unused,
  takeOver: unused,
  reply: unused,
  returnToAgent: unused,
  close: unused,
};

/** Só para testes de rota que não exercitam os chamados do console. */
export const unusedConsoleTicketService: ConsoleTicketService = {
  getTicket: unused,
  changeStatus: unused,
};

/** Só para testes de rota que não exercitam o chat. */
export const unusedChatService: ChatService = {
  sendMessage: unusedChat,
  confirmDraft: unusedChat,
  cancelDraft: unusedChat,
  getConversation: unusedChat,
};

/** Só para testes de rota que não exercitam a central de ajuda. */
export const unusedKnowledgeService: KnowledgeService = {
  searchArticles: () => Promise.reject(new Error("central de ajuda não usada nestes testes")),
  getArticle: () => Promise.reject(new Error("central de ajuda não usada nestes testes")),
};
