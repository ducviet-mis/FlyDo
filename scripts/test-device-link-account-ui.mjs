// Mount the real component, Radix, identity helpers and Supabase client. Only network/clipboard I/O is isolated.
import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import { readFileSync, existsSync, mkdtempSync, rmSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(process.cwd());
// Usage: node scripts/test-device-link-account-ui.mjs --snapshots <output-dir>
// Main can attach the built CSS to these script-free documents for Chrome QA.
const snapshotFlag = process.argv.indexOf('--snapshots');
if (snapshotFlag >= 0 && (!process.argv[snapshotFlag + 1] || process.argv[snapshotFlag + 1].startsWith('--'))) throw Error('--snapshots requires an output directory');
const snapshotDir = snapshotFlag >= 0 ? resolve(process.argv[snapshotFlag + 1]) : null;
const savedSnapshots = new Set();
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/profile', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://device-ui-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only-anonymous-key';
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
const uid = '10000000-0000-4000-8000-000000000001';
const otherUid = '10000000-0000-4000-8000-000000000002';
const key = '20000000-0000-4000-8000-000000000001';
const sid = '30000000-0000-4000-8000-000000000001';
const code = '40000000-0000-4000-8000-000000000001';
const rootKey = '20000000-0000-4000-8000-000000000009';
const device = { id: rootKey, device_key: rootKey, device_name: 'Máy tính đã liên kết', device_type: 'computer', session_id: 'root-session', first_seen_at: '2026-10-01T00:00:00Z', last_login_at: '2026-10-07T00:00:00Z', is_current: true, profile_count: 3 };
let accountId = uid, calls = [], rpcImpl, legacyImpl, copyError = false, copied = '', root;
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  assert.equal(url.hostname, 'device-ui-test.supabase.co', 'Never reach a live service');
  if (url.pathname === '/auth/v1/user') return response({ id: accountId, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  const name = url.pathname.split('/').at(-1);
  const args = init.body ? JSON.parse(init.body) : null;
  calls.push({ name, args, query: url.searchParams, method: init.method || 'GET' });
  return url.pathname.includes('/rpc/') ? rpcImpl(name, args) : legacyImpl(name, url.searchParams);
};
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { if (copyError) throw Error('blocked'); copied = value; } } });
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map(s => base + s).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const { AccountDevices } = load(resolve(repo, 'src/features/auth/components/account-devices.tsx'));
const { getSupabaseClient } = load(resolve(repo, 'src/lib/supabase/client.ts'));
const text = (el = document.body) => el.textContent.replace(/\s+/g, ' ').trim();
const button = label => {
  const el = [...document.querySelectorAll('button')].find(b => text(b) === label || b.getAttribute('aria-label') === label);
  assert.ok(el, `Missing button: ${label}`); return el;
};
const input = label => {
  const el = [...document.querySelectorAll('input')].find(i => i.getAttribute('aria-label') === label || document.querySelector(`label[for="${i.id}"]`)?.textContent === label);
  assert.ok(el, `Missing input: ${label}`); return el;
};
async function click(el) { await React.act(async () => el.click()); }
async function type(el, value) { await React.act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function session(id = uid) {
  accountId = id;
  const payload = Buffer.from(JSON.stringify({ sub: id, session_id: sid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const result = await getSupabaseClient().auth.setSession({ access_token: `${header}.${payload}.c2lnbmF0dXJl`, refresh_token: 'test-only-refresh' });
  assert.equal(result.error, null);
  getSupabaseClient().auth.stopAutoRefresh();
}
function reset() {
  calls = []; copied = ''; copyError = false;
  window.localStorage.clear(); window.localStorage.setItem('flydo-device-key-v1', key);
  rpcImpl = async name => {
    if (name === 'get_my_account_devices') return response({ devices: [device], remaining: 2 });
    if (name === 'create_account_device_link') return response({ code, expires_at: new Date(Date.now() + 300000).toISOString(), server_now: new Date().toISOString(), device_name: device.device_name, device_type: 'computer' });
    if (name === 'cancel_account_device_link') return response({ cancelled: true });
    if (name === 'redeem_account_device_link') return response({ active: true, linked: true, device_id: rootKey, merged_device: true });
    if (name === 'remove_account_device') return response({ removed: true });
    throw Error(`Unexpected RPC: ${name}`);
  };
  legacyImpl = async name => name === 'account_devices' ? response([{ ...device, device_key: key, session_id: sid, is_current: undefined, profile_count: undefined }]) : response({ removal_count: 0 });
}
async function mount() {
  reset(); await session(); root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(AccountDevices, { userId: uid })));
}
async function create() { await click(button('Tạo mã liên kết')); assert.ok(document.querySelector('[role="alertdialog"]')); await click(button('Xác nhận tạo mã')); }
async function redeem() { await type(input('Mã từ profile khác'), code); await click(button('Liên kết profile')); assert.ok(document.querySelector('[role="alertdialog"]')); }
const count = name => calls.filter(c => c.name === name).length;
function snapshot(name) {
  if (!snapshotDir || savedSnapshots.has(name)) return;
  const body = document.body.cloneNode(true);
  body.setAttribute('data-fake-fixtures', 'FlyDo UI test only; synthetic accounts and UUIDs');
  body.querySelectorAll('script,iframe,object,embed').forEach(el => el.remove());
  body.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) if (/^on/i.test(attr.name) || /^(javascript|data):/i.test(attr.value)) el.removeAttribute(attr.name);
  });
  // DOM serialization otherwise loses React's current input values.
  [...document.querySelectorAll('input')].forEach((el, i) => body.querySelectorAll('input')[i].setAttribute('value', el.value));
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(join(snapshotDir, `${name}.html`), `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FlyDo — UI test, dữ liệu giả</title></head>${body.outerHTML}</html>`, 'utf8');
  savedSnapshots.add(name);
}
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; getSupabaseClient().auth.stopAutoRefresh(); });
after(() => { getSupabaseClient().auth.broadcastChannel?.close(); dom.window.close(); });

test('RPC aliases mark current group and count profiles without exposing root key or offering its removal', async () => {
  await mount(); snapshot('link-login-mode'); assert.equal(count('get_my_account_devices'), 1); assert.equal(count('account_devices'), 0);
  assert.deepEqual(calls[0].args, { p_device_key: key });
  assert.match(text(), /Thiết bị này/); assert.match(text(), /3 profile/);
  assert.equal(document.querySelector('[aria-label="Xóa thiết bị Máy tính đã liên kết"]'), null);
  assert.equal(window.localStorage.getItem('flydo-device-key-v1'), key);
});
test('create requires confirmation, copies selectable code, gives actionable copy failure and cancels on close', async () => {
  await mount(); await click(button('Tạo mã liên kết')); assert.equal(count('create_account_device_link'), 0);
  assert.match(text(document.querySelector('[role="alertdialog"]')), /cùng thiết bị vật lý/);
  await click(button('Xác nhận tạo mã'));
  snapshot('create-code');
  assert.equal(input('Mã liên kết đã tạo').value, code); assert.ok(input('Mã liên kết đã tạo').readOnly);
  assert.ok(document.querySelector('time[datetime]')); assert.match(text(), /5 phút/);
  await click(button('Sao chép mã')); assert.equal(copied, code);
  copyError = true; await click(button('Sao chép mã')); assert.match(text(), /chọn mã.*sao chép/i);
  assert.ok(document.activeElement === input('Mã liên kết đã tạo'));
  assert.equal(input('Mã liên kết đã tạo').selectionEnd, 36);
  await click(button('Hủy mã và đóng')); assert.equal(count('cancel_account_device_link'), 1);
  assert.deepEqual(calls.find(c => c.name === 'cancel_account_device_link').args, { p_link_code: code });
  assert.ok(!document.querySelector('input[readonly]')); assert.ok(!text().includes(code));
});
test('expiry uses server clock even with a skewed client, disables copying and permits replacement', async () => {
  await mount(); const original = rpcImpl;
  rpcImpl = async (name, args) => name === 'create_account_device_link' ? response({ code, server_now: '2020-01-01T00:00:00Z', expires_at: '2020-01-01T00:00:01Z', device_name: 'Máy tính', device_type: 'computer' }) : original(name, args);
  await create(); assert.equal(button('Sao chép mã').disabled, false);
  await React.act(async () => { await new Promise(r => setTimeout(r, 1150)); });
  assert.match(text(), /Mã đã hết hạn/); assert.ok(button('Sao chép mã').disabled);
  assert.equal(button('Tạo mã mới').disabled, false);
});
test('redeem merges existing group only after confirmation, reloads aliases and preserves lifetime quota/key', async () => {
  await mount(); await redeem(); snapshot('redeem-confirmation'); assert.equal(count('redeem_account_device_link'), 0);
  assert.match(text(document.querySelector('[role="alertdialog"]')), /không.*chứng minh.*phần cứng/i);
  await click(button('Xác nhận liên kết'));
  assert.deepEqual(calls.find(c => c.name === 'redeem_account_device_link').args, { p_link_code: code, p_device_key: key, p_device_type: 'computer', p_device_name: 'Trình duyệt · Thiết bị khác', p_session_id: sid });
  assert.equal(count('get_my_account_devices'), 2); assert.equal(count('remove_account_device'), 0);
  assert.match(text(), /2\/2 lượt/); assert.match(text(), /Đã liên kết/); assert.equal(input('Mã từ profile khác').value, '');
  assert.equal(window.localStorage.getItem('flydo-device-key-v1'), key);
  assert.ok(!document.body.innerHTML.includes(code));
});
for (const reason of ['invalid', 'expired', 'removed', 'type', 'used', 'capacity', 'network', 'missing']) {
  test(`redeem ${reason} retains input with actionable error and never enrolls a new group`, async () => {
    await mount(); const original = rpcImpl;
    rpcImpl = async (name, args) => name === 'redeem_account_device_link' ? reason === 'network' ? response({ message: code }, 500) : reason === 'missing' ? response({ code: 'PGRST202', message: code }, 404) : response({ active: false, reason }) : original(name, args);
    await redeem(); await click(button('Xác nhận liên kết'));
    assert.equal(input('Mã từ profile khác').value, code); assert.ok(document.querySelector('[role="alert"]'));
    if (reason === 'capacity') assert.match(text(document.querySelector('[role="alert"]')), /20 profile/);
    assert.ok(!text().includes(code)); assert.equal(count('register_account_device'), 0); assert.equal(count('remove_account_device'), 0);
  });
}
test('pending create/redeem cannot be duplicated; no raw network errors reach the UI', async () => {
  await mount(); let finish; const original = rpcImpl;
  rpcImpl = (name, args) => name === 'create_account_device_link' ? new Promise(r => { finish = r; }) : original(name, args);
  await click(button('Tạo mã liên kết')); const confirm = button('Xác nhận tạo mã'); await click(confirm); await click(confirm);
  assert.equal(count('create_account_device_link'), 1); assert.ok(confirm.disabled);
  await React.act(async () => finish(response({ code, expires_at: new Date(Date.now() + 300000).toISOString(), device_name: 'Máy tính', device_type: 'computer' })));
  await click(button('Hủy mã và đóng'));
  rpcImpl = (name, args) => name === 'redeem_account_device_link' ? new Promise(r => { finish = r; }) : original(name, args);
  await redeem(); const link = button('Xác nhận liên kết'); await click(link); await click(link);
  assert.equal(count('redeem_account_device_link'), 1); assert.ok(link.disabled);
  await React.act(async () => finish(response({ active: false, reason: 'used' })));
  assert.equal(input('Mã từ profile khác').value, code);
});
test('account switch clears issued code immediately and ignores stale create and list responses', async () => {
  await mount(); await create(); await React.act(async () => { await session(otherUid); root.render(React.createElement(AccountDevices, { userId: otherUid })); });
  assert.ok(!document.querySelector('input[readonly]')); assert.ok(!text().includes(code));
  await React.act(async () => { await session(); root.render(React.createElement(AccountDevices, { userId: uid })); });
  let finish; const original = rpcImpl;
  rpcImpl = (name, args) => name === 'create_account_device_link' ? new Promise(r => { finish = r; }) : original(name, args);
  await create(); await React.act(async () => { await session(otherUid); root.render(React.createElement(AccountDevices, { userId: otherUid })); });
  await React.act(async () => finish(response({ code, expires_at: new Date(Date.now() + 300000).toISOString(), device_name: 'OLD OWNER', device_type: 'computer' })));
  assert.ok(!document.querySelector('input[readonly]')); assert.ok(!text().includes('OLD OWNER'));
  rpcImpl = name => name === 'get_my_account_devices' ? new Promise(r => { finish = r; }) : original(name);
  await click(button('Làm mới danh sách thiết bị'));
  rpcImpl = original; await React.act(async () => { await session(); root.render(React.createElement(AccountDevices, { userId: uid })); });
  await React.act(async () => finish(response({ devices: [{ ...device, device_name: 'STALE LIST' }], remaining: 0 })));
  assert.ok(!text().includes('STALE LIST')); assert.match(text(), /2\/2 lượt/);
});
test('late redeem completion cannot reset another account or show success', async () => {
  await mount(); let finish; const original = rpcImpl;
  rpcImpl = (name, args) => name === 'redeem_account_device_link' ? new Promise(r => { finish = r; }) : original(name, args);
  await redeem(); await click(button('Xác nhận liên kết'));
  await React.act(async () => { await session(otherUid); root.render(React.createElement(AccountDevices, { userId: otherUid })); });
  await React.act(async () => finish(response({ active: true, linked: true, device_id: rootKey, merged_device: true })));
  assert.ok(!text().includes('Đã liên kết')); assert.equal(input('Mã từ profile khác').value, '');
});

test('confirmation has accessible title/description, starts on cancel and restores paste focus on failure', async () => {
  await mount(); await redeem();
  const dialog = document.querySelector('[role="alertdialog"]');
  assert.ok(document.getElementById(dialog.getAttribute('aria-labelledby')));
  assert.ok(document.getElementById(dialog.getAttribute('aria-describedby')));
  assert.ok(document.activeElement === button('Quay lại'));
  const original = rpcImpl;
  rpcImpl = (name, args) => name === 'redeem_account_device_link' ? response({ active: false, reason: 'invalid' }) : original(name, args);
  await click(button('Xác nhận liên kết'));
  assert.ok(document.activeElement === input('Mã từ profile khác'), 'Return focus to the pasted code after a failed redeem');
});

test('create failure/missing SQL does not expose response data and preserves normal device management', async () => {
  await mount(); const original = rpcImpl;
  rpcImpl = (name, args) => name === 'create_account_device_link' ? response({ code: 'PGRST202', message: code }, 404) : original(name, args);
  await create(); assert.ok(!document.querySelector('input[readonly]')); assert.ok(!text().includes(code));
  assert.match(text(), /chưa.*sẵn sàng/i); assert.match(text(), /2\/2 lượt/); assert.match(text(), /Thiết bị này/);
  assert.ok(button('Tạo mã liên kết').disabled);
});

test('cancel failure clears local code, reports uncertain revocation, locks duplicates and lets user replace it', async () => {
  await mount(); await create(); let finish; const original = rpcImpl;
  rpcImpl = (name, args) => name === 'cancel_account_device_link' ? new Promise(r => { finish = r; }) : original(name, args);
  const close = button('Hủy mã và đóng'); await click(close); await click(close);
  assert.ok(!document.querySelector('input[readonly]')); assert.equal(count('cancel_account_device_link'), 1);
  assert.ok(button('Tạo mã liên kết').disabled);
  await React.act(async () => finish(response({ message: code }, 500)));
  assert.match(text(document.querySelector('[role="alert"]')), /có thể vẫn dùng được/);
  assert.ok(!text().includes(code)); assert.equal(button('Tạo mã liên kết').disabled, false);
});

test('invalid pasted format stays editable and never makes a network mutation', async () => {
  await mount(); await type(input('Mã từ profile khác'), 'https://do-not-follow.invalid/secret');
  await click(button('Liên kết profile')); assert.equal(count('redeem_account_device_link'), 0);
  assert.equal(input('Mã từ profile khác').value, 'https://do-not-follow.invalid/secret');
  assert.ok(document.querySelector('[role="alert"]')); assert.equal(document.querySelector('[role="alertdialog"]'), null);
});

test('auth switch without a prop update hides issued code and stale cancel messages', async () => {
  await mount(); await create(); let finish; const original = rpcImpl;
  rpcImpl = (name, args) => name === 'cancel_account_device_link' ? new Promise(r => { finish = r; }) : original(name, args);
  await click(button('Hủy mã và đóng'));
  await React.act(async () => session(otherUid));
  assert.equal(document.querySelector('input'), null);
  await React.act(async () => finish(response({ message: code }, 500)));
  assert.equal(document.querySelector('[role="alert"]'), null); assert.ok(!text().includes(code));
});

test('unmount cancels an unused code; a late issued response is never rendered', async () => {
  await mount(); await create(); await React.act(async () => root.unmount()); root = null;
  assert.equal(count('cancel_account_device_link'), 1); assert.equal(document.querySelector('input'), null);
  await mount(); let finish; const original = rpcImpl;
  rpcImpl = (name, args) => name === 'create_account_device_link' ? new Promise(r => { finish = r; }) : original(name, args);
  await create(); await React.act(async () => root.unmount()); root = null;
  await React.act(async () => finish(response({ code, expires_at: new Date(Date.now() + 300000).toISOString(), device_name: 'STALE', device_type: 'computer' })));
  assert.equal(document.querySelector('input'), null); assert.equal(count('cancel_account_device_link'), 1);
});

test('late group removal cannot close the new account dialog or consume its displayed quota', async () => {
  await mount(); let finish; const original = rpcImpl;
  rpcImpl = (name, args) => name === 'get_my_account_devices' ? response({ devices: [device, { ...device, id: key, device_name: 'Máy phụ', is_current: false, profile_count: 2 }], remaining: 2 }) : name === 'remove_account_device' ? new Promise(r => { finish = r; }) : original(name, args);
  await click(button('Làm mới danh sách thiết bị')); await click(button('Xóa thiết bị Máy phụ'));
  const confirm = button('Xác nhận xóa'); await click(confirm); await click(confirm);
  assert.equal(count('remove_account_device'), 1);
  await React.act(async () => { await session(otherUid); root.render(React.createElement(AccountDevices, { userId: otherUid })); });
  await click(button('Xóa thiết bị Máy phụ'));
  await React.act(async () => finish(response({ removed: true })));
  assert.ok(document.querySelector('[role="alertdialog"]')); assert.match(text(), /2\/2 lượt/);
  assert.ok(!text().includes('Đã xóa'));
});

test('registered category is immutable even when browser detection differs; depleted deletion quota still allows merging', async () => {
  await mount(); const original = rpcImpl;
  rpcImpl = (name, args) => name === 'get_my_account_devices' ? response({ devices: [{ ...device, device_type: 'tablet' }], remaining: 0 }) : original(name, args);
  await click(button('Làm mới danh sách thiết bị')); await redeem(); await click(button('Xác nhận liên kết'));
  assert.equal(calls.find(c => c.name === 'redeem_account_device_link').args.p_device_type, 'tablet');
  assert.match(text(), /0\/2 lượt/); assert.equal(window.localStorage.getItem('flydo-device-key-v1'), key);
});
test('only PGRST202 list error allows legacy reads; missing link SQL keeps normal device UI usable', async () => {
  reset(); await session(); rpcImpl = async () => response({ code: 'PGRST202', message: 'missing SQL' }, 404);
  root = createRoot(document.getElementById('root')); await React.act(async () => root.render(React.createElement(AccountDevices, { userId: uid })));
  assert.equal(count('account_devices'), 1); assert.equal(count('account_device_quota'), 1);
  assert.match(text(), /Thiết bị này/); assert.match(text(), /chưa.*sẵn sàng/i); assert.match(text(), /2\/2 lượt/);
  calls = []; rpcImpl = async () => response({ code: '42501', message: code }, 403);
  await click(button('Làm mới danh sách thiết bị')); assert.equal(count('account_devices'), 0);
  assert.ok(!text().includes(code)); assert.ok(!document.querySelector('[aria-label^="Xóa thiết bị"]'));
});
test('whole-group removal explains revocation and lifetime cost, respects server quota', async () => {
  await mount(); const original = rpcImpl;
  rpcImpl = async (name, args) => name === 'get_my_account_devices' ? response({ devices: [device, { ...device, id: key, device_name: 'Máy phụ', is_current: false, profile_count: 2 }], remaining: 1 }) : name === 'remove_account_device' ? response({ removed: false, reason: 'quota' }) : original(name, args);
  await click(button('Làm mới danh sách thiết bị')); await click(button('Xóa thiết bị Máy phụ'));
  assert.match(text(document.querySelector('[role="alertdialog"]')), /Tất cả.*profile.*đăng xuất/i);
  await click(button('Xác nhận xóa')); assert.match(text(), /hết 2 lượt/);
});

test('snapshot CLI exports the real mounted states without scripts, handlers or real credentials', { skip: process.env.DEVICE_UI_SNAPSHOT_CHILD === '1' }, () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'flydo-device-ui-'));
  try {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--snapshots', outputDir], { cwd: repo, env: { ...process.env, DEVICE_UI_SNAPSHOT_CHILD: '1' }, timeout: 60000, stdio: 'pipe' });
    for (const file of ['link-login-mode.html', 'create-code.html', 'redeem-confirmation.html']) {
      assert.ok(existsSync(join(outputDir, file)), `Missing mounted snapshot: ${file}`);
      const html = readFileSync(join(outputDir, file), 'utf8');
      const parsed = new jsdom.JSDOM(html).window.document;
      assert.equal(parsed.querySelector('script,iframe,object,embed'), null);
      assert.equal(parsed.querySelector('[onclick],[onload],[onsubmit]'), null);
      assert.ok(!html.includes('test-only-refresh')); assert.ok(!html.includes('c2lnbmF0dXJl'));
      assert.match(html, /data-fake-fixtures/);
      if (file === 'create-code.html') assert.equal(parsed.querySelector('input[readonly]').getAttribute('value'), code);
      if (file === 'redeem-confirmation.html') assert.ok(parsed.querySelector('[role="alertdialog"]'));
    }
  } finally {
    const scoped = relative(realpathSync(tmpdir()), realpathSync(outputDir));
    assert.ok(scoped.startsWith('flydo-device-ui-') && !scoped.startsWith('..') && !isAbsolute(scoped));
    rmSync(outputDir, { recursive: true });
  }
});
