import type * as React from 'react';

export type Tone = 'warning' | 'info' | 'success' | 'danger' | 'neutral' | 'medium';
export type IconName = 'check' | 'arrow-right' | 'arrow-up' | 'mail' | 'lock-keyhole' | 'eye' | 'bot' | 'headset' | 'circle-check-big' | 'x' | 'search' | 'send-horizontal' | 'hand' | 'arrow-right-left' | 'chevron-right' | 'check-check' | 'message-square' | 'user-round' | 'log-out' | 'message-circle' | 'ellipsis-vertical' | 'arrow-up-right' | 'lock' | 'key-round' | 'rotate-ccw-key';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = cta; secondary = paper com borda; ghost = só texto; danger = encerrar. Padrão: primary. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** md = 44px (Entrar); sm = 36px (todo o resto). Padrão: sm. */
  size?: 'md' | 'sm';
  /** Ícone Lucide antes do rótulo. */
  icon?: IconName;
  /** Ícone Lucide depois do rótulo (Entrar →). */
  iconRight?: IconName;
  /** Atalho de teclado mostrado no botão principal (ex.: "⌘↵"). */
  kbd?: string;
  /** Ocupa toda a largura do contêiner. */
  block?: boolean;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Rótulo acima do campo. */
  label: string;
  /** Link à direita do rótulo (ex.: "Esqueci minha senha"). */
  link?: string;
  linkHref?: string;
  /** Ícone Lucide dentro do campo, à esquerda. */
  icon?: IconName;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface StatusBadgeProps {
  tone?: Tone;
  /** dot = ponto + texto (padrão); pill = pílula com fundo suave; tag = etiqueta pequena (IA, Suporte N2). */
  variant?: 'dot' | 'pill' | 'tag';
  /** No variant dot, pinta o texto com a cor do tom e peso 500. */
  strong?: boolean;
  /** No variant pill, troca o ponto por um ícone (ex.: bot). */
  icon?: IconName;
  children: React.ReactNode;
}
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export interface UserMessageProps { children: React.ReactNode }
export declare function UserMessage(props: UserMessageProps): React.ReactElement;

export interface AgentMessageProps {
  /** Padrão: "Nexo Assist". */
  name?: string;
  /** Trilha de ações no passado, em minúsculas: ["consultou seus chamados", "buscou na central de ajuda"]. */
  actions?: string[];
  /** Texto da resposta. */
  children?: React.ReactNode;
  /** Pergunta em destaque abaixo do texto. */
  question?: string;
  /** Opções rápidas de resposta. */
  options?: string[];
  /** Opção selecionada (controlado). */
  selected?: string | null;
  onSelect?: (option: string) => void;
  /** Card mostrado logo abaixo da bolha (TicketCard, seletor de chamados). */
  attachment?: React.ReactNode;
}
export declare function AgentMessage(props: AgentMessageProps): React.ReactElement;

export interface TicketField {
  label: string;
  value: React.ReactNode;
  /** Ponto antes do valor (prioridade). */
  dot?: Tone;
  /** Texto auxiliar depois do valor: "· resposta até 13:43". */
  note?: string;
  /** warning pinta o valor em warning-text (prazo vencido). */
  tone?: 'warning';
}
export interface TicketCardProps {
  /** "Chamado" ou "Novo chamado". */
  kind?: string;
  /** Número do chamado (INC-20311) ou do rascunho (Rascunho D-381). */
  number?: string;
  status?: { tone: Tone; label: string };
  title: string;
  description?: string;
  fields?: TicketField[];
  /** Barra de ações em desk (Confirmar / Editar / Cancelar) — só no rascunho. */
  actions?: React.ReactNode;
}
export declare function TicketCard(props: TicketCardProps): React.ReactElement;

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> { label: React.ReactNode }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;

export interface ComposerProps {
  /** chat (padrão) = caixa com Enviar e contador; console = campo desk com botão redondo. */
  variant?: 'chat' | 'console';
  value?: string;
  onChange?: (value: string) => void;
  onSend?: (value: string) => void;
  placeholder?: string;
  /** Mensagens já usadas na sessão e o limite (30). */
  count?: number;
  max?: number;
  /** Bloqueia o campo (conversa com outra pessoa). */
  locked?: boolean;
  lockedText?: string;
  label?: string;
}
export declare function Composer(props: ComposerProps): React.ReactElement;

export interface TicketOption { number: string; title: string; status?: { tone: Tone; label: string }; date?: string }
export interface TicketSelectorProps { tickets: TicketOption[]; value?: string; onChange?: (number: string, ticket: TicketOption) => void; label?: string }
export declare function TicketSelector(props: TicketSelectorProps): React.ReactElement;

export interface AvatarProps {
  initials: string;
  tone?: 'self' | 'blue' | 'orange' | 'violet' | 'green' | 'rose' | 'yellow' | 'gray';
  /** 46, 40, 36 ou 34. Padrão: 46. */
  size?: number;
  online?: boolean;
  /** Cor do anel do ponto online. Padrão: paper. */
  ring?: 'paper' | 'desk';
  name?: string;
}
export declare function Avatar(props: AvatarProps): React.ReactElement;

export interface NavItem { label: string; icon: IconName; href?: string; active?: boolean; onClick?: React.MouseEventHandler }
export interface SidebarNavProps { brand?: string; items: NavItem[]; user?: { name: string; email: string; initials: string }; onLogout?: () => void }
export declare function SidebarNav(props: SidebarNavProps): React.ReactElement;

export interface TopBarProps { crumbs: string[]; children?: React.ReactNode }
export declare function TopBar(props: TopBarProps): React.ReactElement;

export interface ConversationItemProps {
  name: string; initials: string; tone?: AvatarProps['tone']; online?: boolean;
  time: string; preview?: string; unread?: number; read?: boolean; typing?: boolean; selected?: boolean;
  /** Situação da conversa. resolved = resolvida pelo agent. */
  tag?: { tone: Tone | 'resolved'; label: string };
  divider?: boolean;
  onClick?: () => void;
}
export declare function ConversationItem(props: ConversationItemProps): React.ReactElement;

export interface FilterChipsProps { items: { label: string; count?: number }[]; value?: string; onChange?: (label: string) => void; label?: string }
export declare function FilterChips(props: FilterChipsProps): React.ReactElement;

export declare function SearchField(props: React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement;

export interface ConsoleMessageProps {
  from: 'client' | 'agent' | 'analyst';
  children: React.ReactNode;
  time: string;
  /** Nome do analista (agent: "Nexo Assist"). */
  name?: string;
  /** Equipe do analista, mostrada na tag ("Suporte N2"). */
  team?: string;
  read?: boolean;
  /** Bolha de 420px com o horário numa linha própria. */
  long?: boolean;
}
export declare function ConsoleMessage(props: ConsoleMessageProps): React.ReactElement;

export interface SystemEventProps { variant?: 'event' | 'day'; icon?: IconName; children: React.ReactNode }
export declare function SystemEvent(props: SystemEventProps): React.ReactElement;

export interface TakeoverBarProps { title: string; detail?: string; onReturn?: () => void; onTakeover?: () => void }
export declare function TakeoverBar(props: TakeoverBarProps): React.ReactElement;

export interface TicketListItemProps { number: string; title: string; status: { tone: Tone; label: string }; divider?: boolean; onClick?: () => void }
export declare function TicketListItem(props: TicketListItemProps): React.ReactElement;

export interface CurrentTicketProps { number: string; status?: { tone: Tone; label: string }; title: string; meta?: string; event?: { icon?: IconName; text: string; time: string } }
export declare function CurrentTicket(props: CurrentTicketProps): React.ReactElement;

export interface RailItemProps { icon?: IconName; label: string; active?: boolean; badge?: number; onClick?: () => void }
export declare function RailItem(props: RailItemProps): React.ReactElement;

export interface ProfileCardProps {
  rows?: { label: string; value: React.ReactNode; note?: string; noteIcon?: IconName }[];
  action?: { icon?: IconName; title: string; meta?: string; button?: string; buttonIcon?: IconName; onClick?: () => void };
  helper?: string;
  helperIcon?: IconName;
}
export declare function ProfileCard(props: ProfileCardProps): React.ReactElement;

declare global {
  interface Window {
    NexoAssist: {
      Button: typeof Button; TextField: typeof TextField; StatusBadge: typeof StatusBadge;
      UserMessage: typeof UserMessage; AgentMessage: typeof AgentMessage; TicketCard: typeof TicketCard;
      Checkbox: typeof Checkbox; Composer: typeof Composer; TicketSelector: typeof TicketSelector; Avatar: typeof Avatar;
      SidebarNav: typeof SidebarNav; TopBar: typeof TopBar; ConversationItem: typeof ConversationItem; FilterChips: typeof FilterChips;
      SearchField: typeof SearchField; ConsoleMessage: typeof ConsoleMessage; SystemEvent: typeof SystemEvent; TakeoverBar: typeof TakeoverBar;
      TicketListItem: typeof TicketListItem; CurrentTicket: typeof CurrentTicket; RailItem: typeof RailItem; ProfileCard: typeof ProfileCard;
    };
  }
}
