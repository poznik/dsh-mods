/**
 * Session cost strip below the message composer.
 *
 * The button shows the estimated cost of the current Session, priced from the
 * `tokenUsage` Session projection that the shipped token meter already folds
 * out of the durable log. Clicking it opens a window with the account's DeepSeek
 * balance, read on demand from the shipped `account` Remote namespace.
 *
 * Nothing here writes Session state, and nothing is fetched until the window
 * opens; closing the window drops the read.
 */
window.__ModuleLoader__.load({
  id: '@local/session-cost',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const createPortal = ReactDOM.createPortal;

    /** Client locale namespace owned by this plugin. */
    const NS = 'sessionCost';

    /**
     * Rates used for the estimate, in US dollars per 1M tokens: DeepSeek V4.1
     * Flash (`deepseek-flash`) peak-hour list rates. Off-peak hours cost half,
     * and other models differ, so the strip presents the number as an estimate.
     * Edit this object to match your model and billing window.
     */
    const PRICES = Object.freeze({
      cacheMissInput: 0.3,
      cacheHitInput: 0.006,
      output: 1.2,
    });

    /**
     * DeepSeek peak-pricing windows in UTC, as `[fromHour, toHourExclusive]`
     * pairs, and the days they apply to. Off-peak hours cost half of these
     * rates, so the strip marks the peak ones. Chinese public holidays are not
     * modelled: on those days Platform bills off-peak rates while the marker
     * still follows the weekday schedule.
     */
    const PEAK_HOURS_UTC = Object.freeze([[1, 4], [6, 10]]);
    const PEAK_WEEKDAYS_ONLY = true;

    /** Whether `time` falls inside a peak-pricing window. */
    function isPeakHour(time) {
      const at = new Date(time);
      const weekday = at.getUTCDay();
      if (PEAK_WEEKDAYS_ONLY && (weekday === 0 || weekday === 6)) return false;
      const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
      return PEAK_HOURS_UTC.some(([from, to]) => minutes >= from * 60 && minutes < to * 60);
    }

    const en = {
      'trigger.aria': 'Session cost {cost}. Open the DeepSeek balance.',
      'trigger.aria.peak': 'Session cost {cost}, peak hours. Open the DeepSeek balance.',
      'trigger.title': 'Estimated session cost {cost}',
      'peak.title': 'Peak hours: the rate is twice the off-peak one',
      'window.title': 'DeepSeek balance',
      'window.close': 'Close',
      'session.cost': 'Session cost',
      'session.tokens': 'Uncached input {input} · cached input {cached} · output {output}',
      'session.estimate': 'Estimate in US dollars at DeepSeek V4.1 Flash peak rates; off-peak hours cost half. Balances keep their own wallet currency.',
      'session.peakNow': 'Peak hours now: the rate is twice the off-peak one.',
      'balance.title': 'Balance',
      'wallet.recharge': 'Topped-up balance',
      'wallet.bonus': 'DeepSeek bonus credits',
      'wallet.bonusHint': 'Credits DeepSeek granted you; they are spent before your topped-up balance.',
      'status.loading': 'Reading the balance…',
      'status.signedOut': 'Sign in to DeepSeek in Settings → Account to see the balance.',
      'status.unavailable': 'This profile does not expose the DeepSeek account.',
      'status.error': 'The balance could not be read.',
      'action.refresh': 'Refresh',
      'action.retry': 'Retry',
      'action.topUp': 'Top up',
      'action.usage': 'Usage',
      'rates': 'Rates per 1M tokens: {miss} uncached input, {hit} cached input, {output} output.',
      'number.thousand': '{value}K',
      'number.million': '{value}M',
    };

    const ru = {
      'trigger.aria': 'Стоимость сессии {cost}. Открыть баланс DeepSeek.',
      'trigger.aria.peak': 'Стоимость сессии {cost}, пиковые часы. Открыть баланс DeepSeek.',
      'trigger.title': 'Оценочная стоимость сессии {cost}',
      'peak.title': 'Пиковые часы: тариф вдвое выше непикового',
      'window.title': 'Баланс DeepSeek',
      'window.close': 'Закрыть',
      'session.cost': 'Стоимость сессии',
      'session.tokens': 'Ввод без кэша {input} · из кэша {cached} · вывод {output}',
      'session.estimate': 'Оценка в долларах по пиковым тарифам DeepSeek V4.1 Flash; в непиковые часы вдвое дешевле. Баланс — в валюте кошелька.',
      'session.peakNow': 'Сейчас пиковые часы: тариф вдвое выше непикового.',
      'balance.title': 'Баланс',
      'wallet.recharge': 'Пополненный баланс',
      'wallet.bonus': 'Бонусы DeepSeek',
      'wallet.bonusHint': 'Начисления от DeepSeek; списываются раньше ваших пополнений.',
      'status.loading': 'Загрузка баланса…',
      'status.signedOut': 'Войдите в DeepSeek в разделе «Настройки» → «Аккаунт», чтобы увидеть баланс.',
      'status.unavailable': 'В этом профиле нет доступа к аккаунту DeepSeek.',
      'status.error': 'Не удалось прочитать баланс.',
      'action.refresh': 'Обновить',
      'action.retry': 'Повторить',
      'action.topUp': 'Пополнить',
      'action.usage': 'Использование',
      'rates': 'Тарифы за 1 млн токенов: {miss} ввод без кэша, {hit} ввод из кэша, {output} вывод.',
      'number.thousand': '{value} тыс.',
      'number.million': '{value} млн',
    };

    const CSS = `
.dsh-session-cost-root { display: inline-flex; flex: none; }
.dsh-session-cost-trigger {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 1px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer;
}
.dsh-session-cost-trigger[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));
  color: var(--dsw-alias-label-secondary);
}
.dsh-session-cost-peak {
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-state-warn-primary, #d9822b);
}
.dsh-session-cost-peak svg { display: block; flex: none; }
.dsh-session-cost-peak-note {
  display: flex; align-items: flex-start; gap: 6px; margin-top: 6px;
  font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-state-warn-primary, #d9822b);
}
.dsh-session-cost-peak-note > .dsh-session-cost-peak { margin-top: 3px; }
.dsh-session-cost-backdrop {
  position: fixed; inset: 0; z-index: 1100;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.32));
}
.dsh-session-cost-panel {
  box-sizing: border-box; width: min(360px, 100%);
  max-height: calc(100vh - 32px); overflow: auto;
  padding: 16px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
  font-size: 13px; line-height: 20px;
}
.dsh-session-cost-header { display: flex; align-items: center; gap: 8px; }
.dsh-session-cost-heading { margin: 0; font-size: 14px; font-weight: 600; }
.dsh-session-cost-close {
  margin-left: auto; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dsh-session-cost-section { margin-top: 12px; }
.dsh-session-cost-label {
  color: var(--dsw-alias-label-secondary); font-size: 12px;
}
.dsh-session-cost-value {
  font-size: 22px; font-weight: 600; line-height: 28px;
  font-variant-numeric: tabular-nums;
}
.dsh-session-cost-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-session-cost-small { font-size: 12px; }
.dsh-session-cost-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dsh-session-cost-divider {
  margin: 14px 0 0; border: 0; border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh-session-cost-rows { margin: 6px 0 0; }
.dsh-session-cost-row {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; padding: 3px 0;
}
.dsh-session-cost-row dt { color: var(--dsw-alias-label-secondary); }
.dsh-session-cost-row dd {
  margin: 0; font-weight: 500; font-variant-numeric: tabular-nums;
}
.dsh-session-cost-actions {
  display: flex; align-items: center; gap: 12px; margin-top: 10px;
}
.dsh-session-cost-link {
  color: var(--dsw-alias-brand-primary);
  text-decoration: underline;
  font-size: 12px;
}
.dsh-session-cost-button {
  padding: 2px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit; font-size: 12px; line-height: 20px; cursor: pointer;
}
@media (hover: hover) {
  .dsh-session-cost-trigger:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));
    color: var(--dsw-alias-label-secondary);
  }
  .dsh-session-cost-close:hover,
  .dsh-session-cost-button:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));
  }
  .dsh-session-cost-link:hover { color: var(--dsw-alias-label-primary); }
}
`;

    /** Wallet currency symbol, falling back to the currency code. */
    function symbolOf(currency) {
      if (currency === 'CNY') return '¥';
      if (currency === 'USD') return '$';
      return `${currency} `;
    }

    /** Compact token count through the locale's own thousand/million templates. */
    function formatCount(value, t) {
      if (!Number.isFinite(value) || value <= 0) return '0';
      const scaled = (candidate) => {
        const rounded = candidate >= 100 ? Math.round(candidate) : Math.round(candidate * 10) / 10;
        return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
      };
      if (value < 1000) return String(Math.round(value));
      if (value < 1000000) return t('number.thousand', { value: scaled(value / 1000) });
      return t('number.million', { value: scaled(value / 1000000) });
    }

    /** Estimated US-dollar cost of one token-usage total. */
    function costOf(usage) {
      if (usage == null) return 0;
      const miss = Number(usage.uncachedInputTokens) || 0;
      const cached = (Number(usage.cacheReadTokens) || 0) + (Number(usage.cacheWriteTokens) || 0);
      const output = Number(usage.outputTokens) || 0;
      return (miss * PRICES.cacheMissInput + cached * PRICES.cacheHitInput + output * PRICES.output) / 1000000;
    }

    /** Currency text with enough decimals to keep a small cost readable. */
    function formatUsd(value) {
      if (!Number.isFinite(value) || value <= 0) return '$0.00';
      if (value < 0.01) return `$${value.toFixed(4)}`;
      if (value < 1) return `$${value.toFixed(3)}`;
      return `$${value.toFixed(2)}`;
    }

    /**
     * A Platform balance amount in its own wallet currency: locale digit
     * grouping with two dot decimals, matching the shipped account page.
     */
    function formatMoney(amount, symbol) {
      const value = Number(amount);
      if (!Number.isFinite(value)) return `${symbol}${amount}`;
      const [integer, fraction] = Math.abs(value).toFixed(2).split('.');
      const grouped = Number(integer).toLocaleString();
      return `${value < 0 ? '-' : ''}${symbol}${grouped}.${fraction}`;
    }

    /** A rate constant as money, for the rate footnote. */
    function formatRate(value) {
      if (!Number.isFinite(value)) return String(value);
      return `$${value >= 0.01 ? value.toFixed(2) : value.toFixed(3)}`;
    }

    /** Upward arrow that marks a peak-pricing hour next to the cost. */
    function UpArrow() {
      return h('svg', { viewBox: '0 0 12 12', width: 11, height: 11, 'aria-hidden': true },
        h('path', {
          d: 'M6 10.2V2.9M6 2.9 3.1 5.8M6 2.9l2.9 2.9',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }));
    }

    /**
     * One dock entry: the cost trigger plus its balance window.
     * @param props - standard dock props (`useProjection`, `t`), the injected balance read.
     */
    function SessionCostDock(props) {
      const t = typeof props.t === 'function' ? props.t : key => key;
      const projection = props.useProjection('tokenUsage');
      const loadBalance = props.loadBalance;
      const [open, setOpen] = React.useState(false);
      const [request, setRequest] = React.useState(0);
      const [balance, setBalance] = React.useState({ status: 'idle' });
      const [now, setNow] = React.useState(() => Date.now());
      const closeRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const loadRef = React.useRef(loadBalance);
      loadRef.current = loadBalance;

      // The peak marker follows the clock, so it must reappear and clear itself
      // without a reload; half a minute is well inside the hour-long boundaries.
      React.useEffect(() => {
        const timer = setInterval(() => { setNow(Date.now()); }, 30000);
        return () => { clearInterval(timer); };
      }, []);

      React.useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        setBalance({ status: 'loading' });
        Promise.resolve()
          .then(() => loadRef.current())
          .then((next) => {
            if (!cancelled) setBalance(next);
          })
          .catch((error) => {
            if (!cancelled) {
              setBalance({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
              });
            }
          });
        return () => { cancelled = true; };
      }, [open, request]);

      React.useEffect(() => {
        if (!open) return undefined;
        const previous = document.activeElement;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (event.key !== 'Tab' || panelRef.current === null) return;
          const focusable = Array.from(panelRef.current.querySelectorAll('button:not([disabled]), a[href]'));
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement;
          const inside = panelRef.current.contains(active);
          if (event.shiftKey && (active === first || !inside)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (active === last || !inside)) {
            event.preventDefault();
            first.focus();
          }
        };
        document.addEventListener('keydown', onKeyDown, true);
        const focus = requestAnimationFrame(() => {
          if (closeRef.current !== null) closeRef.current.focus();
        });
        return () => {
          document.removeEventListener('keydown', onKeyDown, true);
          cancelAnimationFrame(focus);
          if (previous !== null && typeof previous.focus === 'function') previous.focus();
        };
      }, [open]);

      // Without a provider-reported usage sample the cost is unknown, not zero:
      // the reserved dock row simply stays empty.
      if (projection === undefined || projection === null) return null;

      const cost = costOf(projection);
      const label = formatUsd(cost);
      const peak = isPeakHour(now);
      const miss = Number(projection.uncachedInputTokens) || 0;
      const cached = (Number(projection.cacheReadTokens) || 0) + (Number(projection.cacheWriteTokens) || 0);
      const output = Number(projection.outputTokens) || 0;

      const known = ['ready', 'loading', 'idle', 'signed-out', 'unavailable', 'error'];
      const response = known.includes(balance.status) ? balance : { status: 'error' };

      const walletRows = [];
      if (response.status === 'ready') {
        for (const wallet of response.wallets ?? []) {
          walletRows.push([t('wallet.recharge'), formatMoney(wallet.balance, symbolOf(wallet.currency))]);
        }
        for (const wallet of response.bonusWallets ?? []) {
          walletRows.push([t('wallet.bonus'), formatMoney(wallet.balance, symbolOf(wallet.currency))]);
        }
      }

      const balanceBody = (() => {
        if (response.status === 'ready') {
          if (walletRows.length === 0) return h('div', { className: 'dsh-session-cost-muted' }, t('status.error'));
          const rows = h('dl', { className: 'dsh-session-cost-rows' }, walletRows.map(([name, amount], index) => h('div', {
            key: `${name}-${index}`,
            className: 'dsh-session-cost-row',
          }, h('dt', null, name), h('dd', null, amount))));
          const hint = (response.bonusWallets ?? []).length > 0
            ? h('div', { className: 'dsh-session-cost-muted dsh-session-cost-small' }, t('wallet.bonusHint'))
            : null;
          return h('div', null, rows, hint);
        }
        if (response.status === 'signed-out') return h('div', { className: 'dsh-session-cost-muted' }, t('status.signedOut'));
        if (response.status === 'unavailable') return h('div', { className: 'dsh-session-cost-muted' }, t('status.unavailable'));
        if (response.status === 'error') {
          return h('div', null,
            h('div', { className: 'dsh-session-cost-error' }, t('status.error')),
            response.message
              ? h('div', { className: 'dsh-session-cost-muted dsh-session-cost-small' }, response.message)
              : null);
        }
        return h('div', { className: 'dsh-session-cost-muted' }, t('status.loading'));
      })();

      const links = response.links ?? {};
      const linkItems = [];
      if (typeof links.topUpUrl === 'string' && links.topUpUrl !== '') {
        linkItems.push(h('a', {
          key: 'top-up',
          className: 'dsh-session-cost-link',
          href: links.topUpUrl,
          target: '_blank',
          rel: 'noreferrer noopener',
        }, t('action.topUp')));
      }
      if (typeof links.usageUrl === 'string' && links.usageUrl !== '') {
        linkItems.push(h('a', {
          key: 'usage',
          className: 'dsh-session-cost-link',
          href: links.usageUrl,
          target: '_blank',
          rel: 'noreferrer noopener',
        }, t('action.usage')));
      }

      const loading = response.status === 'loading' || response.status === 'idle';
      const actionable = !loading && response.status !== 'unavailable';

      const panel = h('div', {
        ref: panelRef,
        className: 'dsh-session-cost-panel',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'dsh-session-cost-heading',
      },
      h('div', { className: 'dsh-session-cost-header' },
        h('h2', { className: 'dsh-session-cost-heading', id: 'dsh-session-cost-heading' }, t('window.title')),
        h('button', {
          ref: closeRef,
          type: 'button',
          className: 'dsh-session-cost-close',
          'aria-label': t('window.close'),
          title: t('window.close'),
          onClick: () => { setOpen(false); },
        }, h('svg', { viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': true },
          h('path', {
            d: 'M3.5 3.5l7 7M10.5 3.5l-7 7',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
          })))),
      h('div', { className: 'dsh-session-cost-section' },
        h('div', { className: 'dsh-session-cost-label' }, t('session.cost')),
        h('div', { className: 'dsh-session-cost-value' }, label),
        h('div', { className: 'dsh-session-cost-muted' }, t('session.tokens', {
          input: formatCount(miss, t),
          cached: formatCount(cached, t),
          output: formatCount(output, t),
        })),
        h('div', { className: 'dsh-session-cost-muted dsh-session-cost-small' }, t('session.estimate')),
        peak
          ? h('div', { className: 'dsh-session-cost-peak-note' },
            h('span', { className: 'dsh-session-cost-peak', 'aria-hidden': true }, h(UpArrow)),
            h('span', null, t('session.peakNow')))
          : null),
      h('hr', { className: 'dsh-session-cost-divider' }),
      h('div', { className: 'dsh-session-cost-section' },
        h('div', { className: 'dsh-session-cost-label' }, t('balance.title')),
        h('div', { role: 'status', 'aria-live': 'polite', 'aria-busy': loading }, balanceBody),
        h('div', { className: 'dsh-session-cost-actions' },
          linkItems,
          actionable
            ? h('button', {
              type: 'button',
              className: 'dsh-session-cost-button',
              onClick: () => { setRequest(value => value + 1); },
            }, response.status === 'error' ? t('action.retry') : t('action.refresh'))
            : null),
        h('div', { className: 'dsh-session-cost-muted dsh-session-cost-small' }, t('rates', {
          miss: formatRate(PRICES.cacheMissInput),
          hit: formatRate(PRICES.cacheHitInput),
          output: formatRate(PRICES.output),
        }))));

      const backdrop = h('div', {
        className: 'dsh-session-cost-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) setOpen(false);
        },
      }, panel);

      const dialog = open ? createPortal(backdrop, document.body) : null;

      return h(React.Fragment, null,
        h('style', { key: 'style' }, CSS),
        h('span', { key: 'root', className: 'dsh-session-cost-root' },
          h('button', {
            type: 'button',
            className: 'dsh-session-cost-trigger',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-label': t(peak ? 'trigger.aria.peak' : 'trigger.aria', { cost: label }),
            title: t('trigger.title', { cost: label }),
            onClick: () => { setOpen(value => !value); },
          }, h('span', null, label),
          peak
            ? h('span', {
              className: 'dsh-session-cost-peak',
              title: t('peak.title'),
              'aria-hidden': true,
            }, h(UpArrow))
            : null)),
        dialog);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'session-cost: dictionaries');

        // The account namespace is optional. `remote.account` is a Cordis service,
        // so it is read either through its own scoped injection or through the
        // inject-free service read — never through `ctx.remote`, whose namespace
        // accessors refuse to resolve without a declared inject.
        let accountNamespace;
        const adopt = (candidate) => {
          if (candidate && typeof candidate.getBalance === 'function') {
            accountNamespace = candidate;
            return true;
          }
          return false;
        };
        if (typeof ctx.inject === 'function') {
          ctx.inject(['remote.account'], (scope) => {
            adopt(scope.remote.account);
            scope.effect(() => () => { accountNamespace = undefined; }, 'session-cost: account namespace');
          });
        }
        const resolveAccount = () => {
          if (accountNamespace !== undefined) return accountNamespace;
          let candidate;
          try {
            candidate = ctx.get('remote.account');
          } catch {
            return undefined;
          }
          return adopt(candidate) ? accountNamespace : undefined;
        };

        const readBalance = async () => {
          const account = resolveAccount();
          if (account === undefined) return { status: 'unavailable' };

          const locale = ctx.locale.getSnapshot().active;
          const accountUi = ctx.get('accountUi');
          let client;
          if (accountUi && typeof accountUi.clientMetadata === 'function') {
            client = accountUi.clientMetadata(locale);
          } else {
            client = {
              version: '1.0.0',
              locale,
              timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
            };
          }

          const snapshot = accountUi && typeof accountUi.getSnapshot === 'function'
            ? accountUi.getSnapshot()
            : undefined;
          const links = snapshot && snapshot.view ? snapshot.view.links : undefined;

          const result = await account.getBalance(client);
          if (!result || result.ok !== true) {
            const reason = result && result.error && result.error.message
              ? String(result.error.message)
              : 'account balance failed';
            return { status: 'error', message: reason, ...(links ? { links } : {}) };
          }
          const value = result.value;
          if (value === null || value === undefined) return { status: 'signed-out', ...(links ? { links } : {}) };
          if (value.status !== 'ready') return { status: 'error', ...(links ? { links } : {}) };
          return {
            status: 'ready',
            wallets: value.value ?? [],
            bonusWallets: value.bonusWallets ?? [],
            ...(links ? { links } : {}),
          };
        };

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'session-cost',
          order: 2,
          locale: NS,
          inject: () => ({ loadBalance: readBalance }),
        }, SessionCostDock));
      },
    };
  },
});
