// PROVISÓRIO: remover quando o backend expuser /console (ver plano do console)
import type { MockScenario } from "./scenario";

// Tipos no formato do contrato proposto (os schemas ficam nas entities).
export type MockPerson = { id: string; name: string };
type AuthorType = "EMPLOYEE" | "AGENT" | "ANALYST" | "SYSTEM";

export interface MockConversation {
  id: string;
  status: "WITH_AGENT" | "WAITING_ANALYST" | "WITH_ANALYST" | "CLOSED";
  owner: MockPerson & { department: string | null };
  analyst: MockPerson | null;
  assignedToMe: boolean;
  handoffReason:
    "EMPLOYEE_REQUEST" | "CRITICAL" | "OVERDUE" | "LOW_CONFIDENCE" | null;
  handoffSummary: string | null;
  handoffAt: string | null;
  lastMessageAt: string;
  closedAt: string | null;
  lastMessage: {
    authorType: Exclude<AuthorType, "SYSTEM">;
    content: string;
    createdAt: string;
  } | null;
  lastAgentConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  ticketCode: string | null;
}

export interface MockMessage {
  id: string;
  authorType: AuthorType;
  author: MockPerson | null;
  content: string;
  createdAt: string;
}

export interface MockTicket {
  code: string;
  type: "INC" | "REQ";
  category:
    "ACCESS" | "NETWORK_VPN" | "HARDWARE" | "SOFTWARE" | "EMAIL" | "OTHER";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status:
    | "WAITING_ANALYST"
    | "IN_PROGRESS"
    | "WAITING_EMPLOYEE"
    | "APPROVED"
    | "RESOLVED";
  statusLabel: string;
  title: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface MockState {
  conversations: MockConversation[];
  messages: Record<string, MockMessage[]>;
  tickets: Record<
    string,
    { conversationTicket: MockTicket | null; otherTickets: MockTicket[] }
  >;
}

type Clock = {
  at: (h: number, m: number, s?: number, ms?: number) => string;
  daysAgo: (d: number, h: number, m: number) => string;
  on: (month: number, day: number) => string;
};

function clock(now: Date): Clock {
  const at = (h: number, m: number, s = 0, ms = 0) => {
    const date = new Date(now);
    date.setHours(h, m, s, ms);
    return date.toISOString();
  };
  const daysAgo = (d: number, h: number, m: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    date.setHours(h, m, 0, 0);
    return date.toISOString();
  };
  // Última ocorrência do dia/mês até hoje.
  const on = (month: number, day: number) => {
    const date = new Date(now.getFullYear(), month - 1, day, 12);
    if (date > now) date.setFullYear(date.getFullYear() - 1);
    return date.toISOString();
  };
  return { at, daysAgo, on };
}

const person = (
  id: string,
  name: string,
  department: string | null = null,
) => ({ id, name, department });

function ticket(
  code: string,
  title: string,
  category: MockTicket["category"],
  status: MockTicket["status"],
  createdAt: string,
  extra: Partial<MockTicket> = {},
): MockTicket {
  const labels: Record<MockTicket["status"], string> = {
    WAITING_ANALYST: "Aguardando analista",
    IN_PROGRESS: "Em andamento",
    WAITING_EMPLOYEE: "Aguardando você",
    APPROVED: "Aprovado",
    RESOLVED: "Resolvido",
  };
  return {
    code,
    type: code.startsWith("REQ") ? "REQ" : "INC",
    category,
    priority: "MEDIUM",
    status,
    statusLabel: labels[status],
    title,
    createdAt,
    resolvedAt: null,
    ...extra,
  };
}

/** Conversa a partir das mensagens: a última que não é SYSTEM vira a prévia. */
function conversation(
  base: Omit<MockConversation, "lastMessage" | "lastMessageAt"> & {
    lastMessageAt?: string;
  },
  messages: MockMessage[],
): MockConversation {
  const visible = messages.filter((m) => m.authorType !== "SYSTEM");
  const last = visible.at(-1);
  return {
    ...base,
    lastMessageAt:
      base.lastMessageAt ??
      messages.at(-1)?.createdAt ??
      new Date(0).toISOString(),
    lastMessage:
      last && last.authorType !== "SYSTEM"
        ? {
            authorType: last.authorType,
            content: last.content,
            createdAt: last.createdAt,
          }
        : null,
  };
}

function messagesFor(
  convId: string,
  owner: MockPerson,
  rows: [AuthorType, string, string][],
  analyst?: MockPerson,
): MockMessage[] {
  return rows.map(([authorType, createdAt, content], index) => ({
    id: `mock-msg-${convId}-${index + 1}`,
    authorType,
    author:
      authorType === "EMPLOYEE"
        ? owner
        : authorType === "ANALYST"
          ? (analyst ?? null)
          : null,
    content,
    createdAt,
  }));
}

const NONE = { conversationTicket: null, otherTickets: [] };

function defaultState(now: Date): MockState {
  const { at, daysAgo, on } = clock(now);
  const state: MockState = { conversations: [], messages: {}, tickets: {} };
  const add = (
    conv: MockConversation,
    msgs: MockMessage[],
    tickets: MockState["tickets"][string] = NONE,
  ) => {
    state.conversations.push(conv);
    state.messages[conv.id] = msgs;
    state.tickets[conv.id] = tickets;
  };
  const common = {
    analyst: null,
    assignedToMe: false,
    handoffReason: null,
    handoffSummary: null,
    handoffAt: null,
    closedAt: null,
    lastAgentConfidence: null,
    ticketCode: null,
  };

  const ana = person("mock-user-ana-5", "Ana Souza", "Financeiro");
  const anaHandoff = at(10, 5, 0, 1);
  const anaMsgs = messagesFor("mock-conv-ana", ana, [
    ["EMPLOYEE", at(10, 1), "Qual o status do meu chamado?"],
    [
      "AGENT",
      at(10, 1, 10),
      "Você tem 3 chamados abertos. Sobre qual deles quer saber?",
    ],
    ["EMPLOYEE", at(10, 2), "INC-20311 · Notebook lento após atualização"],
    [
      "AGENT",
      at(10, 2, 10),
      "Está sem atualização há 5 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?",
    ],
    ["EMPLOYEE", at(10, 4), "Está parado há 5 dias."],
    ["EMPLOYEE", at(10, 4, 30), "Quero falar com um analista."],
    [
      "AGENT",
      at(10, 5),
      "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.",
    ],
    ["SYSTEM", anaHandoff, "Transferida para um analista"],
  ]);
  add(
    conversation(
      {
        ...common,
        id: "mock-conv-ana",
        status: "WAITING_ANALYST",
        owner: ana,
        handoffReason: "OVERDUE",
        handoffAt: anaHandoff,
        ticketCode: "INC-20311",
        lastAgentConfidence: "HIGH",
        handoffSummary:
          "Ana pergunta pelo INC-20311 (notebook lento após atualização), parado há 5 dias, acima do prazo de 3 dias úteis. Pediu um analista.",
      },
      anaMsgs,
    ),
    anaMsgs,
    {
      conversationTicket: ticket(
        "INC-20311",
        "Notebook lento após atualização",
        "HARDWARE",
        "WAITING_ANALYST",
        daysAgo(5, 14, 20),
      ),
      otherTickets: [
        ticket(
          "INC-20298",
          "Acesso à pasta Financeiro",
          "ACCESS",
          "IN_PROGRESS",
          daysAgo(6, 9, 0),
        ),
        ticket(
          "REQ-10442",
          "Segundo monitor para home office",
          "HARDWARE",
          "APPROVED",
          daysAgo(11, 9, 0),
        ),
        ticket(
          "INC-19877",
          "Outlook não sincroniza no celular",
          "EMAIL",
          "RESOLVED",
          on(8, 30),
          { resolvedAt: on(9, 2) },
        ),
        ticket(
          "INC-19410",
          "Troca de senha da rede",
          "ACCESS",
          "RESOLVED",
          on(7, 10),
          { resolvedAt: on(7, 11) },
        ),
      ],
    },
  );

  const carla = person("mock-user-carla-5", "Carla Mendes", "Compras");
  const carlaMsgs = messagesFor("mock-conv-carla", carla, [
    [
      "EMPLOYEE",
      at(9, 56),
      "Preciso de acesso ao SAP para lançar notas fiscais.",
    ],
    [
      "AGENT",
      at(9, 57),
      "Posso abrir uma requisição de acesso ao SAP. O prazo é de até 3 dias úteis.",
    ],
    ["EMPLOYEE", at(9, 58), "Preciso de acesso ao SAP ainda hoje"],
    ["SYSTEM", at(9, 58, 5), "Transferida para um analista"],
  ]);
  add(
    conversation(
      {
        ...common,
        id: "mock-conv-carla",
        status: "WAITING_ANALYST",
        owner: carla,
        handoffReason: "EMPLOYEE_REQUEST",
        handoffAt: at(9, 58, 5),
        lastAgentConfidence: "HIGH",
        handoffSummary:
          "Carla precisa de acesso ao SAP ainda hoje e pediu um analista.",
      },
      carlaMsgs,
    ),
    carlaMsgs,
  );

  const bruno = person("mock-user-bruno-6", "Bruno Tavares", "Marketing");
  const brunoMsgs = messagesFor("mock-conv-bruno", bruno, [
    [
      "EMPLOYEE",
      at(9, 49),
      "A impressora do 3º andar está imprimindo tudo em branco desde cedo.",
    ],
    ["AGENT", at(9, 51), "Vou chamar um analista para isso."],
    ["SYSTEM", at(9, 51, 5), "Transferida para um analista"],
  ]);
  add(
    conversation(
      {
        ...common,
        id: "mock-conv-bruno",
        status: "WAITING_ANALYST",
        owner: bruno,
        handoffReason: "LOW_CONFIDENCE",
        handoffAt: at(9, 51, 5),
        lastAgentConfidence: "LOW",
        handoffSummary:
          "Impressora do 3º andar imprime em branco; o agent não teve confiança para resolver.",
      },
      brunoMsgs,
    ),
    brunoMsgs,
    {
      conversationTicket: null,
      otherTickets: [
        ticket(
          "INC-20377",
          "Teclado sem algumas teclas",
          "HARDWARE",
          "IN_PROGRESS",
          daysAgo(3, 11, 0),
        ),
      ],
    },
  );

  const diego = person("mock-user-diego-2", "Diego Ramos", "Vendas");
  const diegoMsgs = messagesFor("mock-conv-diego", diego, [
    ["EMPLOYEE", at(9, 40), "A VPN não conecta no notebook."],
    [
      "AGENT",
      at(9, 42),
      "Tente sair e entrar de novo no cliente da VPN e me diga se funcionou.",
    ],
    [
      "EMPLOYEE",
      now.toISOString(),
      "Consegui entrar, mas a VPN cai a cada 10 minutos.",
    ],
  ]);
  add(
    conversation(
      {
        ...common,
        id: "mock-conv-diego",
        status: "WITH_AGENT",
        owner: diego,
        lastAgentConfidence: "MEDIUM",
      },
      diegoMsgs,
    ),
    diegoMsgs,
  );

  const elisa = person("mock-user-elisa-4", "Elisa Prado", "RH");
  const elisaMsgs = messagesFor("mock-conv-elisa", elisa, [
    ["EMPLOYEE", at(10, 0), "O sistema de ponto não abre desde ontem."],
    [
      "AGENT",
      at(10, 2),
      "Vou abrir um chamado para isso. Confira antes de eu criar.",
    ],
    ["AGENT", at(10, 3), "Chamado INC-20519 criado."],
  ]);
  add(
    conversation(
      {
        ...common,
        id: "mock-conv-elisa",
        status: "WITH_AGENT",
        owner: elisa,
        ticketCode: "INC-20519",
        lastAgentConfidence: "HIGH",
      },
      elisaMsgs,
    ),
    elisaMsgs,
    {
      conversationTicket: ticket(
        "INC-20519",
        "Sistema de ponto não abre",
        "SOFTWARE",
        "WAITING_ANALYST",
        at(10, 3),
      ),
      otherTickets: [],
    },
  );

  const fabio = person("mock-user-fabio-5", "Fábio Nunes", "Jurídico");
  const fabioMsgs = messagesFor("mock-conv-fabio", fabio, [
    ["EMPLOYEE", at(9, 55), "Como faço para conectar na impressora da sala 2?"],
    [
      "AGENT",
      at(9, 57),
      "No Windows, vá em Configurações › Impressoras e adicione a SALA-2.",
    ],
    ["EMPLOYEE", at(10, 1), "Isso resolveu, obrigado!"],
  ]);
  add(
    conversation(
      {
        ...common,
        id: "mock-conv-fabio",
        status: "CLOSED",
        owner: fabio,
        closedAt: at(10, 1, 30),
        lastAgentConfidence: "HIGH",
      },
      fabioMsgs,
    ),
    fabioMsgs,
  );

  const gabriela = person(
    "mock-user-gabriela-2",
    "Gabriela Rocha",
    "Operações",
  );
  const gabrielaMsgs = messagesFor("mock-conv-gabriela", gabriela, [
    ["EMPLOYEE", daysAgo(1, 16, 38), "Qual a senha do Wi-Fi de visitantes?"],
    [
      "AGENT",
      daysAgo(1, 16, 40),
      "A senha do Wi-Fi foi enviada para o seu e-mail.",
    ],
  ]);
  add(
    conversation(
      {
        ...common,
        id: "mock-conv-gabriela",
        status: "CLOSED",
        owner: gabriela,
        closedAt: daysAgo(1, 16, 45),
        lastAgentConfidence: "HIGH",
      },
      gabrielaMsgs,
    ),
    gabrielaMsgs,
  );

  return state;
}

function addFullCases(state: MockState, now: Date): void {
  const { at, daysAgo } = clock(now);
  const common = {
    handoffSummary: null,
    closedAt: null,
    lastAgentConfidence: "HIGH" as const,
    ticketCode: null,
  };
  const me = { id: "mock-analyst-me", name: "Rafael Lima" };
  const bruno = { id: "mock-analyst-bruno", name: "Bruno Martins" };
  const push = (conv: MockConversation, msgs: MockMessage[]) => {
    state.conversations.push(conv);
    state.messages[conv.id] = msgs;
    state.tickets[conv.id] = NONE;
  };

  const juliana = person("mock-user-juliana-1", "Juliana Alves", "Operações");
  const julianaMsgs = messagesFor("mock-conv-juliana", juliana, [
    [
      "EMPLOYEE",
      at(9, 30),
      "O sistema de faturamento caiu para toda a equipe.",
    ],
    [
      "AGENT",
      at(9, 31),
      "Abri o INC-20410 com prioridade crítica e chamei um analista.",
    ],
    ["SYSTEM", at(9, 31, 5), "Transferida para um analista"],
  ]);
  push(
    conversation(
      {
        ...common,
        id: "mock-conv-juliana",
        status: "WAITING_ANALYST",
        owner: juliana,
        analyst: null,
        assignedToMe: false,
        handoffReason: "CRITICAL",
        handoffAt: at(9, 31, 5),
        ticketCode: "INC-20410",
      },
      julianaMsgs,
    ),
    julianaMsgs,
  );

  const marina = person("mock-user-marina-1", "Marina Costa", "Comercial");
  const marinaMsgs = messagesFor(
    "mock-conv-marina",
    marina,
    [
      [
        "EMPLOYEE",
        at(8, 50),
        "Quero falar com um analista sobre o meu notebook.",
      ],
      ["SYSTEM", at(8, 51), "Transferida para um analista"],
      ["SYSTEM", at(8, 55), "Rafael assumiu a conversa"],
      ["ANALYST", at(8, 56), "Oi, Marina. Já estou olhando o seu notebook."],
    ],
    me,
  );
  push(
    conversation(
      {
        ...common,
        id: "mock-conv-marina",
        status: "WITH_ANALYST",
        owner: marina,
        analyst: me,
        assignedToMe: true,
        handoffReason: "EMPLOYEE_REQUEST",
        handoffAt: at(8, 51),
      },
      marinaMsgs,
    ),
    marinaMsgs,
  );

  const rafael = person("mock-user-rafael-3", "Rafael Lima", "TI");
  const rafaelMsgs = messagesFor(
    "mock-conv-rafael",
    rafael,
    [
      ["EMPLOYEE", at(8, 30), "Meu acesso ao Jira expirou."],
      ["SYSTEM", at(8, 31), "Transferida para um analista"],
      ["SYSTEM", at(8, 40), "Bruno assumiu a conversa"],
      ["ANALYST", at(8, 41), "Vou renovar agora."],
    ],
    bruno,
  );
  push(
    conversation(
      {
        ...common,
        id: "mock-conv-rafael",
        status: "WITH_ANALYST",
        owner: rafael,
        analyst: bruno,
        assignedToMe: false,
        handoffReason: "EMPLOYEE_REQUEST",
        handoffAt: at(8, 31),
      },
      rafaelMsgs,
    ),
    rafaelMsgs,
  );

  const otto = person("mock-user-otto-1", "Otto Lima", "Financeiro");
  const ottoMsgs = messagesFor(
    "mock-conv-otto",
    otto,
    [
      ["EMPLOYEE", daysAgo(1, 14, 0), "O token do banco não chega."],
      [
        "ANALYST",
        daysAgo(1, 14, 20),
        "Reenviei o cadastro do token. Pode testar?",
      ],
      ["EMPLOYEE", daysAgo(1, 14, 30), "Chegou, obrigado."],
    ],
    bruno,
  );
  push(
    conversation(
      {
        ...common,
        id: "mock-conv-otto",
        status: "CLOSED",
        owner: otto,
        analyst: bruno,
        assignedToMe: false,
        handoffReason: "EMPLOYEE_REQUEST",
        handoffAt: daysAgo(1, 14, 5),
        closedAt: daysAgo(1, 14, 35),
      },
      ottoMsgs,
    ),
    ottoMsgs,
  );
}

export function buildConsoleFixtures(
  now: Date,
  scenario: MockScenario,
): MockState {
  if (scenario === "empty")
    return { conversations: [], messages: {}, tickets: {} };
  const state = defaultState(now);
  if (scenario === "full") addFullCases(state, now);
  return state;
}
