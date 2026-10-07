// Mounted production LoginForm, Zustand auth store, helpers and UI primitives.
// Only Supabase (the network boundary) is replaced; navigation uses Next's real context.
import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = resolve(process.cwd());
const snapshotArg = process.argv.indexOf('--snapshots');
if (snapshotArg !== -1 && (!process.argv[snapshotArg + 1] || process.argv[snapshotArg + 1].startsWith('--'))) throw Error('--snapshots requires an output directory');
const snapshotDir = snapshotArg === -1 ? null : resolve(process.argv[snapshotArg + 1]);
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3500/login', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.self = dom.window;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const ts = require('typescript');
const intentKey = 'flydo-device-link-intent-v1';
const localKey = 'flydo-device-key-v1';
const profileKey = '10000000-0000-4000-8000-000000000001';
const groupId = '20000000-0000-4000-8000-000000000001';
const code = '30000000-0000-4000-8000-000000000001';
const alice = { id: '40000000-0000-4000-8000-000000000001', email: 'alice@example.test' };
const bob = { id: '40000000-0000-4000-8000-000000000002', email: 'bob@example.test' };
const session = (user = alice, id = 'session-alice') => ({ user, access_token: `header.${Buffer.from(JSON.stringify({ session_id: id })).toString('base64url')}.signature` });
const linked = { data: { active: true, linked: true, device_id: groupId, merged_device: true }, error: null };
const profile = user => ({ id: user.id, name: user === bob ? 'Bob' : 'Alice', account_tier: 'flygo', created_at: '2026-10-07T00:00:00Z' });
let root, cache, store, calls, routes, current, listener, rpcImpl, passwordImpl, oauthImpl;
const network = {
  auth: {
    getSession: async () => ({ data: { session: current }, error: null }),
    getUser: async () => ({ data: { user: current?.user || null }, error: null }),
    onAuthStateChange: cb => { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    signInWithPassword: async args => { calls.push({ name: 'password', args }); return passwordImpl(args); },
    signInWithOAuth: async args => { calls.push({ name: 'oauth', args }); return oauthImpl(args); },
    signOut: async args => {
      calls.push({ name: 'signOut', args });
      if (args.scope !== 'others') { current = null; listener?.('SIGNED_OUT', null); }
      return { error: null };
    },
  },
  rpc: async (name, args) => { calls.push({ name, args }); return rpcImpl(name, args); },
  from: table => {
    assert.equal(table, 'profiles');
    let id;
    const query = { select: () => query, eq: (field, value) => { assert.equal(field, 'id'); id = value; return query; },
      single: async () => ({ data: profile(id === bob.id ? bob : alice), error: null }) };
    return query;
  },
};
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => network };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map(ext => base + ext).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
  return mod.exports;
}
function reset() {
  localStorage.clear(); sessionStorage.clear(); localStorage.setItem(localKey, profileKey);
  window.history.replaceState(null, '', '/login'); cache = new Map(); calls = []; routes = [];
  current = null; listener = null;
  rpcImpl = async name => name === 'redeem_account_device_link' ? linked : { data: { active: true }, error: null };
  passwordImpl = async () => { current = session(); listener?.('SIGNED_IN', current); return { data: { user: alice, session: current }, error: null }; };
  oauthImpl = async () => ({ data: { url: '#google' }, error: null });
  store = load(resolve(repo, 'src/features/auth/stores/auth-store.ts')).useAuthStore;
}
function seedIntent(extra = {}) { sessionStorage.setItem(intentKey, JSON.stringify({ code, ...extra })); }
const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
function button(label) { const el = [...document.querySelectorAll('button')].find(b => text(b) === label); assert.ok(el, `Missing button: ${label}`); return el; }
async function click(el) { await React.act(async () => el.click()); }
async function input(el, value) {
  assert.ok(el, 'Input must be mounted');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(props = {}) {
  const { LoginForm } = load(resolve(repo, 'src/features/auth/components/login-form.tsx'));
  await mountComponent(LoginForm, props);
}
async function mountComponent(Component, props) {
  const router = { push: url => routes.push(url), replace: url => routes.push(url), prefetch: async () => {}, back() {}, forward() {}, refresh() {} };
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(Component, props))));
}
function snapshot(name) {
  if (!snapshotDir) return;
  const clone = document.body.cloneNode(true);
  // Serialize current controlled input values, including read-only codes and consent.
  const originals = document.body.querySelectorAll('input');
  clone.querySelectorAll('input').forEach((el, i) => {
    el.setAttribute('value', originals[i].value);
    if (originals[i].checked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
  });
  clone.querySelectorAll('script').forEach(el => el.remove());
  for (const el of clone.querySelectorAll('*')) for (const attr of [...el.attributes]) {
    if (/^on/i.test(attr.name) || (/^(href|src)$/i.test(attr.name) && /^javascript:/i.test(attr.value))) el.removeAttribute(attr.name);
  }
  clone.classList.add('bg-background', 'text-foreground');
  clone.querySelector('#root')?.classList.add('mx-auto', 'max-w-lg', 'p-5');
  const notice = document.createElement('p'); notice.textContent = 'BẢN XEM THỬ — tài khoản, mã và thiết bị đều là dữ liệu giả.';
  notice.className = 'mx-auto max-w-lg p-4 text-sm text-muted-foreground'; clone.prepend(notice);
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(resolve(snapshotDir, `${name}.html`), `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FlyDo — dữ liệu giả</title></head>${clone.outerHTML}</html>`, 'utf8');
  assert.equal(clone.querySelector('script'), null);
}
async function credentials() { await input(document.getElementById('email'), alice.email); await input(document.getElementById('password'), 'secret123'); }
async function enableLink() { await click(button('Liên kết trình duyệt trên cùng máy')); await input(document.getElementById('device-link-code'), code); }
async function confirmLink() { const checkbox = document.getElementById('device-link-confirm'); assert.ok(checkbox); await click(checkbox); }
const rpcCalls = name => calls.filter(call => call.name === name);
const deferred = () => { let finish; const promise = new Promise(resolve => finish = resolve); return { promise, finish }; };
async function eventually(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.ok(predicate(), 'Expected async auth state to settle');
}
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; await new Promise(resolve => setTimeout(resolve, 10)); });
after(() => dom.window.close());

// Catches opt-in enrollment without an explicit same-machine confirmation.
test('mounted password link requires confirmation, redeems exact profile/session and keeps its local key', async () => {
  reset(); await mount(); await credentials(); await enableLink();
  assert.equal(document.querySelector('label[for="device-link-code"]')?.textContent, 'Mã liên kết');
  assert.match(text(document.body), /không.*phần cứng/i);
  await click(button('Đăng nhập')); assert.equal(rpcCalls('password').length, 0);
  await confirmLink(); snapshot('login-link-mode'); await click(button('Đăng nhập'));
  assert.deepEqual(rpcCalls('redeem_account_device_link')[0]?.args, { p_link_code: code, p_device_key: profileKey, p_device_type: 'computer', p_device_name: 'Trình duyệt · Thiết bị khác', p_session_id: 'session-alice' });
  assert.equal(rpcCalls('register_login_device').length, 0); assert.equal(store.getState().user?.id, alice.id);
  assert.equal(localStorage.getItem(localKey), profileKey); assert.equal(sessionStorage.getItem(intentKey), null);
  assert.deepEqual(routes, ['/home']); assert.ok(!JSON.stringify([...Object.entries(localStorage)]).includes(code));
});

// Catches failed redemption silently creating a quota slot or losing retry inputs.
test('invalid code retains mounted inputs and intent, never enrolls, retry succeeds and limit notice is singular', async () => {
  reset(); await mount({ deviceLimit: true }); await credentials(); await enableLink(); await confirmLink();
  rpcImpl = async () => ({ data: { active: false, reason: 'invalid' }, error: null });
  await click(button('Đăng nhập'));
  assert.equal(store.getState().user, null); assert.match(store.getState().error, /mã.*liên kết/i);
  assert.equal(document.getElementById('email').value, alice.email); assert.equal(document.getElementById('password').value, 'secret123');
  assert.equal(document.getElementById('device-link-code').value, code); assert.ok(sessionStorage.getItem(intentKey));
  assert.equal(document.querySelectorAll('[role="alert"]').length, 1); assert.equal(rpcCalls('register_login_device').length, 0);
  snapshot('login-link-error');
  rpcImpl = async name => name === 'redeem_account_device_link' ? linked : { data: {}, error: null };
  await click(button('Đăng nhập')); assert.equal(store.getState().user?.id, alice.id); assert.equal(sessionStorage.getItem(intentKey), null);
});

for (const failure of [
  { name: 'missing SQL', result: { data: null, error: { code: 'PGRST202', message: `private SQL ${code}` } } },
  { name: 'thrown network', throws: true },
  { name: 'malformed success', result: { data: { active: true }, error: null } },
  { name: 'invalid group UUID', result: { data: { active: true, linked: true, device_id: '-'.repeat(36), merged_device: false }, error: null } },
  ...['expired', 'removed', 'type', 'used', 'capacity'].map(reason => ({ name: reason, result: { data: { active: false, reason }, error: null } })),
]) test(`link ${failure.name} fails closed with safe message and retry intent`, async () => {
  reset(); seedIntent(); rpcImpl = async () => { if (failure.throws) throw Error(`private network ${code}`); return failure.result; };
  assert.equal(await store.getState().login(alice.email, 'secret123'), false);
  assert.equal(store.getState().user, null); assert.ok(store.getState().error); assert.ok(!store.getState().error.includes(code));
  assert.ok(sessionStorage.getItem(intentKey)); assert.equal(rpcCalls('register_login_device').length, 0); assert.equal(rpcCalls('register_current_session').length, 0);
});

// Catches OAuth's intent being put in the URL or lost during fresh-page initialization.
test('mounted Google link survives redirect in tab storage and fresh init redeems before registration', async () => {
  reset(); await mount(); await enableLink();
  await click(button('Tiếp tục với Google')); assert.equal(rpcCalls('oauth').length, 0);
  await confirmLink(); await click(button('Tiếp tục với Google'));
  assert.ok(sessionStorage.getItem(intentKey)); assert.ok(!JSON.stringify(rpcCalls('oauth')).includes(code));
  await React.act(async () => root.unmount()); root = null;
  cache = new Map(); current = session(); window.history.replaceState(null, '', '/home?device_oauth=1');
  store = load(resolve(repo, 'src/features/auth/stores/auth-store.ts')).useAuthStore;
  await store.getState().initAuth();
  assert.equal(rpcCalls('redeem_account_device_link').length, 1); assert.equal(rpcCalls('register_login_device').length, 0);
  assert.equal(store.getState().user?.id, alice.id); assert.equal(sessionStorage.getItem(intentKey), null);
  assert.equal(localStorage.getItem(localKey), profileKey); assert.equal(window.location.search, '');
});

test('OAuth init failure preserves code and renders retry fields with one safe alert', async () => {
  reset(); seedIntent(); current = session(); rpcImpl = async () => ({ data: { active: false, reason: 'expired' }, error: null });
  await store.getState().initAuth(); await mount({ deviceSetup: true });
  assert.equal(store.getState().user, null); assert.ok(store.getState().initialized);
  assert.equal(document.getElementById('device-link-code')?.value, code); assert.equal(document.querySelectorAll('[role="alert"]').length, 1);
  assert.equal(rpcCalls('register_login_device').length, 0); assert.ok(sessionStorage.getItem(intentKey));
});

// Catches retained intent accidentally contaminating normal login or logout.
test('explicit normal mode clears intent and uses the existing normal registration', async () => {
  reset(); await mount(); await credentials(); await enableLink(); await confirmLink();
  await click(button('Đăng nhập thông thường')); assert.equal(sessionStorage.getItem(intentKey), null);
  await click(button('Đăng nhập')); assert.equal(rpcCalls('redeem_account_device_link').length, 0);
  assert.equal(rpcCalls('register_login_device').length, 1); assert.equal(store.getState().user?.id, alice.id);
});
test('logout and logout-all clear tab intent without replacing the browser profile key', async () => {
  reset(); seedIntent(); current = session(); await store.getState().logout(); assert.equal(sessionStorage.getItem(intentKey), null);
  seedIntent(); current = session(); await store.getState().logoutAllDevices(); assert.equal(sessionStorage.getItem(intentKey), null);
  assert.equal(localStorage.getItem(localKey), profileKey);
});
test('choosing another account explicitly clears link intent', async () => {
  reset(); localStorage.setItem('flydo-remembered-accounts-v1', JSON.stringify([{ ...alice, name: 'Alice', lastUsedAt: '2026-10-07' }]));
  store.setState({ initialized: true }); await mount(); await enableLink(); await confirmLink();
  await click(button('Đăng nhập bằng tài khoản khác')); assert.equal(sessionStorage.getItem(intentKey), null);
});

// Catches stale redemption signing out/updating a new identity, or clearing its new intent.
test('late successful redeem after logout cannot publish user or clear a newer intent', async () => {
  reset(); seedIntent(); const pending = deferred(); rpcImpl = async name => name === 'redeem_account_device_link' ? pending.promise : { data: {}, error: null };
  const login = store.getState().login(alice.email, 'secret123'); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(rpcCalls('redeem_account_device_link').length, 1);
  await store.getState().logout(); seedIntent({ code: '30000000-0000-4000-8000-000000000002' });
  pending.finish(linked); assert.equal(await login, false); assert.equal(store.getState().user, null);
  assert.equal(JSON.parse(sessionStorage.getItem(intentKey)).code, '30000000-0000-4000-8000-000000000002');
  assert.equal(localStorage.getItem('flydo-remembered-accounts-v1'), null);
});
test('late failed redeem after a second login cannot sign out or replace the second account', async () => {
  reset(); seedIntent(); const pending = deferred(); rpcImpl = async name => name === 'redeem_account_device_link' ? pending.promise : { data: { active: true }, error: null };
  const login = store.getState().login(alice.email, 'secret123'); await new Promise(resolve => setTimeout(resolve, 0));
  load(resolve(repo, 'src/lib/auth/device-link.ts')).clearDeviceLinkIntent();
  passwordImpl = async () => { current = session(bob, 'session-bob'); return { data: { user: bob, session: current }, error: null }; };
  assert.equal(await store.getState().login(bob.email, 'secret123'), true);
  const outs = rpcCalls('signOut').length; pending.finish({ data: { active: false, reason: 'invalid' }, error: null });
  assert.equal(await login, false); assert.equal(store.getState().user?.id, bob.id); assert.equal(rpcCalls('signOut').length, outs); assert.equal(store.getState().error, null);
});
test('bound intent rejects an account identity switch and never falls into enrollment', async () => {
  reset(); seedIntent({ accountId: alice.id }); current = session(bob, 'session-bob');
  await store.getState().initAuth(); assert.equal(sessionStorage.getItem(intentKey), null);
  assert.equal(rpcCalls('redeem_account_device_link').length, 0); assert.equal(rpcCalls('register_login_device').length, 0);
  assert.equal(store.getState().user, null);
});
test('SIGNED_IN identity switch isolates an in-flight init redemption', async () => {
  reset(); seedIntent(); current = session(); const pending = deferred();
  rpcImpl = async name => name === 'redeem_account_device_link' ? pending.promise : { data: { active: true }, error: null };
  const init = store.getState().initAuth(); await new Promise(resolve => setTimeout(resolve, 0));
  current = session(bob, 'session-bob'); listener('SIGNED_IN', current); await new Promise(resolve => setTimeout(resolve, 20));
  pending.finish(linked); await init; assert.equal(store.getState().user?.id, bob.id);
  assert.equal(store.getState().initialized, true);
  assert.equal(sessionStorage.getItem(intentKey), null);
  assert.ok(!localStorage.getItem('flydo-remembered-accounts-v1')?.includes(alice.email));
});

// Catches init/listener duplicate races and client-side group-wide revocation.
test('init plus same-session listener shares redemption; refresh/check uses the alias key and keeps group sessions', async () => {
  reset(); seedIntent(); current = session(); const pending = deferred();
  rpcImpl = async name => name === 'redeem_account_device_link' ? pending.promise : { data: { active: true }, error: null };
  const init = store.getState().initAuth(); await new Promise(resolve => setTimeout(resolve, 0)); listener('SIGNED_IN', current);
  await new Promise(resolve => setTimeout(resolve, 20)); pending.finish(linked); await init; await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(rpcCalls('redeem_account_device_link').length, 1); assert.equal(rpcCalls('register_login_device').length, 0);
  assert.equal(await store.getState().checkActiveSession(), true);
  assert.deepEqual(rpcCalls('check_registered_device').at(-1).args, { p_device_key: profileKey, p_session_id: 'session-alice' });
  assert.equal(rpcCalls('signOut').length, 0); assert.equal(localStorage.getItem(localKey), profileKey);
});

test('normal login still falls back to the old SQL only when no link was requested', async () => {
  reset(); rpcImpl = async name => name === 'register_login_device' ? { data: null, error: { code: 'PGRST202', message: 'missing' } } : { data: { active: true }, error: null };
  assert.equal(await store.getState().login(alice.email, 'secret123'), true);
  assert.equal(rpcCalls('register_current_session').length, 1); assert.equal(rpcCalls('redeem_account_device_link').length, 0);
});

// Catches a cached normal registration bypassing a later explicit link request.
test('an already active browser can opt in to merge its group on the same session', async () => {
  reset(); current = session(); await store.getState().initAuth();
  seedIntent(); assert.equal(await store.getState().login(alice.email, 'secret123'), true);
  assert.equal(rpcCalls('redeem_account_device_link').length, 1); assert.equal(localStorage.getItem(localKey), profileKey);
});
test('refreshUser cannot publish an account while link redemption is pending or failed', async () => {
  reset(); seedIntent(); current = session(); const pending = deferred();
  rpcImpl = async name => name === 'redeem_account_device_link' ? pending.promise : { data: {}, error: null };
  const init = store.getState().initAuth(); await new Promise(resolve => setTimeout(resolve, 0));
  const refresh = store.getState().refreshUser(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(store.getState().user, null);
  pending.finish({ data: { active: false, reason: 'invalid' }, error: null }); await init; await refresh;
  assert.equal(store.getState().user, null);
});
test('late logout release cannot sign out a newly logged-in account', async () => {
  reset(); current = session(); const release = deferred();
  rpcImpl = async name => name === 'release_device_session' ? release.promise : { data: { active: true }, error: null };
  const logout = store.getState().logout(); await new Promise(resolve => setTimeout(resolve, 0));
  passwordImpl = async () => { current = session(bob, 'session-bob'); return { data: { user: bob, session: current }, error: null }; };
  assert.equal(await store.getState().login(bob.email, 'secret123'), true);
  release.finish({ data: {}, error: null }); await logout;
  assert.equal(store.getState().user?.id, bob.id); assert.equal(current?.user.id, bob.id);
});
test('empty or malformed tab intent never enrolls a new slot', async () => {
  reset(); seedIntent({ code: '' }); assert.equal(await store.getState().login(alice.email, 'secret123'), false);
  assert.equal(rpcCalls('register_login_device').length, 0); assert.equal(rpcCalls('redeem_account_device_link').length, 0);
  reset(); sessionStorage.setItem(intentKey, '{broken'); assert.equal(await store.getState().login(alice.email, 'secret123'), false);
  assert.equal(rpcCalls('register_login_device').length, 0);
});

test('unavailable sessionStorage alone does not turn normal password login into linking', async () => {
  reset(); const original = dom.window.Storage.prototype.getItem;
  dom.window.Storage.prototype.getItem = function (key) { if (this === sessionStorage) throw Error('tab storage blocked'); return original.call(this, key); };
  try {
    assert.equal(await store.getState().login(alice.email, 'secret123'), true);
    assert.equal(rpcCalls('redeem_account_device_link').length, 0); assert.equal(rpcCalls('register_login_device').length, 1);
    assert.equal(store.getState().user?.id, alice.id);
  } finally { dom.window.Storage.prototype.getItem = original; }
});
test('an explicit in-memory link intent still fails closed when tab storage becomes unavailable', async () => {
  reset(); load(resolve(repo, 'src/lib/auth/device-link.ts')).setDeviceLinkIntent(code);
  const originalGet = dom.window.Storage.prototype.getItem; const originalSet = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.getItem = function (key) { if (this === sessionStorage) throw Error('blocked'); return originalGet.call(this, key); };
  dom.window.Storage.prototype.setItem = function (key, value) { if (this === sessionStorage) throw Error('blocked'); return originalSet.call(this, key, value); };
  try {
    assert.equal(await store.getState().login(alice.email, 'secret123'), false);
    assert.equal(rpcCalls('register_login_device').length, 0); assert.ok(store.getState().error);
  } finally { dom.window.Storage.prototype.getItem = originalGet; dom.window.Storage.prototype.setItem = originalSet; }
});

// Reviewer P2: loading must suppress only the explicit attempt's own auth event.
for (const result of ['invalid', 'success']) test(`review P2 external SIGNED_IN during password linking ignores late ${result} Alice result`, async () => {
  reset(); await store.getState().initAuth(); seedIntent(); const redemption = deferred();
  rpcImpl = async name => name === 'redeem_account_device_link' ? redemption.promise : { data: { active: true }, error: null };
  const login = store.getState().login(alice.email, 'secret123');
  await eventually(() => rpcCalls('redeem_account_device_link').length === 1);
  assert.equal(store.getState().isLoading, true);
  current = session(bob, 'session-bob'); listener('SIGNED_IN', current);
  redemption.finish(result === 'success' ? linked : { data: { active: false, reason: 'invalid' }, error: null });
  const accepted = await login;
  assert.equal(rpcCalls('signOut').length, 0); assert.equal(accepted, false); assert.equal(current?.user.id, bob.id);
  await eventually(() => store.getState().user?.id === bob.id);
  assert.equal(store.getState().isLoading, false); assert.equal(store.getState().error, null);
  assert.equal(sessionStorage.getItem(intentKey), null);
  assert.ok(!localStorage.getItem('flydo-remembered-accounts-v1')?.includes(alice.email));
});
test('review control own password SIGNED_IN keeps one link redemption and retains failed intent', async () => {
  reset(); await store.getState().initAuth(); seedIntent(); const redemption = deferred();
  rpcImpl = async name => name === 'redeem_account_device_link' ? redemption.promise : { data: { active: true }, error: null };
  const login = store.getState().login(alice.email, 'secret123'); await eventually(() => rpcCalls('redeem_account_device_link').length === 1);
  listener('SIGNED_IN', current); redemption.finish({ data: { active: false, reason: 'invalid' }, error: null });
  assert.equal(await login, false); assert.equal(rpcCalls('redeem_account_device_link').length, 1);
  assert.equal(rpcCalls('register_login_device').length, 0); assert.ok(sessionStorage.getItem(intentKey));
  assert.equal(store.getState().isLoading, false); assert.match(store.getState().error, /mã.*liên kết/i);
});
for (const result of ['invalid', 'success']) test(`review P2 link ${result} revalidates live account/session without an auth event`, async () => {
  reset(); seedIntent(); const redemption = deferred();
  rpcImpl = async name => name === 'redeem_account_device_link' ? redemption.promise : { data: { active: true }, error: null };
  const login = store.getState().login(alice.email, 'secret123'); await eventually(() => rpcCalls('redeem_account_device_link').length === 1);
  current = session(bob, 'session-bob');
  redemption.finish(result === 'success' ? linked : { data: { active: false, reason: 'invalid' }, error: null });
  const accepted = await login;
  assert.equal(rpcCalls('signOut').length, 0); assert.equal(accepted, false); assert.equal(current?.user.id, bob.id);
  assert.equal(store.getState().user, null); assert.equal(store.getState().isLoading, false);
  assert.equal(localStorage.getItem('flydo-remembered-accounts-v1'), null);
});

// Reviewer P2: neither direct nor legacy check responses may revoke a newer session.
for (const origin of ['init', 'listener']) test(`review P2 ${origin} link failure revalidates session before internal signOut`, async () => {
  reset(); const redemption = deferred();
  rpcImpl = async name => name === 'redeem_account_device_link' ? redemption.promise : { data: { active: true }, error: null };
  let init;
  if (origin === 'init') { seedIntent(); current = session(); init = store.getState().initAuth(); }
  else { await store.getState().initAuth(); seedIntent(); current = session(); listener('SIGNED_IN', current); }
  await eventually(() => rpcCalls('redeem_account_device_link').length === 1);
  current = session(bob, 'session-bob'); redemption.finish({ data: { active: false, reason: 'invalid' }, error: null });
  if (init) await init; else await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(rpcCalls('signOut').length, 0); assert.equal(current?.user.id, bob.id);
  assert.equal(store.getState().user, null); assert.equal(localStorage.getItem('flydo-remembered-accounts-v1'), null);
});
for (const result of ['inactive', 'missing RPC', 'legacy inactive']) test(`review P2 old device check ${result} cannot sign out Bob after login`, async () => {
  reset(); assert.equal(await store.getState().login(alice.email, 'secret123'), true);
  const checked = deferred(); const legacy = deferred();
  rpcImpl = async name => name === 'check_registered_device' ? checked.promise
    : name === 'register_current_session' ? legacy.promise : { data: { active: true }, error: null };
  const check = store.getState().checkActiveSession(); await eventually(() => rpcCalls('check_registered_device').length === 1);
  if (result === 'legacy inactive') {
    checked.finish({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await eventually(() => rpcCalls('register_current_session').length === 1);
  }
  passwordImpl = async () => { current = session(bob, 'session-bob'); return { data: { user: bob, session: current }, error: null }; };
  assert.equal(await store.getState().login(bob.email, 'secret123'), true);
  if (result === 'legacy inactive') legacy.finish({ data: { active: false }, error: null });
  else checked.finish(result === 'inactive' ? { data: { active: false }, error: null } : { data: null, error: { code: 'PGRST202', message: 'missing' } });
  // Resolve the fixture defensively so a buggy legacy fallthrough cannot hang RED.
  if (result === 'missing RPC') legacy.finish({ data: { active: false }, error: null });
  assert.equal(await check, true); assert.equal(rpcCalls('signOut').length, 0);
  assert.equal(current?.user.id, bob.id); assert.equal(store.getState().user?.id, bob.id);
  if (result !== 'legacy inactive') assert.equal(rpcCalls('register_current_session').length, 0);
});
for (const result of ['inactive', 'missing RPC']) test(`review P2 device check ${result} revalidates same-account replacement session`, async () => {
  reset(); assert.equal(await store.getState().login(alice.email, 'secret123'), true); const checked = deferred();
  rpcImpl = async name => name === 'check_registered_device' ? checked.promise : { data: { active: false }, error: null };
  const check = store.getState().checkActiveSession(); await eventually(() => rpcCalls('check_registered_device').length === 1);
  current = session(alice, 'session-alice-new');
  checked.finish(result === 'inactive' ? { data: { active: false }, error: null } : { data: null, error: { code: 'PGRST202', message: 'missing' } });
  assert.equal(await check, true); assert.equal(rpcCalls('signOut').length, 0);
  assert.equal(rpcCalls('register_current_session').length, 0); assert.equal(current?.user.id, alice.id);
});

if (snapshotDir) test('export real mounted account code and redeem confirmation with fake network fixtures', async () => {
  reset(); current = session(); const serverNow = new Date().toISOString();
  const devices = [{ id: groupId, device_key: profileKey, device_name: 'Chrome · Windows (giả lập)', device_type: 'computer',
    session_id: 'session-alice', first_seen_at: serverNow, last_login_at: serverNow, is_current: true, profile_count: 2 }];
  rpcImpl = async name => {
    if (name === 'get_my_account_devices') return { data: { devices, remaining: 2, server_now: serverNow }, error: null };
    if (name === 'create_account_device_link') return { data: { code, expires_at: new Date(Date.now() + 300_000).toISOString(), server_now: serverNow, device_name: devices[0].device_name, device_type: 'computer' }, error: null };
    if (name === 'cancel_account_device_link') return { data: { cancelled: true }, error: null };
    throw Error('Unexpected snapshot network call: ' + name);
  };
  const { AccountDevices } = load(resolve(repo, 'src/features/auth/components/account-devices.tsx'));
  await mountComponent(AccountDevices, { userId: alice.id });
  await click(button('Tạo mã liên kết')); snapshot('create-code-confirmation');
  await click(button('Xác nhận tạo mã')); assert.equal(document.getElementById('issued-device-link')?.value, code);
  snapshot('create-code');
  await input(document.getElementById('pasted-device-link'), code); await click(button('Liên kết profile'));
  assert.ok(document.querySelector('[role="alertdialog"]')); snapshot('redeem-confirmation');
});
