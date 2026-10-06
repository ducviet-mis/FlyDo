// Offline browser fixtures bundle the actual payment components (not a visual copy).
// Auth/navigation/DB are the only substituted boundaries. No production sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,existsSync,mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve,dirname,extname,join,sep } from 'node:path';
import { createServer } from 'node:http';
const repo=resolve(process.cwd());const require=createRequire(join(repo,'package.json'));const ts=require('typescript');
const runtimeRequire=createRequire(resolve(process.env.FLYDO_BROWSER_MODULES||'node_modules','../package.json'));
const {chromium}=runtimeRequire('playwright');
const output=resolve('tmp/payment-layout');mkdirSync(output,{recursive:true});
const uid='10000000-0000-4000-8000-000000000002';const oid='20000000-0000-4000-8000-000000000001';
const order={id:oid,flow_version:1,order_code:'FD123456789A',plan_code:'flymax_half_yearly',status:'draft',created_at:'2026-10-06T03:00:00Z',confirmed_at:null,reviewed_at:null,
  transfer_code:'DANG DUC VIET 0901234567 FD123456789A',amount_vnd:69500,list_price_vnd:139000,discount_percent:50,discount_amount_vnd:69500,discount_source:'streak',
  buyer_snapshot:{name:'Đặng Đức Việt',email:'student.with.a.long.contact.address@example.test',phone:'0901234567'},plan_snapshot:{name:'FlyMax 6 tháng',account_tier:'flymax',duration_days:180},
  bank_snapshot:{bank_name:'NGÂN HÀNG THỬ NGHIỆM',account_number:'0012345678',account_holder:'FLYDO TEST',qr_image_url:null},subscription_id:null,result_expires_at:null,admin_note:null};
const virtual={
  auth:`const React=require('react');const state={user:${JSON.stringify({id:uid,name:'Đặng Đức Việt',email:'student.with.a.long.contact.address@example.test',phone:'0901234567',accountTier:'flygo'})},refreshUser:async()=>{}};const store=selector=>selector?selector(state):state;store.getState=()=>state;exports.useAuthStore=store;`,
  client:`const order=${JSON.stringify(order)};let current=order;const events=[];const response=()=>({success:true,order:current,events:[...events]});const db={from(){throw Error('Unexpected fixture table mutation');},async rpc(name,args){
    if(name==='prepare_payment_order'){current={...order};return {data:response(),error:null};}
    if(name==='get_my_payment_order'||name==='admin_get_payment_order'){current={...order,status:'pending',confirmed_at:order.created_at};return {data:response(),error:null};}
    if(name==='get_my_payment_orders'||name==='admin_get_payment_orders')return {data:{success:true,items:[{...order,status:'pending'}],next_cursor:null,summary:{approved_total_vnd:199000,pending_count:1}},error:null};
    if(name==='confirm_payment_order'){current={...current,status:'pending',confirmed_at:order.created_at};return {data:response(),error:null};}
    if(name==='cancel_payment_order'){current={...current,status:'cancelled'};return {data:response(),error:null};}
    if(name==='admin_approve_payment_order'){current={...current,status:'approved',subscription_id:'30000000-0000-4000-8000-000000000001',reviewed_at:order.created_at,result_expires_at:'2027-04-04T03:00:00Z'};return {data:response(),error:null};}
    if(name==='admin_reply_payment_order'||name==='admin_reject_payment_order'){events.push({id:crypto.randomUUID(),event_type:'reply',body:args.p_message,created_at:order.created_at});if(name==='admin_reject_payment_order')current={...current,status:'rejected'};return {data:response(),error:null};}
    throw Error('Unexpected fixture RPC '+name);}};exports.getSupabaseClient=()=>db;`,
  link:`const React=require('react');exports.__esModule=true;exports.default=({children,...props})=>React.createElement('a',props,children);`,
  entry:`const React=require('react');const {createRoot}=require('react-dom/client');const {PaymentDialog}=require('@/features/subscription/components/payment-dialog');const {PaymentHistory}=require('@/features/subscription/payments/payment-history');const {AdminPayments}=require('@/features/subscription/payments/admin-payments');
    function Fixture(){const [mode,setMode]=React.useState('checkout');const [open,setOpen]=React.useState(false);const trigger=React.useRef(null);const close=value=>setOpen(value);
    return React.createElement('main',{className:'container max-w-5xl py-8'},React.createElement('nav',{className:'mb-6 flex flex-wrap gap-3','aria-label':'Local test fixture'},['checkout','history','admin'].map(item=>React.createElement('button',{key:item,onClick:()=>setMode(item),className:'min-h-11 rounded-lg border px-4'},item))),
      mode==='checkout'?React.createElement(React.Fragment,null,React.createElement('button',{ref:trigger,onClick:()=>setOpen(true),className:'min-h-11 rounded-lg bg-primary px-4 text-on-primary'},'Mở thanh toán'),React.createElement(PaymentDialog,{open,onOpenChange:close,plan:{code:'flymax_half_yearly',name:'FlyMax',billingLabel:'6 tháng',price:139000,durationDays:180}})):
      mode==='history'?React.createElement(PaymentHistory):React.createElement(AdminPayments));}createRoot(document.getElementById('root')).render(React.createElement(Fixture));`,
};
// Minimal static CJS bundler: TypeScript transpiles production TSX; resolve normal
// package exports for React/Radix/Lucide. No package install or product QA route.
const ids=new Map(),factories=[];
function visit(filename){
  if(ids.has(filename))return ids.get(filename);const id=ids.size;ids.set(filename,id);
  let source=virtual[filename]??readFileSync(filename,'utf8');
  if(/\.tsx?$/.test(filename))source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const dependencies={};const ownerRequire=createRequire(virtual[filename]?join(repo,'package.json'):filename);
  for(const match of source.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g)){
    const name=match[1];let path;
    if(name==='@/features/auth/stores/auth-store')path='auth';else if(name==='@/lib/supabase/client')path='client';else if(name==='next/link')path='link';
    else if(name.startsWith('@/')){const base=resolve(repo,'src',name.slice(2));path=['.tsx','.ts'].map(s=>base+s).find(existsSync);}
    else if(name.startsWith('.')&&!virtual[filename]){const base=resolve(dirname(filename),name);path=['.tsx','.ts','.js','/index.js'].map(s=>base+s).find(existsSync);}
    if(!path)path=ownerRequire.resolve(name);
    assert.ok(path!=='fs'&&path!=='node:fs','No Node filesystem in browser bundle');dependencies[name]=visit(path);
  }
  factories[id]=`${id}:[function(require,module,exports){\n${source}\n},${JSON.stringify(dependencies)}]`;return id;
}
const entry=visit('entry');const bundle=`(()=>{const process={env:{NODE_ENV:'development'}};const modules={${factories.join(',')}};const cache={};function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;const [factory,deps]=modules[id];factory(name=>{if(!(name in deps))throw Error('Unknown browser dependency '+name);return load(deps[name]);},module,module.exports);return module.exports;}load(${entry});})();`;
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const staticRoot=resolve('.next/static');const styles=files(staticRoot).filter(f=>extname(f)==='.css');assert.ok(styles.length,'Run a production build first');
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(f=>`<link rel="stylesheet" href="/_next/static/${f.slice(staticRoot.length+1).split(sep).join('/')}">`).join('')}</head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
let server,browser,base;
test.before(async()=>{
  server=createServer((req,res)=>{
    if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
    const path=req.url?.split('?')[0];
    if(path?.startsWith('/_next/static/')){const target=resolve(staticRoot,decodeURIComponent(path.slice(14)));if(!target.startsWith(staticRoot+sep)||!existsSync(target)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',target.endsWith('.css')?'text/css':target.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(readFileSync(target));return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({channel:'chrome',headless:true});
});
test.after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
const sizes=[{name:'desktop',width:1440,height:900},{name:'phone',width:375,height:812},{name:'landscape',width:844,height:390}];
for(const theme of ['light','dark'])for(const viewport of sizes)test(`${theme}/${viewport.name}: real checkout/history/ADMIN are responsive, keyboard operable and offline`,async()=>{
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},reducedMotion:'reduce',colorScheme:theme});
  try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await context.addInitScript(theme=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.add(theme));},theme);
    const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});assert.deepEqual(errors,[],'Fixture startup');
    assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
    await page.getByRole('button',{name:'Mở thanh toán',exact:true}).click();await page.getByRole('button',{name:'Tạo đơn chuyển khoản',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByText('69.500đ',{exact:true}).first().waitFor();
    await page.screenshot({path:resolve(output,`${theme}-${viewport.name}-checkout.png`)});
    const inspect=async()=>{const dimensions=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(dimensions.page<=dimensions.viewport,'Horizontal overflow');
      const controls=await dialog.locator('button').evaluateAll(nodes=>nodes.map(n=>({label:n.textContent.trim(),height:n.getBoundingClientRect().height})));for(const c of controls)assert.ok(c.height>=43.5,`${c.label}: target ${c.height}`);
      const bounds=await dialog.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1,'Dialog leaves viewport');};
    await inspect();await dialog.getByRole('button',{name:'Tôi đã chuyển tiền',exact:true}).click();await dialog.getByText('Chờ kiểm tra',{exact:true}).waitFor();
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='Mở thanh toán');
    await page.getByRole('button',{name:'history',exact:true}).click();await page.getByRole('button',{name:'Chi tiết',exact:true}).click();await dialog.getByText('Chờ kiểm tra',{exact:true}).waitFor();await inspect();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.textContent==='Chi tiết');
    await page.getByRole('button',{name:'admin',exact:true}).click();await page.getByRole('button',{name:'Chi tiết',exact:true}).click();
    const note=('Phản hồi kiểm tra chuyển khoản: khách cần đối chiếu thông tin. ').repeat(15);await dialog.locator('textarea').fill(note);await dialog.getByRole('button',{name:'Gửi phản hồi',exact:true}).click();await dialog.getByText(note.trim(),{exact:true}).waitFor();
    await inspect();await dialog.getByRole('button',{name:'Đã nhận tiền · Kích hoạt',exact:true}).click();await dialog.getByText('Đã kích hoạt',{exact:true}).waitFor();
    await page.screenshot({path:resolve(output,`${theme}-${viewport.name}-admin.png`)});await inspect();assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
