// Captures the real interface served by tools/development/dev-serve.mjs at the
// states a person actually passes through (start, source, model, export,
// library, quick search) and at three viewport widths, so an interface change
// can be compared before/after from the same script. Every file is written
// inside the repository (AGENTS.md); nothing here asserts a verdict.
//
//   node tools/development/capture-ui.mjs --out tmp/reviews/codex/runs/<run>/evidence/ui-before [--origin https://127.0.0.1:5180] [--as a]
//
// Requires the repo's own Playwright (node_modules/playwright) and browsers
// under .toolchain/playwright; no download is attempted.
import {mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..','..');
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]?args[i+1]:fallback;};
const origin=option('origin','https://127.0.0.1:5180');
const account=option('as','a');
const out=resolve(root,option('out','tmp/reviews/codex/runs/ui-capture/evidence/ui'));
if(!out.startsWith(root))throw new Error('Output must stay inside the repository: '+out);
await mkdir(out,{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH??=join(root,'.toolchain','playwright');
const {chromium}=await import('playwright');

const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const samplePath=(await exists(join(root,'docs/examples/hai-mau-co-lo.svg')))?join(root,'docs/examples/hai-mau-co-lo.svg'):join(root,'tests/csg-controller/hai-mau-co-lo.svg');
const sample=await readFile(samplePath);

const record={origin,account,startedAt:new Date().toISOString(),sample:samplePath,captures:[],failures:[],console:[],pageErrors:[]};
const browser=await chromium.launch({headless:true});
// The development server uses a synthetic loopback certificate (see dev-serve.mjs).
const context=await browser.newContext({viewport:{width:1440,height:900},locale:'vi-VN',colorScheme:'dark',ignoreHTTPSErrors:true});
const page=await context.newPage();
page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')record.console.push({type:m.type(),text:m.text().slice(0,400)});});
page.on('pageerror',e=>record.pageErrors.push(String(e.message).slice(0,400)));

const shot=async(name,{width=1440,height=900}={})=>{
 await page.setViewportSize({width,height});await page.waitForTimeout(350);
 const file=join(out,`${name}-${width}.png`);await page.screenshot({path:file,fullPage:false});
 const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,innerWidth,innerHeight,title:document.title}));
 record.captures.push({name,width,height,file,metrics,at:new Date().toISOString()});
 return file;
};
const step=async(name,fn)=>{try{await fn();}catch(error){record.failures.push({step:name,error:String(error?.stack??error).slice(0,1200)});}};
const idle=async()=>{await page.getByRole('group',{name:'Tiến độ xử lý',exact:true}).waitFor({state:'hidden',timeout:60000}).catch(()=>{});};
const approveIfAsked=async label=>{
 const dialog=page.locator('[role="dialog"]').filter({has:page.locator('[data-proposal-id]')});
 if(await dialog.count()){await shot(label+'-consent');await dialog.getByRole('button',{name:'Áp dụng thay đổi',exact:true}).click();await page.waitForTimeout(500);await idle();}
};
const openSection=async name=>{const tab=page.getByRole('tab',{name:new RegExp(name)}).first();if(await tab.count()){await tab.click();await page.waitForTimeout(250);return true;}return false;};

await step('sign-in',async()=>{
 await page.goto(origin+'/__dev/login?as='+account,{waitUntil:'load'});
 await page.getByRole('button',{name:/^Menu tài khoản của/}).waitFor({timeout:90000});
 await page.waitForTimeout(800);
});
await step('start',async()=>{for(const width of[1440,1024,390])await shot('01-start',{width,height:width<500?844:900});await page.setViewportSize({width:1440,height:900});});
await step('create-project',async()=>{
 await openSection('Thư viện');
 const card=page.locator('[data-create-project]').first();await card.waitFor({timeout:15000});
 const radio=card.locator('[data-product="keychain"]');
 if(await radio.count())await radio.first().click();
 else await card.getByRole('combobox',{name:'Loại sản phẩm',exact:true}).selectOption('keychain');
 const intent=card.getByRole('combobox',{name:'Sau khi tạo xong, mở',exact:true});if(await intent.count())await intent.selectOption('none');
 await card.getByRole('button',{name:/^Tạo dự án/}).first().click();
 await page.getByRole('tab',{name:/Ảnh nguồn/}).first().waitFor({timeout:30000});
 await page.waitForTimeout(600);
 await openSection('Ảnh nguồn');
 await shot('02-source-empty');
});
await step('import-svg',async()=>{
 const button=page.locator('#w3a-source-import');
 const [chooser]=await Promise.all([page.waitForEvent('filechooser',{timeout:15000}),button.click()]);
 await chooser.setFiles({name:'hai-mau-co-lo.svg',mimeType:'image/svg+xml',buffer:sample});
 await page.waitForTimeout(1500);await idle();await approveIfAsked('03-import');
 await page.waitForTimeout(600);
 await shot('03-source-loaded');
 await openSection('Lớp màu');await shot('04-materials');
 await openSection('Thông số');await shot('05-parameters');
});
await step('build',async()=>{
 const button=page.getByRole('banner').locator('[data-advance]').first();
 await button.click();await page.waitForTimeout(1500);await idle();await approveIfAsked('06-build');
 await page.locator('[data-step-chip="2"][aria-current="step"]').waitFor({timeout:90000});
 await page.waitForTimeout(1200);
 for(const width of[1440,1024,390])await shot('06-model',{width,height:width<500?844:900});
 await page.setViewportSize({width:1440,height:900});
});
await step('export',async()=>{await openSection('Xuất');await shot('07-export');});
await step('library',async()=>{await openSection('Thư viện');await shot('08-library');});
await step('quick-search',async()=>{
 await page.keyboard.press('Escape');await page.getByRole('banner').getByRole('button',{name:/Tìm nhanh/}).first().focus();
 await page.keyboard.press('Control+k');await page.getByRole('dialog').waitFor({timeout:10000});await shot('09-quick-search');await page.keyboard.press('Escape');
});
await step('account-menu',async()=>{await page.getByRole('button',{name:/^Menu tài khoản của/}).click();await shot('10-account-menu');await page.keyboard.press('Escape');});

record.finishedAt=new Date().toISOString();
await writeFile(join(out,'capture.json'),JSON.stringify(record,null,2));
await context.close();await browser.close();
console.log(JSON.stringify({out,captures:record.captures.length,failures:record.failures.map(f=>f.step),pageErrors:record.pageErrors.length,consoleIssues:record.console.length}));
