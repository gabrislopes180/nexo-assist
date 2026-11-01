import type { AuthService } from "../auth/auth-service.js";
import type { ChatService } from "../chat/chat-service.js";
import type { ApiConfig } from "./config.js";

export type AppDeps = { config: ApiConfig; authService: AuthService; chatService: ChatService };
