/* @ds-bundle: {"format":4,"namespace":"NexoAssist","components":[{"name":"Button"},{"name":"TextField"},{"name":"StatusBadge"},{"name":"UserMessage"},{"name":"AgentMessage"},{"name":"TicketCard"},{"name":"Checkbox"},{"name":"Composer"},{"name":"TicketSelector"},{"name":"Avatar"},{"name":"SidebarNav"},{"name":"TopBar"},{"name":"ConversationItem"},{"name":"FilterChips"},{"name":"SearchField"},{"name":"ConsoleMessage"},{"name":"SystemEvent"},{"name":"TakeoverBar"},{"name":"TicketListItem"},{"name":"CurrentTicket"},{"name":"RailItem"},{"name":"ProfileCard"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  var ICONS = {
      "check": "<path d=\"M20 6 9 17l-5-5\" />",
      "arrow-right": "<path d=\"M5 12h14\" /> <path d=\"m12 5 7 7-7 7\" />",
      "arrow-up": "<path d=\"m5 12 7-7 7 7\" /> <path d=\"M12 19V5\" />",
      "mail": "<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\" /> <rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\" />",
      "lock-keyhole": "<circle cx=\"12\" cy=\"16\" r=\"1\" /> <rect x=\"3\" y=\"10\" width=\"18\" height=\"12\" rx=\"2\" /> <path d=\"M7 10V7a5 5 0 0 1 10 0v3\" />",
      "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />",
      "bot": "<path d=\"M12 8V4H8\" /> <rect width=\"16\" height=\"12\" x=\"4\" y=\"8\" rx=\"2\" /> <path d=\"M2 14h2\" /> <path d=\"M20 14h2\" /> <path d=\"M15 13v2\" /> <path d=\"M9 13v2\" />",
      "headset": "<path d=\"M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z\" /> <path d=\"M21 16v2a4 4 0 0 1-4 4h-5\" />",
      "circle-check-big": "<path d=\"M21.801 10A10 10 0 1 1 17 3.335\" /> <path d=\"m9 11 3 3L22 4\" />",
      "x": "<path d=\"M18 6 6 18\" /> <path d=\"m6 6 12 12\" />",
      "search": "<path d=\"m21 21-4.34-4.34\" /> <circle cx=\"11\" cy=\"11\" r=\"8\" />",
      "send-horizontal": "<path d=\"M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z\" /> <path d=\"M6 12h16\" />",
      "hand": "<path d=\"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2\" /> <path d=\"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2\" /> <path d=\"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8\" /> <path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\" />",
      "arrow-right-left": "<path d=\"m16 3 4 4-4 4\" /> <path d=\"M20 7H4\" /> <path d=\"m8 21-4-4 4-4\" /> <path d=\"M4 17h16\" />",
      "chevron-right": "<path d=\"m9 18 6-6-6-6\" />",
      "check-check": "<path d=\"M18 6 7 17l-5-5\" /> <path d=\"m22 10-7.5 7.5L13 16\" />",
      "message-square": "<path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\" />",
      "user-round": "<circle cx=\"12\" cy=\"8\" r=\"5\" /> <path d=\"M20 21a8 8 0 0 0-16 0\" />",
      "log-out": "<path d=\"m16 17 5-5-5-5\" /> <path d=\"M21 12H9\" /> <path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\" />",
      "message-circle": "<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\" />",
      "ellipsis-vertical": "<circle cx=\"12\" cy=\"12\" r=\"1\" /> <circle cx=\"12\" cy=\"5\" r=\"1\" /> <circle cx=\"12\" cy=\"19\" r=\"1\" />",
      "arrow-up-right": "<path d=\"M7 7h10v10\" /> <path d=\"M7 17 17 7\" />",
      "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />",
      "key-round": "<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\" /> <circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />",
      "rotate-ccw-key": "<path d=\"M12 7v6\" /> <path d=\"M12 9h2\" /> <path d=\"M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8\" /> <path d=\"M3 3v5h5\" /> <circle cx=\"12\" cy=\"15\" r=\"2\" />"
    };

  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function omit(obj, keys) { var r = {}; for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) r[k] = obj[k]; } return r; }

  function Icon(props) {
    var size = props.size || 16;
    return h('svg', { className: cx('nx-icon', props.className), width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', dangerouslySetInnerHTML: { __html: ICONS[props.name] || '' } });
  }

  function Button(props) {
    var variant = props.variant || 'primary';
    var size = props.size || 'sm';
    var rest = omit(props, ['variant', 'size', 'icon', 'iconRight', 'kbd', 'block', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, { className: cx('nx-btn', 'nx-btn--' + variant, 'nx-btn--' + size, props.block && 'nx-btn--block', props.className) }),
      props.icon ? h(Icon, { name: props.icon, size: size === 'md' ? 16 : 15 }) : null,
      h('span', null, props.children),
      props.kbd ? h('kbd', { className: 'nx-btn__kbd' }, props.kbd) : null,
      props.iconRight ? h(Icon, { name: props.iconRight, size: 16 }) : null);
  }

  var fieldSeq = 0;
  function TextField(props) {
    var idRef = React.useRef(props.id || ('nx-field-' + (++fieldSeq)));
    var revealState = React.useState(false);
    var revealed = revealState[0], setRevealed = revealState[1];
    var isPassword = props.type === 'password';
    var inputProps = omit(props, ['label', 'link', 'linkHref', 'icon', 'className', 'type', 'id', 'autoFocus']);
    return h('div', { className: cx('nx-field', props.className) },
      h('div', { className: 'nx-field__labelrow' },
        h('label', { className: 'nx-field__label', htmlFor: idRef.current }, props.label),
        props.link ? h('a', { className: 'nx-link', href: props.linkHref || '#' }, props.link) : null),
      h('div', { className: 'nx-field__control' },
        props.icon ? h(Icon, { name: props.icon, size: 16 }) : null,
        h('input', Object.assign({}, inputProps, { id: idRef.current, autoFocus: props.autoFocus, className: 'nx-field__input', type: isPassword && revealed ? 'text' : (props.type || 'text') })),
        isPassword ? h('button', { type: 'button', className: 'nx-field__toggle', 'aria-label': revealed ? 'Ocultar senha' : 'Mostrar senha', 'aria-pressed': revealed ? 'true' : 'false', onClick: function () { setRevealed(!revealed); } }, h(Icon, { name: 'eye', size: 16 })) : null));
  }

  function StatusBadge(props) {
    var tone = props.tone || 'neutral';
    var variant = props.variant || 'dot';
    if (variant === 'tag') return h('span', { className: cx('nx-tag', 'nx-tone-' + tone, props.className) }, props.children);
    if (variant === 'pill') return h('span', { className: cx('nx-pill', 'nx-tone-' + tone, props.className) }, props.icon ? h(Icon, { name: props.icon, size: 14 }) : h('i', { className: 'nx-dot', 'aria-hidden': 'true' }), props.children);
    return h('span', { className: cx('nx-status', props.strong && 'nx-status--strong', 'nx-tone-' + tone, props.className) }, h('i', { className: 'nx-dot', 'aria-hidden': 'true' }), props.children);
  }

  function UserMessage(props) {
    return h('div', { className: cx('nx-msg-user', props.className) }, h('div', { className: 'nx-msg-user__bubble' }, props.children));
  }

  function AgentMessage(props) {
    var actions = props.actions || [];
    var options = props.options || [];
    var controlled = props.selected !== undefined;
    var st = React.useState(null);
    var picked = controlled ? props.selected : st[0];
    function choose(o) { if (!controlled) st[1](o); if (props.onSelect) props.onSelect(o); }
    var hasBubble = props.children || props.question || options.length;
    return h('div', { className: cx('nx-msg-agent', props.className) },
      h('div', { className: 'nx-trail' },
        h('span', { className: 'nx-trail__who' }, props.name || 'Nexo Assist'),
        actions.map(function (a, i) { return h('span', { key: i, className: 'nx-trail__step' }, h(Icon, { name: 'check', size: 12 }), a); })),
      hasBubble ? h('div', { className: 'nx-msg-agent__bubble' },
        props.children ? h('p', { className: 'nx-msg-agent__text' }, props.children) : null,
        props.question ? h('p', { className: 'nx-msg-agent__question' }, props.question) : null,
        options.length ? h('div', { className: 'nx-replies', role: 'group', 'aria-label': props.question || 'Opções' },
          options.map(function (o) { return h('button', { key: o, type: 'button', className: 'nx-reply', 'aria-pressed': picked === o ? 'true' : 'false', onClick: function () { choose(o); } }, o); })) : null) : null,
      props.attachment || null);
  }

  function TicketCard(props) {
    var fields = props.fields || [];
    return h('article', { className: cx('nx-ticket', props.className) },
      h('div', { className: 'nx-ticket__body' },
        h('div', { className: 'nx-ticket__eyebrow' },
          h('span', { className: 'nx-ticket__kind' }, props.kind || 'Chamado'),
          props.number ? h('i', { className: 'nx-ticket__sep', 'aria-hidden': 'true' }) : null,
          props.number ? h('span', null, props.number) : null,
          h('span', { className: 'nx-ticket__spacer' }),
          props.status ? h(StatusBadge, { tone: props.status.tone, strong: true }, props.status.label) : null),
        h('h3', { className: 'nx-ticket__title' }, props.title),
        props.description ? h('p', { className: 'nx-ticket__desc' }, props.description) : null),
      fields.length ? h('div', { className: 'nx-ticket__fields' },
        h('dl', { className: 'nx-ticket__grid', style: { margin: 0 } }, fields.map(function (f, i) {
          return h('div', { key: i, className: 'nx-ticket__field' },
            h('dt', { className: 'nx-ticket__key' }, f.label),
            h('dd', { className: cx('nx-ticket__value', f.tone === 'warning' && 'nx-ticket__value--warning'), style: { margin: 0 } },
              f.dot ? h('i', { className: cx('nx-dot', 'nx-tone-' + f.dot), 'aria-hidden': 'true' }) : null,
              h('span', null, f.value),
              f.note ? h('span', { className: 'nx-ticket__note' }, f.note) : null));
        }))) : null,
      props.actions ? h('div', { className: 'nx-ticket__actions' }, props.actions) : null);
  }

  var MARK = { d: "M21.763 0.24493l-3.374 1.687c-0.623 0.308-0.973 0.903-0.973 1.631l0 6.293-11.193-9.429c-0.623-0.469-1.372-0.553-2.03-0.245l-3.185 1.631c-0.651 0.322-1.008 0.924-1.008 1.673l0 15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c0.693-0.322 1.057-0.952 1.057-1.722l0-7.7 11.732 10.591c0.602 0.546 1.421 0.679 2.086 0.364l2.786-1.505c0.602-0.315 0.938-0.931 0.938-1.68l0-15.288c0-1.463-1.505-2.275-2.625-1.687z", w: 24.388, h: 20.6386 };
  function Mark(props) {
    var size = props.size || 20;
    return h('svg', { className: 'nx-mark', width: size, height: Math.round(size * MARK.h / MARK.w * 100) / 100, viewBox: '0 0 ' + MARK.w + ' ' + MARK.h, 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: MARK.d, fill: 'currentColor' }));
  }

  function Checkbox(props) {
    var controlled = props.checked !== undefined;
    var st = React.useState(!!props.defaultChecked);
    var on = controlled ? props.checked : st[0];
    var rest = omit(props, ['label', 'checked', 'defaultChecked', 'onChange', 'className']);
    return h('label', { className: cx('nx-check', props.className) },
      h('input', Object.assign({}, rest, { type: 'checkbox', className: 'nx-check__input', checked: on, onChange: function (e) { if (!controlled) st[1](e.target.checked); if (props.onChange) props.onChange(e); } })),
      h('span', { className: 'nx-check__box', 'aria-hidden': 'true' }, on ? h(Icon, { name: 'check', size: 12 }) : null),
      h('span', { className: 'nx-check__label' }, props.label));
  }

  function Composer(props) {
    var variant = props.variant || 'chat';
    var st = React.useState('');
    var controlled = props.value !== undefined;
    var val = controlled ? props.value : st[0];
    function change(e) { if (!controlled) st[1](e.target.value); if (props.onChange) props.onChange(e.target.value); }
    function send(e) { e.preventDefault(); if (props.locked || !String(val).trim()) return; if (props.onSend) props.onSend(val); if (!controlled) st[1](''); }
    var input = h('input', { className: 'nx-composer__input', placeholder: props.locked ? (props.lockedText || 'Assuma o atendimento para responder') : (props.placeholder || 'Escreva para o Nexo…'), value: val, onChange: change, disabled: !!props.locked, 'aria-label': props.label || 'Mensagem' });
    if (variant === 'console') {
      return h('form', { className: cx('nx-composer', 'nx-composer--console', props.locked && 'nx-composer--locked', props.className), onSubmit: send },
        h('div', { className: 'nx-composer__field' }, input),
        props.locked ? null : h('button', { type: 'submit', className: 'nx-composer__round', 'aria-label': 'Enviar' }, h(Icon, { name: 'send-horizontal', size: 18 })));
    }
    return h('form', { className: cx('nx-composer', props.className), onSubmit: send },
      h('div', { className: 'nx-composer__box' }, input,
        h('button', { type: 'submit', className: 'nx-composer__send', disabled: !!props.locked }, h(Icon, { name: 'arrow-up', size: 14 }), h('span', null, 'Enviar'))),
      props.max ? h('div', { className: 'nx-composer__meta' }, (props.count || 0) + '/' + props.max + ' mensagens nesta sessão') : null);
  }

  function TicketSelector(props) {
    var tickets = props.tickets || [];
    var controlled = props.value !== undefined;
    var st = React.useState(tickets.length ? tickets[0].number : null);
    var val = controlled ? props.value : st[0];
    return h('div', { className: cx('nx-selector', props.className), role: 'radiogroup', 'aria-label': props.label || 'Chamados' },
      tickets.map(function (t) {
        var on = val === t.number;
        return h('button', { key: t.number, type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', className: cx('nx-selector__row', on && 'is-selected'), onClick: function () { if (!controlled) st[1](t.number); if (props.onChange) props.onChange(t.number, t); } },
          h('span', { className: 'nx-radio', 'aria-hidden': 'true' }),
          h('span', { className: 'nx-selector__number' }, t.number),
          h('span', { className: 'nx-selector__title' }, t.title),
          t.status ? h(StatusBadge, { tone: t.status.tone }, t.status.label) : null,
          t.date ? h('span', { className: 'nx-selector__date' }, t.date) : null);
      }));
  }

  var AV_FONT = { 46: [15.5, 600], 40: [14.5, 600], 36: [12.5, 700], 34: [12.5, 700] };
  function Avatar(props) {
    var size = props.size || 46;
    var tone = props.tone || 'gray';
    var f = AV_FONT[size] || [Math.round(size * 0.34 * 2) / 2, 600];
    return h('span', { className: cx('nx-avatar', 'nx-avatar--' + tone, props.ring === 'desk' && 'nx-avatar--ring-desk', props.className), style: { width: size, height: size, fontSize: f[0], fontWeight: f[1] }, 'aria-label': props.name || undefined, role: props.name ? 'img' : undefined },
      props.initials,
      props.online ? h('i', { className: 'nx-avatar__online', style: size >= 46 ? { width: 11, height: 11 } : null, 'aria-hidden': 'true' }) : null);
  }

  function SidebarNav(props) {
    var items = props.items || [];
    var user = props.user;
    return h('nav', { className: cx('nx-sidebar', props.className), 'aria-label': 'Principal' },
      h('div', { className: 'nx-sidebar__logo' }, h('span', { className: 'nx-sidebar__mark' }, h(Mark, { size: 20 })), h('span', { className: 'nx-sidebar__brand' }, props.brand || 'Nexo Assist')),
      h('ul', { className: 'nx-sidebar__nav' }, items.map(function (it, i) {
        return h('li', { key: i }, h('a', { href: it.href || '#', className: cx('nx-navitem', it.active && 'is-active'), 'aria-current': it.active ? 'page' : undefined, onClick: it.onClick }, h(Icon, { name: it.icon, size: 16 }), h('span', null, it.label)));
      })),
      h('div', { className: 'nx-sidebar__spacer' }),
      user ? h('div', { className: 'nx-sidebar__user' }, h(Avatar, { initials: user.initials, tone: 'self', size: 34 }), h('div', { className: 'nx-sidebar__who' }, h('div', { className: 'nx-sidebar__name' }, user.name), h('div', { className: 'nx-sidebar__email' }, user.email))) : null,
      h('button', { type: 'button', className: 'nx-navitem nx-navitem--sm', onClick: props.onLogout }, h(Icon, { name: 'log-out', size: 16 }), h('span', null, 'Sair')));
  }

  function TopBar(props) {
    var crumbs = props.crumbs || [];
    return h('header', { className: cx('nx-topbar', props.className) },
      h('nav', { className: 'nx-crumbs', 'aria-label': 'Você está em' }, crumbs.map(function (c, i) {
        var last = i === crumbs.length - 1;
        return h(React.Fragment, { key: i }, i ? h(Icon, { name: 'chevron-right', size: 14 }) : null, h('span', { className: last ? 'nx-crumbs__here' : 'nx-crumbs__root', 'aria-current': last ? 'page' : undefined }, c));
      })),
      props.children ? h('div', { className: 'nx-topbar__end' }, props.children) : null);
  }

  function ConversationItem(props) {
    var unread = props.unread > 0;
    return h('button', { type: 'button', className: cx('nx-convo', props.selected && 'is-selected'), onClick: props.onClick, 'aria-current': props.selected ? 'true' : undefined },
      h(Avatar, { initials: props.initials, tone: props.tone, size: 46, online: props.online, ring: props.selected ? 'desk' : 'paper' }),
      h('span', { className: cx('nx-convo__text', props.divider === false && 'nx-convo__text--plain') },
        h('span', { className: 'nx-convo__top' }, h('span', { className: cx('nx-convo__name', unread && 'is-unread') }, props.name), h('span', { className: cx('nx-convo__time', unread && 'is-unread') }, props.time)),
        h('span', { className: 'nx-convo__bottom' },
          props.read ? h(Icon, { name: 'check-check', size: 15, className: 'nx-convo__ticks' }) : null,
          h('span', { className: cx('nx-convo__last', props.typing && 'is-typing') }, props.typing ? 'digitando…' : props.preview),
          unread ? h('span', { className: 'nx-count' }, props.unread) : null),
        props.tag ? h('span', { className: cx('nx-convo__tag', 'nx-tone-' + props.tag.tone) }, h('i', { className: 'nx-dot', 'aria-hidden': 'true' }), h('span', null, props.tag.label)) : null));
  }

  function FilterChips(props) {
    var items = props.items || [];
    var controlled = props.value !== undefined;
    var st = React.useState(items.length ? items[0].label : null);
    var val = controlled ? props.value : st[0];
    return h('div', { className: cx('nx-filters', props.className), role: 'tablist', 'aria-label': props.label || 'Filtros' }, items.map(function (it) {
      var on = val === it.label;
      return h('button', { key: it.label, type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false', className: cx('nx-filter', on && 'is-active'), onClick: function () { if (!controlled) st[1](it.label); if (props.onChange) props.onChange(it.label); } },
        h('span', null, it.label), it.count != null ? h('span', { className: 'nx-filter__count' }, it.count) : null);
    }));
  }

  function SearchField(props) {
    var rest = omit(props, ['className']);
    return h('label', { className: cx('nx-search', props.className) }, h(Icon, { name: 'search', size: 15 }),
      h('input', Object.assign({ type: 'search', placeholder: 'Pesquisar conversa ou chamado' }, rest, { className: 'nx-search__input', 'aria-label': props['aria-label'] || props.placeholder || 'Pesquisar conversa ou chamado' })));
  }

  function ConsoleMessage(props) {
    var from = props.from || 'client';
    var mine = from !== 'client';
    return h('div', { className: cx('nx-cmsg', 'nx-cmsg--' + from) },
      mine ? h('div', { className: 'nx-cmsg__sender' }, h('span', { className: 'nx-cmsg__name' }, props.name || (from === 'agent' ? 'Nexo Assist' : '')),
        h(StatusBadge, { variant: 'tag', tone: from === 'agent' ? 'info' : 'success' }, from === 'agent' ? 'IA' : (props.team || 'Analista'))) : null,
      h('div', { className: cx('nx-cmsg__bubble', props.long && 'nx-cmsg__bubble--long') },
        h('span', { className: 'nx-cmsg__text' }, props.children),
        h('span', { className: 'nx-cmsg__meta' }, h('span', null, props.time), mine && props.read !== false ? h(Icon, { name: 'check-check', size: 14, className: 'nx-cmsg__ticks' }) : null)));
  }

  function SystemEvent(props) {
    if (props.variant === 'day') return h('div', { className: 'nx-day' }, h('span', { className: 'nx-day__pill' }, props.children));
    return h('div', { className: 'nx-event', role: 'note' }, h('span', { className: 'nx-event__line' }), h('span', { className: 'nx-event__label' }, props.icon ? h(Icon, { name: props.icon, size: 13 }) : null, h('span', null, props.children)), h('span', { className: 'nx-event__line' }));
  }

  function TakeoverBar(props) {
    return h('section', { className: cx('nx-takeover', props.className), 'aria-label': 'Atendimento' },
      h('div', { className: 'nx-takeover__row' },
        h('span', { className: 'nx-takeover__icon', 'aria-hidden': 'true' }, h(Icon, { name: 'hand', size: 17 })),
        h('div', { className: 'nx-takeover__text' }, h('div', { className: 'nx-takeover__title' }, props.title), props.detail ? h('div', { className: 'nx-takeover__detail' }, props.detail) : null),
        h(Button, { variant: 'secondary', icon: 'bot', onClick: props.onReturn }, 'Devolver ao agent'),
        h(Button, { icon: 'headset', onClick: props.onTakeover }, 'Assumir atendimento')),
      h(Composer, { variant: 'console', locked: true }));
  }

  function TicketListItem(props) {
    var status = props.status || { tone: 'neutral', label: '' };
    return h('button', { type: 'button', className: cx('nx-tli', props.divider === false && 'nx-tli--plain', props.className), onClick: props.onClick },
      h('i', { className: cx('nx-dot', 'nx-tli__dot', 'nx-tone-' + status.tone), 'aria-hidden': 'true' }),
      h('span', { className: 'nx-tli__text' }, h('span', { className: 'nx-tli__title' }, props.title), h('span', { className: 'nx-tli__meta' }, props.number + (status.label ? ' · ' + status.label : ''))),
      h(Icon, { name: 'chevron-right', size: 16 }));
  }

  function CurrentTicket(props) {
    var ev = props.event;
    return h('div', { className: cx('nx-current', props.className) },
      h('div', { className: 'nx-current__summary' },
        h('div', { className: 'nx-current__row' }, h('span', { className: 'nx-current__number' }, props.number), props.status ? h(StatusBadge, { tone: props.status.tone, strong: true, className: 'nx-current__status' }, props.status.label) : null),
        h('div', { className: 'nx-current__title' }, props.title),
        props.meta ? h('div', { className: 'nx-current__meta' }, props.meta) : null),
      ev ? h('div', { className: 'nx-current__event' }, h(Icon, { name: ev.icon || 'arrow-right-left', size: 15 }), h('span', { className: 'nx-current__evtext' }, ev.text), h('span', { className: 'nx-current__evtime' }, ev.time)) : null);
  }

  function RailItem(props) {
    return h('button', { type: 'button', className: cx('nx-rail', props.active && 'is-active'), 'aria-label': props.label, 'aria-current': props.active ? 'page' : undefined, onClick: props.onClick },
      h(Icon, { name: props.icon || 'message-circle', size: 19 }),
      props.badge ? h('span', { className: 'nx-rail__badge' }, props.badge) : null);
  }

  function ProfileCard(props) {
    var rows = props.rows || [];
    var a = props.action;
    return h('section', { className: cx('nx-profile', props.className) },
      rows.map(function (r, i) {
        return h('div', { key: i, className: 'nx-profile__row' }, h('span', { className: 'nx-profile__key' }, r.label), h('span', { className: 'nx-profile__value' }, r.value),
          r.note ? h('span', { className: 'nx-profile__note' }, r.noteIcon ? h(Icon, { name: r.noteIcon, size: 13 }) : null, r.note) : null);
      }),
      a ? h('div', { className: 'nx-profile__action' },
        h('span', { className: 'nx-profile__icon', 'aria-hidden': 'true' }, h(Icon, { name: a.icon || 'key-round', size: 18 })),
        h('span', { className: 'nx-profile__atext' }, h('span', { className: 'nx-profile__atitle' }, a.title), a.meta ? h('span', { className: 'nx-profile__ameta' }, a.meta) : null),
        a.button ? h(Button, { variant: 'secondary', icon: a.buttonIcon, onClick: a.onClick }, a.button) : null) : null,
      props.helper ? h('div', { className: 'nx-profile__helper' }, h(Icon, { name: props.helperIcon || 'mail', size: 14 }), h('span', null, props.helper)) : null);
  }

  window.NexoAssist = Object.assign(window.NexoAssist || {}, { Button: Button, TextField: TextField, StatusBadge: StatusBadge, UserMessage: UserMessage, AgentMessage: AgentMessage, TicketCard: TicketCard, Checkbox: Checkbox, Composer: Composer, TicketSelector: TicketSelector, Avatar: Avatar, SidebarNav: SidebarNav, TopBar: TopBar, ConversationItem: ConversationItem, FilterChips: FilterChips, SearchField: SearchField, ConsoleMessage: ConsoleMessage, SystemEvent: SystemEvent, TakeoverBar: TakeoverBar, TicketListItem: TicketListItem, CurrentTicket: CurrentTicket, RailItem: RailItem, ProfileCard: ProfileCard, Icon: Icon, Mark: Mark });
})();
