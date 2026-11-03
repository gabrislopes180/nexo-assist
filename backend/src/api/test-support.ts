import type { ConsoleService } from "../console/console-service.js";

const unused = () => Promise.reject(new Error("console não usado nestes testes"));

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
