import assert from 'node:assert/strict';
export class ProductUI {
 constructor(page,{step=45000}={}){this.page=page;this.timeout=step;}
 async tab(name){await this.page.getByRole('tab',{name:new RegExp(name)}).first().click();}
 /** Unfold a collapsible group of the open panel by its title (source groups start folded). */
 async openGroup(name){const head=this.page.getByRole('tabpanel').getByRole('button',{name:new RegExp('^'+name)}).first();await head.waitFor({timeout:this.timeout});if(await head.getAttribute('aria-expanded')==='false')await head.click();}
 async ready(){await this.page.getByRole('button',{name:/^Menu tài khoản của/}).waitFor({timeout:60000});}
 async idle(){await this.page.getByRole('group',{name:'Tiến độ xử lý',exact:true}).waitFor({state:'hidden',timeout:this.timeout});}
 async create(product,name){
  // With no project open the start screen carries the create card; with one
  // open the same card sits in the library panel. Both publish [data-create-project].
  const libraryTab=this.page.getByRole('tab',{name:/Thư viện/}).first();
  const workspace=await libraryTab.count();
  if(workspace)await this.tab('Thư viện');
  const card=this.page.locator('[data-create-project]').first();await card.waitFor({timeout:this.timeout});
  const radio=card.locator('[data-product="'+product+'"]');
  if(await radio.count())await radio.first().click();
  else await card.getByRole('combobox',{name:'Loại sản phẩm',exact:true}).selectOption(product);
  const previousName=workspace?await this.page.getByRole('textbox',{name:'Tên dự án',exact:true}).inputValue().catch(()=>null):null;
  await card.getByRole('button',{name:/^Tạo dự án/}).first().click();
  await libraryTab.waitFor({timeout:this.timeout});await this.tab('Thư viện');
  if(previousName!==null)await this.page.waitForFunction(old=>Array.from(document.querySelectorAll('input')).some(e=>e.value==='Untitled'&&e.value!==old),previousName,{timeout:this.timeout});
  await this.page.getByRole('textbox',{name:'Tên dự án',exact:true}).waitFor({timeout:this.timeout});
  const field=this.page.getByRole('textbox',{name:'Tên dự án',exact:true});
  await field.fill(name);await field.press('Enter');await field.blur();
  await this.page.waitForFunction(name=>Array.from(document.querySelectorAll('li.card strong')).some(el=>el.textContent===name),name,{timeout:this.timeout});
 }
 async importFile(file){
  await this.tab('Ảnh nguồn');
  const [chooser]=await Promise.all([this.page.waitForEvent('filechooser'),this.page.locator('#w3a-source-import').click()]);
  await chooser.setFiles(file);
  // Observe the actual async operation; no controller/adapter calls.
  await this.page.waitForFunction(name=>document.querySelector('[role="dialog"]')||(!document.querySelector('[aria-label="Tiến độ xử lý"]')&&document.body.innerText.includes(name))||document.querySelector('.toast--error'),file.name,{timeout:this.timeout});
  if(!(await this.page.getByRole('dialog').count()))await this.idle();
 }
 async approve(){
  const dialog=this.page.getByRole('dialog');await dialog.waitFor({timeout:this.timeout});
  const prior=await this.page.locator('[data-proposal-id]').getAttribute('data-proposal-id');
  await dialog.getByRole('button',{name:'Áp dụng thay đổi',exact:true}).click();
  await this.page.waitForFunction(prior=>!document.querySelector('[role="dialog"]')||document.querySelector('[data-proposal-id]')?.getAttribute('data-proposal-id')!==prior,prior,{timeout:this.timeout});
  if(await this.page.locator('[data-proposal-id]').count())throw Object.assign(Error('ADDITIONAL_PROPOSAL_REQUIRED: '+await dialog.innerText()),{code:'ADDITIONAL_PROPOSAL_REQUIRED'});
  await this.idle();
 }
 async revision(){
  await this.tab('Thư viện');const text=await this.page.locator('.card').filter({has:this.page.getByRole('textbox',{name:'Tên dự án',exact:true})}).innerText();
  const m=text.match(/Bản sửa (\d+)/);assert.ok(m,'public document revision');return Number(m[1]);
 }
 async waitRevision(prior){
  await this.tab('Thư viện');await this.page.waitForFunction(prior=>Array.from(document.querySelectorAll('.card')).some(e=>{const m=e.innerText.match(/Bản sửa (\d+)/);return m&&Number(m[1])>prior;}),prior,{timeout:this.timeout});return this.revision();
 }
 async undo(){
  const prior=await this.revision();await this.page.locator('[data-step-chip="1"]').click();await this.page.keyboard.press('Control+z');return this.waitRevision(prior);
 }
 async parameter(id,value){
  await this.tab('Thư viện');
  const revision=await this.page.locator('.card').filter({has:this.page.getByRole('textbox',{name:'Tên dự án',exact:true})}).innerText();
  const prior=Number(revision.match(/Bản sửa (\d+)/)[1]);
  await this.tab('Thông số');
  const row=this.page.locator('.prow[data-parameter-id="'+id+'"]');
  await row.waitFor({timeout:this.timeout});const input=row.locator('input:not([type="range"])').first();await input.fill(String(value));await input.press('Enter');await input.blur();await this.tab('Thư viện');
  await this.page.waitForFunction(prior=>Array.from(document.querySelectorAll('.card')).some(e=>{const m=e.innerText.match(/Bản sửa (\d+)/);return m&&Number(m[1])>prior;}),prior,{timeout:this.timeout});
  return input;
 }
 async build(){
  await this.page.locator('[data-step-chip="1"]').click();
  const button=this.page.getByRole('banner').locator('[data-advance]');
  assert.equal(await button.isEnabled(),true,'production build action enabled: '+await button.innerText());
  await button.click();
  await this.page.waitForFunction(()=>document.querySelector('[data-step-chip="2"][aria-current="step"]')||document.querySelector('[data-proposal-id]')||document.querySelector('.toast--error'),undefined,{timeout:this.timeout});
  if(await this.page.locator('[data-proposal-id]').count())throw Object.assign(Error('PRODUCT_APPROVAL_REQUIRED: '+await this.page.getByRole('dialog').innerText()),{code:'PRODUCT_APPROVAL_REQUIRED'});
  await this.idle();
  assert.equal(await this.page.locator('[data-step-chip="2"]').getAttribute('aria-current'),'step','successful product promotes model');
  assert.equal(await this.page.locator('[data-mode="3d"] canvas').count(),1,'actual Three canvas');
  const revision=await this.page.locator('[data-visible-model-revision]').getAttribute('data-visible-model-revision');assert.ok(revision&&revision!=='none');
  return {visibleRevision:Number(revision),readouts:await this.page.locator('#w3a-stage-readouts').innerText()};
 }
 async exports(){
  await this.tab('Xuất');return await this.page.locator('[data-export-option]').evaluateAll(xs=>xs.map(e=>({id:e.dataset.exportOption,enabled:e.dataset.exportEnabled,prerequisite:e.dataset.exportPrerequisite,reasonCode:e.dataset.exportReasonCode??null,text:e.innerText})));
 }
 async download(format,path){
  await this.tab('Xuất');const card=this.page.locator('[data-export-option="'+format+'"]');
  assert.equal(await card.getAttribute('data-export-enabled'),'true',await card.innerText());
  const [download]=await Promise.all([this.page.waitForEvent('download',{timeout:this.timeout}),card.getByRole('button',{name:/^Xuất(?: để kiểm tra)?$/,exact:false}).click()]);
  assert.equal(await download.failure(),null);await download.saveAs(path);await this.idle();return {filename:download.suggestedFilename(),path};
 }
 async receipt(format,path){
  const group=this.page.getByRole('button',{name:/Hồ sơ kết quả xuất/});if(await group.getAttribute('aria-expanded')==='false')await group.click();
  const row=this.page.locator('[data-export-receipt-format="'+format+'"]').last();await row.waitFor();
  const stamp=await row.evaluate(e=>({...e.dataset,sha:e.querySelector('[data-export-receipt-sha]').dataset.exportReceiptSha}));
  const [download]=await Promise.all([this.page.waitForEvent('download',{timeout:this.timeout}),row.getByRole('button',{name:/^Tải hồ sơ kết quả:/}).click()]);
  assert.equal(await download.failure(),null);await download.saveAs(path);return {...stamp,path};
 }
 async saveOpen(name){
  await this.tab('Thư viện');await this.page.getByRole('button',{name:/^Lưu dự án/}).first().click();
  await this.page.waitForFunction(()=>Array.from(document.querySelectorAll('.card')).some(e=>/Bản sửa (\d+) · đã lưu \1/.test(e.innerText)),undefined,{timeout:this.timeout});
  const row=this.page.locator('li.card').filter({has:this.page.locator('strong').filter({hasText:new RegExp('^'+name+'$')})});
  await row.getByRole('button',{name:'Mở',exact:true}).click();
  await this.page.waitForFunction(()=>!Array.from(document.querySelectorAll('li.card button')).some(b=>b.textContent.trim()==='Mở'&&b.disabled),undefined,{timeout:this.timeout});await this.idle();
  assert.equal(await this.page.locator('[data-step-chip="1"]').getAttribute('aria-current'),'step','reopen has no loaded mesh');
 }
 async rescue(path){
  await this.tab('Thư viện');const group=this.page.getByRole('button',{name:/Sao lưu và gói dự án/});if(await group.getAttribute('aria-expanded')==='false')await group.click();
  const [d]=await Promise.all([this.page.waitForEvent('download',{timeout:this.timeout}),this.page.locator('[data-export-rescue]').click()]);assert.equal(await d.failure(),null);await d.saveAs(path);return {path,filename:d.suggestedFilename()};
 }
}


