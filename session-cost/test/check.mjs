/**
 * Offline component check for the session-cost client half.
 *
 * Loads the bundle's client.js with a stub module loader and a minimal React
 * shim, captures the plugin object and its dock registration, then calls the
 * dock component directly with controlled hook state. That exercises the
 * trigger branch and the balance-window branch, the cost math, the dictionary
 * coverage, and the injected balance read against a stubbed Remote.
 *
 * Not part of the bundle; run it through the DSH Electron runtime as Node.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';

let plugin;
const ReactShim = {
  Fragment: 'Fragment',
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat() };
  },
  useState(initial) {
    if (ReactShim.stateQueue.length > 0) return [ReactShim.stateQueue.shift(), () => {}];
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useRef(initial) {
    return { current: initial };
  },
  useEffect() {},
  stateQueue: [],
};
const moduleTable = {
  react: ReactShim,
  'react-dom': {
    createPortal(children, container) {
      // Mirror React: an undefined container throws, which would take the whole
      // slot entry down and make the trigger disappear.
      if (container !== globalThis.document.body) {
        throw new Error('createPortal: target container is not a DOM element');
      }
      return { type: 'portal', props: { container }, children: [children] };
    },
  },
};
globalThis.document = {
  body: { tag: 'body' },
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      plugin = definition.factory((specifier) => {
        if (!(specifier in moduleTable)) throw new Error(`unexpected module ${specifier}`);
        return moduleTable[specifier];
      });
    },
  },
};

const bundleUrl = pathToFileURL(fileURLToPath(new URL('../client.js', import.meta.url))).href;
await import(bundleUrl);
if (plugin === undefined) throw new Error('the module loader did not receive a plugin');

const dictionaries = new Map();
let registration;
let balanceState = { ok: true, value: null };

const accountUiStub = {
  clientMetadata: (locale) => ({ version: '9.9.9', locale, timezoneOffsetSeconds: 0 }),
  getSnapshot: () => ({ view: { links: { topUpUrl: 'https://a', usageUrl: 'https://b' } } }),
};

/**
 * Client context stub. `mode` selects how the optional `remote.account` service
 * reaches the plugin: through its own scoped injection, through the inject-free
 * `ctx.get`, or not at all.
 */
const clientStub = (mode) => {
  const account = { getBalance: async () => balanceState };
  return {
    effect: (callback) => callback(),
    locale: {
      register: (ns, dict) => { dictionaries.set(ns, dict); return () => {}; },
      getSnapshot: () => ({ active: 'ru' }),
    },
    inject: (deps, callback) => {
      if (!Array.isArray(deps) || deps[0] !== 'remote.account') throw new Error(`unexpected inject ${deps}`);
      if (mode !== 'injected') return;
      callback({
        remote: { account },
        effect: (inner) => inner(),
      });
    },
    get: (name) => {
      if (name === 'remote.account') return mode === 'get' ? account : undefined;
      if (name === 'accountUi') return accountUiStub;
      return undefined;
    },
    slots: {
      inject: (key, callback) => {
        if (key !== 'conversation.composer.dock') throw new Error(`unexpected slot ${key}`);
        return callback();
      },
      register: (options, component) => { registration = { options, component }; return () => {}; },
    },
  };
};

plugin.apply(clientStub('injected'));

const dict = dictionaries.get('sessionCost');
if (dict === undefined) throw new Error('no sessionCost dictionary registered');
const interpolate = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => (
  values && key in values ? String(values[key]) : `{${key}}`
));
const translate = (key, values) => {
  if (dict.en[key] === undefined) throw new Error(`missing en key ${key}`);
  if (dict.ru[key] === undefined) throw new Error(`missing ru key ${key}`);
  return interpolate(dict.ru[key], values);
};

function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children ?? []).map(textOf).join('');
}

function findNode(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (predicate(node)) return node;
  return findNode(node.children ?? [], predicate);
}

const usage = {
  uncachedInputTokens: 1_200_000,
  outputTokens: 340_000,
  cacheReadTokens: 8_000_000,
  cacheWriteTokens: 0,
};
const expected = (1_200_000 * 0.3 + 8_000_000 * 0.006 + 340_000 * 1.2) / 1e6;
const expectedLabel = `$${expected.toFixed(3)}`;
const props = {
  useProjection: (key) => (key === 'tokenUsage' ? usage : undefined),
  t: translate,
  loadBalance: registration.options.inject('session-1').loadBalance,
};

// A controllable clock: peak pricing follows UTC hours, so the strip's marker
// must be reproducible in the test.
const RealDate = Date;
const WEEK = RealDate.UTC(2026, 10, 16, 12, 0, 0);
const BASE_DOW = new RealDate(WEEK).getUTCDay();
/** Instant at `weekday` (0 = Sunday) and UTC `hours:minutes` of the base week. */
function utcAt(weekday, hours, minutes) {
  return WEEK + (weekday - BASE_DOW) * 86400000 - 12 * 3600000 + hours * 3600000 + minutes * 60000;
}
let FAKE_NOW = utcAt(3, 12, 0);
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FAKE_NOW);
    else super(...args);
  }
  static now() { return FAKE_NOW; }
};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};

// Branch 1: the closed strip under the composer, outside peak hours.
FAKE_NOW = utcAt(3, 12, 0);
ReactShim.stateQueue = [false, 0, { status: 'idle' }];
const closed = registration.component(props);
const closedText = textOf(closed);
if (!closedText.includes(expectedLabel)) throw new Error(`cost ${expectedLabel} missing: ${closedText}`);
const trigger = closed.children.find(child => child && child.props.className === 'dsh-session-cost-root');
if (trigger === undefined) throw new Error('no dock root element');
const button = trigger.children[0];
if (button.type !== 'button' || button.props['aria-haspopup'] !== 'dialog') throw new Error('trigger is not a dialog button');
if (findNode(button, node => node.type === 'svg') !== undefined) throw new Error('the trigger draws a glyph outside peak hours');
if (!String(button.props['aria-label']).includes('Стоимость сессии')) {
  throw new Error(`localized trigger label missing: ${button.props['aria-label']}`);
}
if (!String(button.props.title).includes(expectedLabel)) throw new Error(`trigger title missing the cost: ${button.props.title}`);
console.log(`trigger ok: label ${expectedLabel}`);

// The peak marker, including both window edges and the weekday rule.
function stripButtonAt(time) {
  FAKE_NOW = time;
  ReactShim.stateQueue = [false, 0, { status: 'idle' }];
  const tree = registration.component(props);
  const root = tree.children.find(child => child && child.props.className === 'dsh-session-cost-root');
  return root.children[0];
}
function hasPeakMarker(time) {
  const at = stripButtonAt(time);
  return findNode(at, node => node.props && node.props.className === 'dsh-session-cost-peak') !== undefined;
}
const peakCases = [
  [utcAt(3, 1, 0), true, 'window start'],
  [utcAt(3, 3, 59), true, 'inside the first window'],
  [utcAt(3, 4, 0), false, 'first window end'],
  [utcAt(3, 5, 59), false, 'between windows'],
  [utcAt(3, 6, 0), true, 'second window start'],
  [utcAt(3, 9, 59), true, 'inside the second window'],
  [utcAt(3, 10, 0), false, 'second window end'],
  [utcAt(3, 0, 59), false, 'before the first window'],
  [utcAt(6, 2, 0), false, 'weekend'],
];
for (const [time, expected, label] of peakCases) {
  const actual = hasPeakMarker(time);
  if (actual !== expected) {
    throw new Error(`peak marker ${label}: expected ${expected}, got ${actual} at ${new RealDate(time).toISOString()}`);
  }
}
const peakButton = stripButtonAt(utcAt(3, 2, 30));
if (!String(peakButton.props['aria-label']).includes('пиковые часы')) {
  throw new Error(`the peak aria-label is missing: ${peakButton.props['aria-label']}`);
}
if (String(peakButton.props.title).includes('пиковые')) throw new Error('the peak state leaked into the title');
console.log('peak marker ok: windows, edges, weekend, and the aria-label');

// Branch 2: the open window with a ready balance, inside peak hours.
FAKE_NOW = utcAt(3, 2, 30);
ReactShim.stateQueue = [true, 0, {
  status: 'ready',
  wallets: [{ currency: 'USD', balance: '12.34' }],
  bonusWallets: [{ currency: 'CNY', balance: '5' }, { currency: 'EUR', balance: '3.5' }],
  links: { topUpUrl: 'https://a', usageUrl: 'https://b' },
}];
const open = registration.component(props);
const portal = open.children.find(child => child && child.type === 'portal');
if (portal === undefined) throw new Error('the window did not portal to the document body');
if (portal.children.length !== 1) throw new Error(`the portal carries ${portal.children.length} children instead of the one backdrop`);
const backdrop = portal.children[0];
if (backdrop.props.className !== 'dsh-session-cost-backdrop') {
  throw new Error(`the portal's only child is not the backdrop: ${backdrop.props.className}`);
}
if (backdrop.children.length !== 1) throw new Error('the backdrop carries more than the panel');
if (backdrop.children[0].props.role !== 'dialog') throw new Error('the backdrop does not carry the dialog panel');
const windowText = textOf(portal);
for (const expectedPart of [
  'Баланс DeepSeek',
  'Стоимость сессии',
  expectedLabel,
  '$12.34',
  '¥5.00',
  'EUR 3.50',
  'Ввод без кэша',
  'млн',
  'тыс.',
  'Пополненный баланс',
  'Бонусы DeepSeek',
  'Начисления от DeepSeek; списываются раньше ваших пополнений.',
  'Пополнить',
  'Использование',
  'Тарифы за 1 млн токенов: $0.30 ввод без кэша, $0.006 ввод из кэша, $1.20 вывод.',
  'Сейчас пиковые часы: тариф вдвое выше непикового.',
]) {
  if (!windowText.includes(expectedPart)) throw new Error(`window is missing "${expectedPart}": ${windowText}`);
}
const statusRegion = findNode(portal, node => node.props && node.props.role === 'status');
if (statusRegion === undefined) throw new Error('the balance region is not a live status region');
if (statusRegion.props['aria-live'] !== 'polite') throw new Error('the balance region is not polite');
console.log(`window ok: ${windowText.length} characters of copy`);

// Branch 3: a failed read keeps the localized line and shows the raw detail.
ReactShim.stateQueue = [true, 0, { status: 'error', message: 'boom' }];
const failed = registration.component(props);
const failedText = textOf(failed);
for (const expectedPart of ['Не удалось прочитать баланс.', 'boom', 'Повторить']) {
  if (!failedText.includes(expectedPart)) throw new Error(`failed window is missing "${expectedPart}": ${failedText}`);
}
console.log('error window ok');

// Branch 4: no provider-reported usage hides the entry instead of claiming $0.00.
const noUsage = registration.component({ ...props, useProjection: () => undefined });
if (noUsage !== null) throw new Error('the entry rendered without a token-usage projection');
console.log('unknown-usage entry hidden ok');

if (Object.keys(dict.en).length !== Object.keys(dict.ru).length) {
  throw new Error('en and ru dictionaries have different key sets');
}

// The injected balance read across its outcomes.
const loadBalance = registration.options.inject('session-1').loadBalance;
balanceState = {
  ok: true,
  value: {
    status: 'ready',
    value: [{ currency: 'USD', balance: '12.34' }],
    bonusWallets: [{ currency: 'CNY', balance: '5' }],
  },
};
const ready = await loadBalance();
if (ready.status !== 'ready' || ready.wallets.length !== 1 || ready.bonusWallets.length !== 1) {
  throw new Error(`unexpected ready balance ${JSON.stringify(ready)}`);
}
if (ready.links.topUpUrl !== 'https://a') throw new Error('balance links missing');
console.log('balance ready ok:', JSON.stringify(ready));

balanceState = { ok: true, value: null };
console.log('balance signed-out:', JSON.stringify(await loadBalance()));
balanceState = { ok: false, error: { code: 'x', message: 'boom' } };
console.log('balance failed:', JSON.stringify(await loadBalance()));

// A profile without the account namespace keeps the cost button and says so.
plugin.apply(clientStub('absent'));
const unavailable = await registration.options.inject('session-1').loadBalance();
if (unavailable.status !== 'unavailable') throw new Error(`unexpected unavailable state ${JSON.stringify(unavailable)}`);
console.log('balance unavailable ok:', JSON.stringify(unavailable));

// The same read through the inject-free service lookup, without its own scope.
plugin.apply(clientStub('get'));
balanceState = {
  ok: true,
  value: {
    status: 'ready',
    value: [{ currency: 'CNY', balance: '7' }],
    bonusWallets: [],
  },
};
const viaGet = await registration.options.inject('session-1').loadBalance();
if (viaGet.status !== 'ready' || viaGet.wallets[0].currency !== 'CNY') {
  throw new Error(`the inject-free read did not resolve the namespace: ${JSON.stringify(viaGet)}`);
}
console.log('balance via inject-free read ok:', JSON.stringify(viaGet));
console.log('all checks passed');
