// Actual React components/API/hooks; only auth, navigation and network are isolated.
import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';
const repo=resolve(process.cwd()); const require=createRequire(resolve(repo,'package.json'));
const dom=new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost:3500/profile',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','NodeFilter','MutationObserver','Event','CustomEvent','MouseEvent','KeyboardEvent','DocumentFragment'])
  Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window); globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'); const {createRoot}=require('react-dom/client'); const ts=require('typescript');
const uid='10000000-0000-4000-8000-000000000002'; const oid='20000000-0000-4000-8000-000000000001';
const plan={code:'flymax_half_yearly',name:'FlyMax',billingLabel:'6 tháng',price:139000,durationDays:180};
const draft={id:oid,flow_version:1,order_code:'FD123456789A',plan_code:plan.code,status:'draft',created_at:'2026-10-06T03:00:00Z',confirmed_at:null,reviewed_at:null,
  transfer_code:'DANG DUC VIET 0901234567 FD123456789A',amount_vnd:69500,list_price_vnd:139000,discount_percent:50,discount_amount_vnd:69500,discount_source:'streak',
  buyer_snapshot:{name:'Đặng Đức Việt',email:'alice@example.test',phone:'0901234567'},plan_snapshot:{name:'FlyMax 6 tháng',account_tier:'flymax',duration_days:180},
  bank_snapshot:{bank_name:'TEST BANK',account_number:'0012345678',account_holder:'FLYDO TEST',qr_image_url:null},subscription_id:null,result_expires_at:null,admin_note:null};
const detail=(order=draft)=>({success:true,order:{...order},events:[]});
let refreshes=0; let authState; const listeners=new Set();
const auth=selector=>{ const state=React.useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb);},()=>authState,()=>authState); return selector?selector(state):state; };
auth.getState=()=>authState;
function account(user){authState={user,refreshUser:async()=>{refreshes++;},initialized:true,isLoading:false};listeners.forEach(cb=>cb());}
let rpcImpl, saveError, copyError, calls, routes;
let params = new URLSearchParams();
const network={
  async rpc(name,args){calls.push({name,args}); return rpcImpl(name,args);},
  from(table){assert.equal(table,'profiles');return {update(values){calls.push({name:'profile-save',values});return this;},async eq(field,id){assert.equal(field,'id');assert.equal(id,authState.user.id);return {error:saveError?{message:'offline'}:null};}};},
};
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(copyError)throw Error('blocked');calls.push({name:'copy',text});}}});
const cache=new Map();
function load(filename){
  if(cache.has(filename))return cache.get(filename).exports;
  const mod=new Module(filename);cache.set(filename,mod);mod.filename=filename;mod.paths=Module._nodeModulePaths(dirname(filename));
  mod.require=name=>{
    if(name==='@/features/auth/stores/auth-store')return {useAuthStore:auth};
    if(name==='@/lib/supabase/client')return {getSupabaseClient:()=>network};
    if(name==='next/navigation')return {useSearchParams:()=>params,useRouter:()=>({push:r=>routes.push(r),replace:r=>routes.push(r)})};
    if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
    if(name.endsWith('.css'))return {};
    if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?resolve(repo,'src',name.slice(2)):resolve(dirname(filename),name);
      const path=['.tsx','.ts'].map(s=>base+s).find(existsSync);if(path)return load(path);}
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return mod.exports;
}
const {PaymentDialog}=load(resolve(repo,'src/features/subscription/components/payment-dialog.tsx'));
let root;
function reset(){refreshes=0;calls=[];routes=[];saveError=false;copyError=false;params=new URLSearchParams();
  account({id:uid,name:'Đặng Đức Việt',phone:'0901234567',email:'alice@example.test',accountTier:'flygo'});
  rpcImpl=async name=>{
    if(name==='prepare_payment_order')return {data:detail(),error:null};
    if(name==='get_my_payment_orders'||name==='admin_get_payment_orders')return {data:{success:true,items:[{...draft,status:'pending'}],next_cursor:null,summary:{approved_total_vnd:199000,pending_count:1}},error:null};
    if(name==='get_my_payment_order'||name==='admin_get_payment_order')return {data:detail({...draft,status:'pending'}),error:null};
    if(name==='confirm_payment_order')return {data:detail({...draft,status:'pending'}),error:null};
    if(name==='admin_approve_payment_order')return {data:detail({...draft,status:'approved',subscription_id:'30000000-0000-4000-8000-000000000001',result_expires_at:'2027-04-04T00:00:00Z'}),error:null};
    throw Error('Unexpected RPC '+name);
  };
}
const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
function button(label,scope=document){const el=[...scope.querySelectorAll('button')].find(b=>text(b)===label);assert.ok(el,'Missing '+label);return el;}
async function click(el){await React.act(async()=>el.click());}
async function mount(Component,props={}){reset();root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Component,props)));}
async function input(el,value){await React.act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
afterEach(async()=>{if(root)await React.act(async()=>root.unmount());root=null;});
after(()=>dom.window.close());

test('missing phone saves profile first; failed save never creates order',async()=>{
  reset(); account({...authState.user,phone:''});root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(PaymentDialog,{open:true,onOpenChange:()=>{},plan})));
  assert.equal(calls.length,0); const phone=document.querySelector('input[type="tel"]');assert.ok(phone);
  await input(phone,'090 123-4567');saveError=true;await click(button('Tạo đơn chuyển khoản'));
  assert.ok(document.querySelector('[role="alert"]'));assert.equal(calls.filter(c=>c.name==='prepare_payment_order').length,0);
  saveError=false;await click(button('Tạo đơn chuyển khoản'));
  assert.equal(calls.find(c=>c.name==='profile-save').values.phone,'0901234567');
  assert.ok(text(document.querySelector('[role="dialog"]')).includes('69.500đ'));
});
test('checkout uses server quote, failed confirm never reports success and retry retains request UUID',async()=>{
  await mount(PaymentDialog,{open:true,onOpenChange:()=>{},plan});
  const original=rpcImpl;let failed=true;
  rpcImpl=async(name,args)=>{if(name==='prepare_payment_order'&&failed)return {data:null,error:{code:'NETWORK',message:'offline'}};return original(name,args);};
  await click(button('Tạo đơn chuyển khoản'));assert.ok(document.querySelector('[role="alert"]'));
  failed=false;await click(button('Tạo đơn chuyển khoản'));
  const tokens=calls.filter(c=>c.name==='prepare_payment_order').map(c=>c.args.p_request_id);assert.equal(tokens[0],tokens[1]);assert.match(tokens[0],/^[a-f0-9-]{36}$/);
  assert.ok(text(document.querySelector('[role="dialog"]')).includes('69.500đ'));
  assert.ok(text(document.querySelector('[role="dialog"]')).includes('DANG DUC VIET 0901234567 FD123456789A'));
  copyError=true;await click(document.querySelector('[aria-label="Sao chép số tài khoản"]'));assert.ok(text(document.querySelector('[role="alert"]')).includes('sao chép'));
  rpcImpl=async()=>({data:{success:false,code:'ADMIN_UNAVAILABLE',message:'Chưa có người tiếp nhận thanh toán.'},error:null});
  await click(button('Tôi đã chuyển tiền'));assert.ok([...document.querySelectorAll('[role="alert"]')].some(el=>text(el).includes('tiếp nhận')));assert.equal(document.querySelector('a[href*="tab=payments"]'),null);
  rpcImpl=original;await click(button('Tôi đã chuyển tiền'));assert.ok(text(document.querySelector('[role="dialog"]')).includes('Chờ kiểm tra'));
  assert.ok(document.querySelector('a[href*="tab=payments"]'));assert.equal(calls.filter(c=>c.name==='profile-save').length,0);
});
test('checkout rejects late quote after auth switch and does not leak buyer data',async()=>{
  await mount(PaymentDialog,{open:true,onOpenChange:()=>{},plan});let finish;
  rpcImpl=()=>new Promise(resolve=>finish=resolve);
  await click(button('Tạo đơn chuyển khoản'));
  await React.act(async()=>account({...authState.user,id:'10000000-0000-4000-8000-000000000003',name:'Người khác',email:'bob@example.test'}));
  await React.act(async()=>finish({data:detail(),error:null}));
  assert.ok(!text(document.body).includes('DANG DUC VIET'));assert.ok(!text(document.body).includes('alice@example.test'));
});
test('history separates server error from empty list and global total from filter, resolves deep link privately',async()=>{
  const {PaymentHistory}=load(resolve(repo,'src/features/subscription/payments/payment-history.tsx'));
  await mount(PaymentHistory,{initialOrderId:oid});assert.ok(text(document.body).includes('199.000đ'));assert.ok(document.querySelector('[role="dialog"]'));
  await click(button('Đóng'));
  await click(button('Không duyệt / Đã hủy'));assert.equal(calls.filter(c=>c.name==='get_my_payment_orders').at(-1).args.p_status,'closed');
  assert.ok(text(document.body).includes('199.000đ'));
  rpcImpl=async()=>({data:null,error:{code:'PGRST202',message:'missing function'}});
  await click(button('Làm mới'));assert.ok(document.querySelector('[role="alert"]'));assert.ok(!text(document.body).includes('Bạn chưa có đơn'));
});
test('ADMIN one-click action stays locked until server returns, refreshes correct actual status',async()=>{
  const {AdminPayments}=load(resolve(repo,'src/features/subscription/payments/admin-payments.tsx'));
  await mount(AdminPayments,{initialOrderId:oid});assert.equal(calls.find(c=>c.name==='admin_get_payment_orders').args.p_status,'pending');
  let finish;const original=rpcImpl;rpcImpl=async(name,args)=>name==='admin_approve_payment_order'?new Promise(resolve=>finish=resolve):original(name,args);
  const approve=button('Đã nhận tiền · Kích hoạt');await click(approve);assert.ok(approve.disabled);
  await click(approve);assert.equal(calls.filter(c=>c.name==='admin_approve_payment_order').length,1);
  await React.act(async()=>finish({data:detail({...draft,status:'approved',subscription_id:'30000000-0000-4000-8000-000000000001',result_expires_at:'2027-04-04T00:00:00Z'}),error:null}));
  assert.ok(text(document.querySelector('[role="dialog"]')).includes('Đã kích hoạt'));
  assert.ok(![...document.querySelectorAll('button')].some(b=>text(b)==='Đã nhận tiền · Kích hoạt'));
});
test('ADMIN reason required, customer-visible reply stays pending, SQL error is ADMIN-only',async()=>{
  const {AdminPayments}=load(resolve(repo,'src/features/subscription/payments/admin-payments.tsx'));
  await mount(AdminPayments,{initialOrderId:oid});assert.ok(button('Không duyệt').disabled);
  await input(document.querySelector('textarea'),'Chưa đối chiếu được khoản chuyển.');
  const original=rpcImpl;rpcImpl=async(name,args)=>name==='admin_reply_payment_order'?{data:{...detail({...draft,status:'pending'}),events:[{id:oid,event_type:'reply',body:args.p_message,created_at:draft.created_at}]},error:null}:original(name,args);
  await click(button('Gửi phản hồi'));assert.ok(text(document.body).includes('Chưa đối chiếu được khoản chuyển.'));
  assert.ok(button('Đã nhận tiền · Kích hoạt'));
  await click(button('Đóng'));rpcImpl=async()=>({data:null,error:{code:'PGRST202',message:'missing function'}});await click(button('Làm mới'));
  assert.ok(text(document.querySelector('[role="alert"]')).includes('manual-payments.sql'));
});

test('stable 20-row history pagination discards an old page after filter/refresh and account switch',async()=>{
  const {PaymentHistory}=load(resolve(repo,'src/features/subscription/payments/payment-history.tsx'));
  reset();const twenty=Array.from({length:20},(_,i)=>({...draft,id:`20000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,status:'approved',subscription_id:'30000000-0000-4000-8000-000000000001',order_code:`FD00000000${String(i).padStart(2,'0')}`}));
  const cursor={created_at:draft.created_at,id:twenty.at(-1).id};let finish;
  rpcImpl=async(name,args)=>args.p_cursor_id?new Promise(resolve=>finish=resolve):{data:{success:true,items:twenty,next_cursor:cursor,summary:{approved_total_vnd:1390000,pending_count:0}},error:null};
  root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(PaymentHistory)));
  assert.equal(document.querySelectorAll('ul > li').length,20);await click(button('Xem thêm đơn'));
  assert.equal(calls.at(-1).args.p_cursor_id,cursor.id);
  await click(button('Không duyệt / Đã hủy'));assert.equal(calls.at(-1).args.p_cursor_id,null);
  await React.act(async()=>finish({data:{success:true,items:[{...draft,order_code:'FDSTALEPAGE'}],next_cursor:null,summary:{approved_total_vnd:1,pending_count:0}},error:null}));
  assert.ok(!text(document.body).includes('FDSTALEPAGE'));
  rpcImpl=()=>new Promise(()=>{});
  await React.act(async()=>account({...authState.user,id:'10000000-0000-4000-8000-000000000003',name:'Bob',email:'bob@example.test'}));
  assert.ok(!text(document.body).includes('FD0000000001'));assert.equal(document.querySelectorAll('ul > li').length,0);
});
test('legacy approved is not labelled activated; malformed and foreign deep links cannot expose an order',async()=>{
  const {PaymentHistory}=load(resolve(repo,'src/features/subscription/payments/payment-history.tsx'));
  reset();rpcImpl=async(name)=>name==='get_my_payment_orders'?{data:{success:true,items:[{...draft,flow_version:0,status:'approved',buyer_snapshot:null,plan_snapshot:null,bank_snapshot:null,order_code:null}],next_cursor:null,summary:{approved_total_vnd:0,pending_count:0}},error:null}:{data:{success:false,code:'NOT_FOUND',message:'Không tìm thấy đơn trong tài khoản của bạn.'},error:null};
  root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(PaymentHistory,{initialOrderId:'//other.invalid'})));
  assert.ok(text(document.body).includes('Đã duyệt · dữ liệu cũ'));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(calls.filter(c=>c.name==='get_my_payment_order').length,0);
  await click(button('Chi tiết'));assert.ok(document.querySelector('[role="alert"]'));assert.ok(!text(document.querySelector('[role="dialog"]')).includes('DANG DUC VIET'));
});
test('approved history refreshes membership; draft resumes with cancellation acknowledgement instead of a new purchase',async()=>{
  const {PaymentHistory}=load(resolve(repo,'src/features/subscription/payments/payment-history.tsx'));
  await mount(PaymentHistory,{initialOrderId:oid});const original=rpcImpl;
  rpcImpl=async(name,args)=>name==='get_my_payment_order'?{data:detail({...draft,status:'approved',subscription_id:'30000000-0000-4000-8000-000000000001',result_expires_at:'2027-04-04T00:00:00Z'}),error:null}:original(name,args);
  await React.act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(refreshes,1);
  await click(button('Đóng'));
  rpcImpl=async(name,args)=>name==='get_my_payment_order'?{data:detail(),error:null}:original(name,args);
  await click(button('Chi tiết'));assert.ok(button('Hủy đơn nháp').disabled);assert.ok(button('Tôi đã chuyển tiền'));
  assert.equal(calls.filter(c=>c.name==='prepare_payment_order').length,0);
});
test('actual profile reads known tab/order query, preserves other tabs and never uses a redirect query',async()=>{
  const Profile=load(resolve(repo,'src/app/profile/page.tsx')).default;
  reset();params=new URLSearchParams(`tab=payments&order=${oid}&redirect=https://other.invalid`);
  root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Profile)));
  assert.equal(document.querySelectorAll('nav[aria-label="Cài đặt tài khoản"] button').length,4);
  assert.ok(document.querySelector('[role="dialog"]'));await click(button('Đóng'));
  assert.equal(routes.at(-1),'/profile?tab=payments');assert.ok(!routes.some(r=>r.includes('other.invalid')));
});
test('list-only approval refreshes cached membership once without opening detail',async()=>{
  const {PaymentHistory}=load(resolve(repo,'src/features/subscription/payments/payment-history.tsx'));
  reset();rpcImpl=async()=>({data:{success:true,items:[{...draft,status:'approved',subscription_id:'30000000-0000-4000-8000-000000000001',result_expires_at:'2027-04-04T00:00:00Z'}],next_cursor:null,summary:{approved_total_vnd:69500,pending_count:0}},error:null});
  root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(PaymentHistory)));
  assert.equal(refreshes,1);await click(button('Làm mới'));assert.equal(refreshes,1);
});
