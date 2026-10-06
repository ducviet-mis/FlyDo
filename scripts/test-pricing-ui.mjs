// Component regression checks using the existing isolated jsdom test runtime.
// No live auth, payment, gift-code redemption or Supabase mutations.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = resolve(process.cwd());
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3500/pricing', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
const future = new Date(Date.now() + 86400_000).toISOString();
let user = null;
let discountExpiresAt = null;
const routes = [];
const queries = [];
let clipboardText = '';
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { clipboardText = text; } } });
const bank = { bank_name: 'TEST BANK', account_number: '0123456789', account_holder: 'TEST ONLY', qr_image_url: '' };
const auth = (selector) => {
  const state = { user, refreshUser: async () => {} };
  return selector ? selector(state) : state;
};
auth.getState = () => ({ user, refreshUser: async () => {} });
let payment;
const db = {
  from(table) {
    assert.equal(table, 'payment_settings');
    queries.push(table);
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: bank, error: null }) };
  },
  async rpc(name, args) {
    assert.ok(['prepare_payment_order','confirm_payment_order'].includes(name));
    if (name === 'prepare_payment_order') {
      const fixtures = {
        flymax_monthly: ['FlyMax 1 tháng', 29000, 30, [29000,29000,29000]],
        flymax_quarterly: ['FlyMax 3 tháng', 69000, 90, [69000,69000,69000]],
        flymax_half_yearly: ['FlyMax 6 tháng', 139000, 180, [139000,118150,69500]],
        flymax_yearly: ['FlyMax 1 năm', 199000, 365, [199000,169150,99500]],
        flyinfinity: ['FlyInfinity trọn đời', 299000, null, [299000,254150,149500]],
      };
      const [label,price,days,amounts] = fixtures[args.p_plan_code];
      const hasStreak = discountExpiresAt && new Date(discountExpiresAt)>new Date();
      const eligible = !['flymax_monthly','flymax_quarterly'].includes(args.p_plan_code);
      const discount = eligible ? hasStreak ? 50 : user.referralDiscountPercent : 0;
      const amount = amounts[eligible && hasStreak ? 2 : discount === 15 ? 1 : 0];
      payment = { id:'20000000-0000-4000-8000-000000000001',flow_version:1,order_code:'FD123456789A',plan_code:args.p_plan_code,status:'draft',
        created_at:'2026-10-06T00:00:00Z',confirmed_at:null,reviewed_at:null,transfer_code:'DANG DUC VIET 0901234567 FD123456789A',amount_vnd:amount,
        list_price_vnd:price,discount_percent:discount,discount_amount_vnd:price-amount,discount_source:discount===50?'streak':discount?'referral':'none',
        buyer_snapshot:{name:user.name,email:user.email,phone:user.phone},plan_snapshot:{name:label,account_tier:days===null?'flyinfinity':'flymax',duration_days:days},
        bank_snapshot:bank,subscription_id:null,result_expires_at:null,admin_note:null };
    } else payment = {...payment,status:'pending',confirmed_at:'2026-10-06T00:05:00Z'};
    return {data:{success:true,order:payment,events:[]},error:null};
  },
};
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: auth };
    if (name === '@/features/streak/hooks/use-streak') return { useStreak: () => ({ discountExpiresAt }) };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name === 'next/navigation') return { useRouter: () => ({ push: (route) => routes.push(route) }) };
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map((suffix) => base + suffix).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
const PricingPage = load(resolve(repo, 'src/app/pricing/page.tsx')).default;
const { FLYGO_FEATURES, PREMIUM_FEATURES, FAQ_ITEMS } = load(resolve(repo, 'src/features/subscription/config.ts'));
const { calculateReferralDiscount, calculateSubscriptionDiscount, clampReferralDiscount } = load(resolve(repo, 'src/features/subscription/utils.ts'));
const container = document.getElementById('root');
let root;
const text = (element) => element.textContent.replace(/\s+/g, ' ').trim();
const button = (label, scope = document) => {
  const result = [...scope.querySelectorAll('button')].find((item) => text(item) === label);
  assert.ok(result, `Missing button: ${label}`);
  return result;
};
const click = async (element) => { await React.act(async () => element.click()); };
const mount = async (tier, referral = 0, streak = null) => {
  if (root) await React.act(async () => root.unmount());
  user = tier ? { id: '10000000-0000-4000-8000-000000000002',name:'Đặng Đức Việt',phone:'0901234567',email:'alice@example.test', accountTier: tier, subscriptionExpiresAt: future, referralDiscountPercent: referral } : null;
  discountExpiresAt = streak;
  root = createRoot(container);
  await React.act(async () => root.render(React.createElement(PricingPage)));
};
const closeDialog = async () => { await click(button('Đóng', document.querySelector('[role="dialog"]'))); };

assert.equal(clampReferralDiscount(50), 20, 'Referral cap must not increase');
assert.equal(calculateReferralDiscount(199_000, 50), 39_800);
assert.equal(calculateSubscriptionDiscount(199_000, 50), 99_500);
assert.equal(calculateSubscriptionDiscount(299_000, 100), 149_500, 'Selected discount cannot exceed 50%');
assert.equal(calculateSubscriptionDiscount(199_000, -5), 0);
assert.equal(calculateSubscriptionDiscount(199_000, NaN), 0);
await mount(null);
assert.equal(queries.length, 0, 'Loading prices must not load bank details');
assert.equal(document.querySelector('h1').textContent, 'Gói FlyDo');
assert.equal(document.querySelectorAll('details').length, FAQ_ITEMS.length);
for (const feature of [...FLYGO_FEATURES, ...PREMIUM_FEATURES]) {
  assert.equal([...document.querySelectorAll('li span')].filter((item) => text(item) === feature).length, 1, feature);
}
await click(button('Bắt đầu miễn phí'));
await click(button('Chọn FlyMax'));
await click(button('Chọn FlyInfinity'));
assert.deepEqual(routes, ['/register', '/login', '/login']);
assert.equal(document.querySelector('[role="dialog"]'), null);

await mount('flygo');
assert.ok(button('Gói hiện tại').disabled);
assert.ok(text(document.getElementById('flymax-plan')).includes('199.000đ'));
assert.ok(text(document.getElementById('flyinfinity-plan')).includes('299.000đ'));

await mount('flymax', 15);
assert.ok(button('Đã nâng cấp').disabled);
for (const [label, amount] of [['1 tháng', '29.000đ'], ['3 tháng', '69.000đ'], ['6 tháng', '118.150đ'], ['1 năm', '169.150đ']]) {
  await click(button(label));
  assert.equal(button(label).getAttribute('aria-pressed'), 'true');
  assert.equal(button(label).getAttribute('aria-controls'), 'flymax-plan');
  const card = document.getElementById('flymax-plan');
  assert.ok(text(card).includes(amount));
  assert.ok(text(card).includes(`Thời hạn ${label}`));
  await click(button('Gia hạn FlyMax'));
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(text(dialog).includes(`FlyMax · ${label}`));
  await click(button('Tạo đơn chuyển khoản', dialog));
  assert.ok(text(dialog).includes(amount));
  assert.ok(text(dialog).includes('TEST BANK'));
  assert.ok(text(dialog).includes('DANG DUC VIET 0901234567 FD123456789A'));
  await closeDialog();
}
await click(button('Chọn FlyInfinity'));
let dialog = document.querySelector('[role="dialog"]');
assert.ok(text(dialog).includes('FlyInfinity · Trọn đời'));
await click(button('Tạo đơn chuyển khoản', dialog));
assert.ok(text(dialog).includes('254.150đ'));
await click(dialog.querySelector('[aria-label="Sao chép số tài khoản"]'));
assert.equal(clipboardText, '0123456789');
await click(button('Tôi đã chuyển tiền', dialog));
assert.ok(text(dialog).includes('Chờ kiểm tra'));
assert.ok(dialog.querySelector('a[href*="tab=payments"]'));
await closeDialog();

await mount('flymax', 20, future);
assert.ok(text(document.getElementById('flyinfinity-plan')).includes('149.500đ'));
for (const [label, amount] of [['1 tháng', '29.000đ'], ['3 tháng', '69.000đ'], ['6 tháng', '69.500đ'], ['1 năm', '99.500đ']]) {
  await click(button(label));
  assert.ok(text(document.getElementById('flymax-plan')).includes(amount));
  await click(button('Gia hạn FlyMax'));
  await click(button('Tạo đơn chuyển khoản'));
  assert.ok(text(document.querySelector('[role="dialog"]')).includes(amount));
  await closeDialog();
}
await click(button('Chọn FlyInfinity'));
await click(button('Tạo đơn chuyển khoản'));
assert.ok(text(document.querySelector('[role="dialog"]')).includes('149.500đ'));
await closeDialog();
await mount('flymax', 20, '2000-01-01T00:00:00Z');
assert.ok(text(document.getElementById('flymax-plan')).includes('159.200đ'));

await mount('flyinfinity');
assert.ok(button('Đã sở hữu FlyInfinity').disabled);
assert.ok(button('Gói hiện tại').disabled);
assert.equal(document.querySelector('[role="dialog"]'), null);
await React.act(async () => root.unmount());
dom.window.close();
console.log('PASS: pricing cycles, referral/streak discounts, guest routing, tier actions, shared benefits, server-quoted checkout/copy/confirmation and no live mutations.');
