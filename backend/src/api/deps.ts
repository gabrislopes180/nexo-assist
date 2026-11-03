import type { AuthService } from "../auth/auth-service.js";
import type { ChatService } from "../chat/chat-service.js";
import type { ConsoleService } from "../console/console-service.js";
import type { StreamOptions } from "../realtime/config.js";
import type { EventBus } from "../realtime/event-bus.js";
import type { ApiConfig } from "./config.js";

export type AppDeps = {
  config: ApiConfig;
  authService: AuthService;
  chatService: ChatService;
  consoleService: ConsoleService;
  /** Barramento do tempo real; o fan-out publica nele e os streams SSE leem dele. */
  eventBus: EventBus;
  /** Só para testes: heartbeat, limites e relógio menores. */
  streamOptions?: Partial<StreamOptions>;
};
