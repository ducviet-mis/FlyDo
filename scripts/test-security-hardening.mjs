// No live Supabase calls. Uses the isolated PGlite runtime already used by
// test-question-reports.mjs, plus actual Next request/response implementations.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import Module, { createRequire } from 'node:module';
import { PGlite } from '../tmp/question-report-db-test/node_modules/@electric-sql/pglite/dist/index.js';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { NextRequest } = require('next/server');
const repo = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1')), '..');
const cookieStore = { getAll: () => [{ name: 'existing', value: 'old' }], set: (...args) => serverWrites.push(args) };
const serverWrites = [];
let getUser = async () => ({ data: { user: null }, error: null });
let exchange = async () => ({ data: { session: {} }, error: null });
let cookieOptions;
let workerOptions;
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name === 'serwist') {
      class Strategy { constructor(options) { this.options = options; } }
      return { NetworkOnly: Strategy, CacheFirst: Strategy, ExpirationPlugin: Strategy,
        Serwist: class { constructor(options) { workerOptions = options; } addEventListeners() {} } };
    }
    if (name === '@supabase/ssr') return { createServerClient: (_url, _key, options) => {
      cookieOptions = options.cookies;
      return { auth: { getUser: () => getUser(), exchangeCodeForSession: () => exchange() } };
    } };
    if (name === 'next/headers') return { cookies: async () => cookieStore };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.ts', '.tsx'].map((suffix) => base + suffix).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
const { updateSession } = load(resolve(repo, 'src/lib/supabase/middleware.ts'));
getUser = async () => {
  cookieOptions.setAll([{ name: 'session.0', value: 'part-a', options: { path: '/', sameSite: 'lax' } },
    { name: 'session.1', value: 'part-b', options: { path: '/' } }]);
  cookieOptions.setAll([{ name: 'session.2', value: 'part-c', options: { path: '/' } }]);
  return { data: { user: null }, error: null };
};
const req = new NextRequest('https://flydo.example.test/home');
const refreshed = await updateSession(req);
for (const [index, value] of ['part-a', 'part-b', 'part-c'].entries()) {
  assert.equal(refreshed.cookies.get('session.' + index).value, value);
  assert.equal(req.cookies.get('session.' + index).value, value);
}
assert.match(refreshed.headers.get('cache-control'), /private.*no-store/);
for (const path of ['/admin', '/admin/gift-codes', '/handbook/new', '/handbook/123/edit']) {
  const denied = await updateSession(new NextRequest('https://flydo.example.test' + path));
  assert.equal(denied.status, 307);
  assert.equal(new URL(denied.headers.get('location')).pathname, '/home');
  assert.equal(denied.cookies.get('session.2').value, 'part-c');
}
getUser = async () => ({ data: { user: { id: 'admin', email: 'vietdang293.vn@gmail.com' } }, error: null });
assert.equal((await updateSession(new NextRequest('https://flydo.example.test/admin'))).status, 200);
getUser = async () => { throw new Error('test offline'); };
assert.equal((await updateSession(new NextRequest('https://flydo.example.test/home'))).status, 200);
assert.equal((await updateSession(new NextRequest('https://flydo.example.test/admin'))).status, 503);

const { createServerSupabaseClient } = load(resolve(repo, 'src/lib/supabase/server.ts'));
await createServerSupabaseClient();
assert.equal(cookieOptions.getAll()[0].name, 'existing');
cookieOptions.setAll([{ name: 'a', value: '1', options: {} }, { name: 'b', value: '2', options: {} }]);
assert.equal(serverWrites.length, 2);
const { GET } = load(resolve(repo, 'src/app/auth/callback/route.ts'));
for (const next of ['//evil.test', '/\\evil.test', 'https://evil.test']) {
  const response = await GET(new Request('https://flydo.example.test/auth/callback?code=test&next=' + encodeURIComponent(next)));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.origin, 'https://flydo.example.test');
  assert.equal(destination.pathname, '/home');
  assert.equal(destination.searchParams.get('device_oauth'), '1');
  assert.match(response.headers.get('cache-control'), /no-store/);
}
exchange = async () => { throw new Error('test offline'); };
assert.equal(new URL((await GET(new Request('https://flydo.example.test/auth/callback?code=test'))).headers.get('location')).pathname, '/login');

const { isPublicStaticRequest, isLegacyFlydoCache } = load(resolve(repo, 'src/lib/security/pwa-cache-policy.ts'));
const origin = 'https://flydo.example.test';
function cacheable(path, destination = 'document', headers = {}, method = 'GET') {
  const url = new URL(path, origin);
  const request = { method, destination, headers: new Headers(headers) };
  return isPublicStaticRequest(request, url, origin);
}
for (const path of ['/home', '/admin', '/profile', '/api/private', '/auth/callback', '/_next/image?url=/profile',
  'https://supabase.example.test/rest/v1/profiles', 'https://supabase.example.test/auth/v1/user']) assert.equal(cacheable(path), false);
assert.equal(cacheable('/_next/static/chunks/app.js', 'script'), true);
assert.equal(cacheable('/_next/static/media/font.woff2', 'font'), true);
assert.equal(cacheable('/_next/static/chunks/app.js', 'script', { Authorization: 'Bearer test' }), false);
assert.equal(cacheable('/_next/static/chunks/app.js?_rsc=test', 'script'), false);
assert.equal(cacheable('/_next/static/chunks/app.js', 'script', { RSC: '1' }), false);
assert.equal(cacheable('/icon-192.png', 'image'), true);
assert.equal(cacheable('/icon-192.png', 'image', {}, 'POST'), false);
assert.equal(isLegacyFlydoCache('pages'), true);
assert.equal(isLegacyFlydoCache('cross-origin'), true);
assert.equal(isLegacyFlydoCache('workbox-precache-v2-origin'), true);
assert.equal(isLegacyFlydoCache('flydo-public-static-v1'), false);
assert.equal(isLegacyFlydoCache('unrelated-cache'), false);

// Execute the real worker's routing/cleanup configuration without a browser.
const workerListeners = new Map();
globalThis.self = { location: { origin }, __SW_MANIFEST: [], addEventListener: (name, handler) => workerListeners.set(name, handler) };
const deletedCaches = [];
globalThis.caches = {
  keys: async () => ['pages', 'cross-origin', 'workbox-precache-v2-old', 'flydo-public-static-v1', 'unrelated-cache'],
  delete: async (name) => { deletedCaches.push(name); return true; },
};
load(resolve(repo, 'src/app/sw.ts'));
let activation;
workerListeners.get('activate')({ waitUntil: (promise) => { activation = promise; } });
await activation;
assert.deepEqual(deletedCaches, ['pages', 'cross-origin', 'workbox-precache-v2-old']);
assert.equal(workerOptions.fallbacks, undefined, 'Do not hydrate offline HTML at private route URLs');
const navigation = workerOptions.runtimeCaching[0];
assert.equal(navigation.matcher({ request: { mode: 'navigate' } }), true);
assert.equal(navigation.matcher({ request: { mode: 'cors' } }), false);
const recover = navigation.handler.options.plugins[0].handlerDidError;
for (const path of ['/home', '/profile', '/admin/mock-exams']) {
  const response = await recover({ request: new Request(origin + path) });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), origin + '/offline');
}
assert.equal((await recover({ request: new Request(origin + '/offline') })).status, 503, 'No offline redirect loop');
delete globalThis.self; delete globalThis.caches;

const db = new PGlite();
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid primary key, email text, raw_user_meta_data jsonb DEFAULT '{}');
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon;`);
await db.exec(readFileSync(resolve(repo, 'src/lib/supabase/schema.sql'), 'utf8').split('-- ========== 1B.')[0]);
await db.exec(`INSERT INTO auth.users(id,email) VALUES ('${alice}','alice@example.test'),('${bob}','bob@example.test'),('${admin}','vietdang293.vn@gmail.com');
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
  CREATE POLICY "Legacy broad read" ON profiles FOR SELECT USING (true);
  CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (id=auth.uid());
  GRANT ALL ON profiles TO anon, authenticated;`);
await db.exec(readFileSync(resolve(repo, 'src/lib/supabase/subscription-schema.sql'), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
const sql = readFileSync(resolve(repo, 'src/lib/supabase/account-security-hardening.sql'), 'utf8');
await db.exec(sql); await db.exec(sql);
async function as(id, email) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, email })]);
  await db.exec('SET ROLE authenticated');
}
await as(alice, 'alice@example.test');
assert.equal((await db.query('SELECT * FROM profiles')).rows.length, 1);
assert.equal((await db.query('SELECT * FROM profiles WHERE id=$1', [bob])).rows.length, 0);
await assert.rejects(() => db.query("UPDATE profiles SET email='vietdang293.vn@gmail.com' WHERE id=$1", [alice]), /permission denied/);
await assert.rejects(() => db.query("UPDATE profiles SET account_tier='flyinfinity' WHERE id=$1", [alice]), /permission denied/);
await assert.rejects(() => db.query('DELETE FROM profiles WHERE id=$1', [alice]), /permission denied/);
await db.query("UPDATE profiles SET name='Alice',phone='0901234567',birth_date='2012-01-02',avatar_url='https://example.test/a.png' WHERE id=$1", [alice]);
assert.equal((await db.query('SELECT phone FROM profiles')).rows[0].phone, '0901234567');
assert.equal((await db.query('SELECT * FROM handbook_author_profiles')).rows.length, 1);
assert.deepEqual(Object.keys((await db.query('SELECT * FROM handbook_author_profiles')).rows[0]), ['name', 'avatar_url']);
await db.exec('RESET ROLE');
await db.exec("INSERT INTO gift_codes(code,name,flymax_days,max_redemptions) VALUES ('SECURITY-TEST','Test',7,1)");
await as(alice, 'alice@example.test');
const redemption = (await db.query("SELECT redeem_gift_code('SECURITY-TEST') AS result")).rows[0].result;
assert.equal(redemption.success, true);
assert.equal((await db.query('SELECT account_tier FROM profiles')).rows[0].account_tier, 'flymax');
await as(bob, 'bob@example.test');
assert.equal((await db.query('SELECT account_tier FROM profiles')).rows[0].account_tier, 'flygo');
await as(admin, 'vietdang293.vn@gmail.com');
assert.equal((await db.query('SELECT * FROM profiles')).rows.length, 3); // ADMIN notification targeting still works
await db.exec('RESET ROLE; SET ROLE anon');
await assert.rejects(() => db.query('SELECT * FROM profiles'), /permission denied/);
await assert.rejects(() => db.query('SELECT * FROM handbook_author_profiles'), /permission denied/);
await db.close();
console.log('PASS: chunked SSR cookies, verified ADMIN boundary, OAuth failure/redirect isolation, public-only PWA cache, legacy cache cleanup, private profiles, immutable identity/membership, normal profile edits, ADMIN targeting and real FlyMax gift redemption.');
