import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpRight,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheckBig,
  EllipsisVertical,
  Eye,
  Hand,
  Headset,
  KeyRound,
  Lock,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquare,
  RotateCcwKey,
  Search,
  SendHorizontal,
  UserRound,
  X,
} from "lucide-react";

// Página temporária de conferência visual. Tudo fica neste arquivo de propósito:
// ela não segue a regra de rota fina do FSD e deve ser removida depois do teste.

export const metadata: Metadata = {
  title: "Teste visual | Nexo Assist",
  robots: { index: false },
};

// As classes ficam escritas por inteiro para o Tailwind encontrá-las no arquivo.
const colorGroups = [
  {
    title: "Superfícies",
    colors: [
      { token: "paper", className: "bg-paper" },
      { token: "desk", className: "bg-desk" },
      { token: "thread", className: "bg-thread" },
      { token: "bubble-agent", className: "bg-bubble-agent" },
      { token: "bubble-analyst", className: "bg-bubble-analyst" },
    ],
  },
  {
    title: "Texto e linhas",
    colors: [
      { token: "ink", className: "bg-ink" },
      { token: "ink-2", className: "bg-ink-2" },
      { token: "ink-3", className: "bg-ink-3" },
      { token: "rule", className: "bg-rule" },
    ],
  },
  {
    title: "Ação e marca",
    colors: [
      { token: "cta", className: "bg-cta" },
      { token: "mark", className: "bg-mark" },
      { token: "info", className: "bg-info" },
      { token: "info-hover", className: "bg-info-hover" },
      { token: "info-text", className: "bg-info-text" },
      { token: "info-soft", className: "bg-info-soft" },
    ],
  },
  {
    title: "Sucesso",
    colors: [
      { token: "success", className: "bg-success" },
      { token: "success-text", className: "bg-success-text" },
      { token: "success-soft", className: "bg-success-soft" },
    ],
  },
  {
    title: "Atenção",
    colors: [
      { token: "warning", className: "bg-warning" },
      { token: "warning-text", className: "bg-warning-text" },
      { token: "warning-soft", className: "bg-warning-soft" },
    ],
  },
  {
    title: "Perigo",
    colors: [
      { token: "danger", className: "bg-danger" },
      { token: "danger-text", className: "bg-danger-text" },
      { token: "danger-soft", className: "bg-danger-soft" },
    ],
  },
];

const avatars = [
  { name: "Ana Souza", initials: "AS", className: "bg-avatar-blue-bg text-avatar-blue-fg" },
  { name: "Bruno Lima", initials: "BL", className: "bg-avatar-orange-bg text-avatar-orange-fg" },
  { name: "Carla Reis", initials: "CR", className: "bg-avatar-violet-bg text-avatar-violet-fg" },
  { name: "Davi Melo", initials: "DM", className: "bg-avatar-green-bg text-avatar-green-fg" },
  { name: "Elisa Rocha", initials: "ER", className: "bg-avatar-rose-bg text-avatar-rose-fg" },
  { name: "Fábio Nunes", initials: "FN", className: "bg-avatar-yellow-bg text-avatar-yellow-fg" },
  { name: "Gil Prado", initials: "GP", className: "bg-avatar-gray-bg text-avatar-gray-fg" },
];

const statuses = [
  { label: "Aguardando analista", dot: "bg-warning", className: "bg-warning-soft text-warning-text" },
  { label: "Em andamento", dot: "bg-info", className: "bg-info-soft text-info-text" },
  { label: "Aprovado", dot: "bg-success", className: "bg-success-soft text-success-text" },
  { label: "Transferida", dot: "bg-danger", className: "bg-danger-soft text-danger-text" },
  { label: "Resolvido", dot: "bg-dot-neutral", className: "bg-desk text-ink-3" },
];

const displayStyles = [
  { className: "text-display-xl", spec: "54px", sample: "Seu problema de TI" },
  { className: "text-display-lg", spec: "40px", sample: "Entrar" },
  { className: "text-display-md", spec: "34px", sample: "72% resolvidos sem fila" },
];

const uiStyles = [
  { className: "text-page-title", spec: "24px / 700", sample: "Meu perfil" },
  { className: "text-panel-title", spec: "20px / 700", sample: "Conversas" },
  { className: "text-card-title", spec: "18px / 600", sample: "Notebook não conecta na VPN" },
  { className: "text-brand", spec: "17px / 700", sample: "Nexo Assist" },
  { className: "text-body-lg", spec: "16px / 400", sample: "Descreva o que está acontecendo." },
  { className: "text-heading", spec: "15,5px / 600", sample: "Confira antes de eu criar:" },
  { className: "text-subtitle", spec: "15,5px / 400", sample: "Use seu e-mail corporativo e a senha da rede Nexo." },
  { className: "text-body", spec: "14,5px / 400", sample: "Pronto: abri o chamado com prioridade alta." },
  { className: "text-body-strong", spec: "14,5px / 500", sample: "INC-20517" },
  { className: "text-label", spec: "13,5px / 500", sample: "E-mail corporativo" },
  { className: "text-label-strong", spec: "13,5px / 600", sample: "Assumir atendimento" },
  { className: "text-small", spec: "13,5px / 400", sample: "Um analista fala com você em até 4 h úteis." },
  { className: "text-caption", spec: "12,5px / 400", sample: "consultou seus chamados" },
  { className: "text-caption-strong", spec: "12,5px / 600", sample: "Rede e VPN · Alta" },
  { className: "text-micro", spec: "11,5px / 500", sample: "resposta até 13:43" },
  { className: "text-tag", spec: "11px / 600", sample: "Suporte N2" },
  { className: "text-time", spec: "11px / 400", sample: "16 out, 14:20" },
  { className: "text-badge", spec: "10px / 700", sample: "12" },
];

const weights = [
  { className: "font-normal", label: "400" },
  { className: "font-medium", label: "500" },
  { className: "font-semibold", label: "600" },
  { className: "font-bold", label: "700" },
];

const icons = [
  { name: "check", Icon: Check },
  { name: "check-check", Icon: CheckCheck },
  { name: "circle-check-big", Icon: CircleCheckBig },
  { name: "x", Icon: X },
  { name: "arrow-right", Icon: ArrowRight },
  { name: "arrow-up", Icon: ArrowUp },
  { name: "arrow-up-right", Icon: ArrowUpRight },
  { name: "arrow-right-left", Icon: ArrowRightLeft },
  { name: "chevron-right", Icon: ChevronRight },
  { name: "bot", Icon: Bot },
  { name: "headset", Icon: Headset },
  { name: "hand", Icon: Hand },
  { name: "message-square", Icon: MessageSquare },
  { name: "message-circle", Icon: MessageCircle },
  { name: "send-horizontal", Icon: SendHorizontal },
  { name: "user-round", Icon: UserRound },
  { name: "mail", Icon: Mail },
  { name: "lock", Icon: Lock },
  { name: "lock-keyhole", Icon: LockKeyhole },
  { name: "key-round", Icon: KeyRound },
  { name: "rotate-ccw-key", Icon: RotateCcwKey },
  { name: "eye", Icon: Eye },
  { name: "search", Icon: Search },
  { name: "ellipsis-vertical", Icon: EllipsisVertical },
  { name: "log-out", Icon: LogOut },
];

const radii = [
  { label: "rounded-xs", className: "rounded-xs" },
  { label: "rounded-sm", className: "rounded-sm" },
  { label: "rounded-md", className: "rounded-md" },
  { label: "rounded-lg", className: "rounded-lg" },
  { label: "rounded-xl", className: "rounded-xl" },
  { label: "rounded-pill", className: "rounded-pill" },
];

const shadows = [
  { label: "shadow-xs", className: "shadow-xs" },
  { label: "shadow-sm", className: "shadow-sm" },
  { label: "shadow-bubble", className: "shadow-bubble" },
  { label: "shadow-raised", className: "shadow-raised" },
  { label: "shadow-card", className: "shadow-card" },
  { label: "shadow-cta", className: "shadow-cta" },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-6 gap-6 border-t border-rule py-12 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12"
    >
      <div>
        <h2 id={`${id}-title`} className="text-panel-title text-ink">
          {title}
        </h2>
        <p className="mt-2 max-w-prose text-small text-ink-3">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function TestPage() {
  return (
    <main className="flex-1 bg-paper text-ink">
      <header className="bg-ink text-on-ink">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16 lg:py-16">
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/brand/nexo-mark-white.svg" alt="" width={24} height={20} />
              <span className="text-brand">Nexo Assist</span>
            </div>

            <p className="mt-16 text-label text-on-ink-muted">Service desk de TI da Nexo</p>
            <h1 className="mt-2 max-w-xl font-display text-display-lg text-balance sm:text-display-xl">
              Seu problema de TI, resolvido em uma conversa.
            </h1>
            <p className="mt-5 max-w-lg text-body-lg text-on-ink-muted">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na
              central de ajuda e chama um analista quando precisa.
            </p>

            <a
              href="#cores"
              className="mt-8 inline-flex h-(--control-lg) items-center gap-2 rounded-md bg-cta px-5 text-label-strong text-on-ink shadow-cta transition-colors hover:bg-info-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-ink"
            >
              Conferir a identidade visual
              <ArrowRight aria-hidden="true" size={16} />
            </a>
          </div>

          <div
            role="img"
            aria-label="Exemplo de conversa em que o assistente abre o chamado INC-20517"
            className="flex flex-col gap-2.5 rounded-xl border border-on-ink-rule p-4 sm:p-5"
          >
            <p className="ml-auto max-w-[85%] rounded-lg rounded-br-xs bg-paper px-3.5 py-2 text-body text-ink">
              Meu notebook não conecta na VPN. Erro 809.
            </p>

            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-on-ink-muted">
              <Bot aria-hidden="true" size={14} className="text-on-ink" />
              <span className="text-caption-strong text-on-ink">Nexo Assist</span>
              <span className="inline-flex items-center gap-1">
                <Check aria-hidden="true" size={12} />
                consultou seus chamados
              </span>
              <span className="inline-flex items-center gap-1">
                <Check aria-hidden="true" size={12} />
                montou o rascunho
              </span>
            </p>

            <p className="max-w-[85%] rounded-lg rounded-tl-xs bg-ink-2 px-3.5 py-2 text-body text-on-ink">
              Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
            </p>

            <p className="flex flex-wrap items-center gap-x-2 rounded-lg bg-paper px-3 py-2 text-caption text-ink-3 sm:rounded-pill">
              <span aria-hidden="true" className="size-2 rounded-pill bg-warning" />
              <span className="text-caption-strong text-ink">INC-20517</span>
              Rede e VPN · Alta · em até 4 h
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <Section
          id="cores"
          title="Cores"
          description="Cada amostra usa a classe do token. Uma amostra vazia indica token sem classe gerada."
        >
          <div className="flex flex-col gap-8">
            {colorGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-heading text-ink">{group.title}</h3>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
                  {group.colors.map((color) => (
                    <li key={color.token}>
                      <div
                        className={`h-14 rounded-md border border-line-card ${color.className}`}
                      />
                      <p className="mt-1.5 text-caption-strong text-ink">{color.token}</p>
                      <p className="text-time text-ink-3">{color.className}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <h3 className="text-heading text-ink">Status</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {statuses.map((status) => (
                  <li
                    key={status.label}
                    className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption-strong ${status.className}`}
                  >
                    <span aria-hidden="true" className={`size-2 rounded-pill ${status.dot}`} />
                    {status.label}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-heading text-ink">Avatares</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {avatars.map((avatar) => (
                  <li
                    key={avatar.name}
                    title={avatar.name}
                    className={`grid size-9 place-items-center rounded-pill text-label-strong ${avatar.className}`}
                  >
                    <span aria-hidden="true">{avatar.initials}</span>
                    <span className="sr-only">{avatar.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section
          id="tipografia"
          title="Tipografia"
          description="Compare cada fonte com o fallback do sistema: se as duas linhas ficarem iguais, a fonte não carregou."
        >
          <div className="flex flex-col gap-10">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-heading text-ink">Schibsted Grotesk</h3>
                <p className="mt-1 text-caption text-ink-3">font-ui, em toda a interface</p>
                <p className="mt-4 font-ui text-panel-title text-ink">Chamado aberto às 13:43</p>
                <p className="mt-1 font-[family-name:system-ui] text-panel-title text-ink-3">
                  Chamado aberto às 13:43
                </p>
                <p className="mt-1 text-caption text-ink-3">Acima, a fonte do projeto. Abaixo, system-ui.</p>
              </div>
              <div>
                <h3 className="text-heading text-ink">Newsreader</h3>
                <p className="mt-1 text-caption text-ink-3">font-display, só no login e aqui</p>
                <p className="mt-4 font-display text-panel-title font-normal text-ink">
                  Chamado aberto às 13:43
                </p>
                <p className="mt-1 font-[family-name:Georgia] text-panel-title font-normal text-ink-3">
                  Chamado aberto às 13:43
                </p>
                <p className="mt-1 text-caption text-ink-3">Acima, a fonte do projeto. Abaixo, Georgia.</p>
              </div>
            </div>

            <div>
              <h3 className="text-heading text-ink">Pesos da Schibsted Grotesk</h3>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {weights.map((weight) => (
                  <li key={weight.label}>
                    <p className={`text-body-lg text-ink ${weight.className}`}>Rede e VPN</p>
                    <p className="text-time text-ink-3">
                      {weight.label}, {weight.className}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-heading text-ink">Títulos do login</h3>
              <ul className="mt-1 divide-y divide-rule">
                {displayStyles.map((style) => (
                  <li key={style.className} className="py-3">
                    <p className={`font-display text-ink ${style.className}`}>{style.sample}</p>
                    <p className="mt-1 text-time text-ink-3">
                      {style.className}, {style.spec}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-heading text-ink">Estilos da interface</h3>
              <ul className="mt-1 divide-y divide-rule">
                {uiStyles.map((style) => (
                  <li
                    key={style.className}
                    className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-baseline sm:gap-4"
                  >
                    <p className={`text-ink ${style.className}`}>{style.sample}</p>
                    <p className="text-time text-ink-3">
                      {style.className}, {style.spec}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section
          id="icones"
          title="Ícones"
          description="Os 25 ícones do design system, vindos de lucide-react, em 18px e traço de 2px."
        >
          <ul className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            {icons.map(({ name, Icon }) => (
              <li key={name} className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-desk text-ink-2">
                  <Icon aria-hidden="true" size={18} strokeWidth={2} />
                </span>
                <span className="min-w-0 text-caption break-words text-ink-3">{name}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="forma"
          title="Forma e profundidade"
          description="Raios e sombras do tema. As sombras são discretas: procure a borda inferior de cada amostra."
        >
          <div className="flex flex-col gap-8">
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {radii.map((radius) => (
                <li key={radius.label}>
                  <div className={`h-14 bg-bubble-agent ${radius.className}`} />
                  <p className="mt-1.5 text-time text-ink-3">{radius.label}</p>
                </li>
              ))}
            </ul>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {shadows.map((shadow) => (
                <li key={shadow.label}>
                  <div className={`h-14 rounded-md bg-paper ${shadow.className}`} />
                  <p className="mt-2 text-time text-ink-3">{shadow.label}</p>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2.5">
              <Image src="/brand/nexo-mark.svg" alt="" width={24} height={20} />
              <span className="text-brand text-ink">Nexo Assist</span>
              <span className="text-caption text-ink-3">sobre fundo claro</span>
            </div>
          </div>
        </Section>
      </div>

      <footer className="border-t border-rule">
        <p className="mx-auto max-w-6xl px-4 py-6 text-caption text-ink-3 sm:px-8">
          © 2026 Nexo · Service desk de TI
        </p>
      </footer>
    </main>
  );
}
