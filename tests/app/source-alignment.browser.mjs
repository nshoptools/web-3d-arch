import {scoped} from './online-policy.browser.mjs';
import {sha256,uuid} from '../../src/app/common.mjs';
import {createRasterEditingAdapter} from '../../src/app/index.mjs';
import {testPNG} from './test-doubles.mjs';
import {testPreparation,testFlatReceipt} from './source-approval.fixtures.mjs';
const check=(v,m)=>{if(!v)throw Error(m);},ok=r=>{check(r.ok,r.diagnostic?.code);return r;},bad=(r,code)=>{check(!r.ok,'expected rejection');if(code)check(r.diagnostic.code===code,r.diagnostic.code);return r;};
export const alignmentCases={
 async sourceContextImportEditReconvert(){return scoped(async({c,adapters,control})=>{
  ok(await c.initialize());ok(await c.dispatch({type:'project.create',product:'keychain'}));
  const contexts=[];let accepts=0,legacy=false;
  const image={width:8,height:8,data:new Uint8ClampedArray(256).fill(255)},originalPNG=await testPNG(image),confirmation={kind:'raster',version:'TEST-raster-confirmation/1',approvalHash:'a'.repeat(64),proposalHash:'b'.repeat(64)};
  // Explicit raster-preparation test double. The pixel gesture below runs the actual editing Worker.
  async function prepare(input){
   check(Object.isFrozen(input.sourceContext),'context frozen');contexts.push(structuredClone(input.sourceContext));
   const data=input.source?new Uint8ClampedArray(input.assets.get(input.source.raster.rgba)):image.data.slice(),preview=await testPNG({...image,data});
   const raw=input.file?.bytes??input.assets.get(input.source.raw.hash),preparation=testPreparation(input,await sha256(raw),await sha256(new Uint8Array(data.buffer)));
   if(legacy)preparation.context.sourceRevision=0;
   return {status:'proposal',confirmation,changes:['TEST reprocessing confirmation'],result:{version:input.version,ticket:input.ticket,kind:'raster',
    metadata:{rasterPreparation:preparation},raster:{...image,data,pixelSizeMm:.1,preview,previewMediaType:'image/png'}}};
  }
  adapters.source.ingest=prepare;adapters.source.convert=prepare;
  adapters.source.acceptProposal=async input=>{accepts++;check(input.sourceContext.id===input.source.id&&input.sourceContext.revision===input.source.revision,'accept original context');return testFlatReceipt(input);};
  adapters.editing=createRasterEditingAdapter({encodePNG:testPNG});
  const imported=bad(await c.importFile(new File([originalPNG],'source.png',{type:'image/png'})),'PROPOSAL_REQUIRED'),head=c.headRevision;
  check(c.doc.state.content.app.source===null&&accepts===0,'initial proposal no early commit');ok(await c.dispatch(imported.confirmation.retry));
  let src=c.doc.state.content.app.source;const id=src.id,rawHash=src.raw.hash;
  check(src.revision===0&&contexts[0].revision===0&&contexts[0].predecessor===null,'initial revision zero');check(c.headRevision===head+1,'initial one commit');
  ok(await c.dispatch({type:'editor.settings',values:{cutMode:'hole'}}));
  ok(await c.editSource({id:uuid(),projectRevision:c.doc.state.revision,sourceRevision:src.revision,tool:'erase',points:[{x:1,y:1},{x:6,y:6}],snap:'none'}));
  src=c.doc.state.content.app.source;check(src.id===id&&src.revision===1,'actual pixel edit increments source');const editedRGBA=src.raster.rgba;
  for(const expected of [2,3]){
   const old=c.headRevision,p=bad(await c.dispatch({type:'source.convert',target:'raster'}),'PROPOSAL_REQUIRED');
   check(c.doc.state.content.app.source.revision===expected-1,'conversion remains preview');ok(await c.dispatch(p.confirmation.retry));src=c.doc.state.content.app.source;
   check(src.id===id&&src.revision===expected&&src.raw.hash===rawHash&&src.raster.rgba===editedRGBA,'conversion keeps identity/original/current pixels');
   check(src.metadata.sourceContext.predecessor.revision===expected-1&&src.metadata.confirmationReceipt.sourceRevision===expected,'explicit predecessor and flat receipt');
   check(!Object.hasOwn(src.metadata,'rasterReceipt')&&!Object.hasOwn(src.metadata.confirmationReceipt,'source'),'single flat receipt');
   check(c.headRevision===old+1,'conversion exactly one commit');
  }
  const savedHead=c.headRevision,before=JSON.stringify(c.doc),called=accepts;legacy=true;
  bad(await c.dispatch({type:'source.convert',target:'raster'}),'SOURCE_PREPARATION_CONTEXT');
  check(c.headRevision===savedHead&&JSON.stringify(c.doc)===before&&accepts===called,'hardcoded reset rejected before hook');legacy=false;
  ok(await c.dispatch({type:'history.undo'}));check(c.doc.state.content.app.source.revision===2,'undo restores predecessor source revision');
  ok(await c.dispatch({type:'history.redo'}));check(c.doc.state.content.app.source.revision===3,'redo restores accepted source revision');
  ok(await c.dispatch({type:'project.save'}));ok(await c.dispatch({type:'project.open',id:c.projectId}));
  check(c.doc.state.content.app.source.id===id&&c.doc.state.content.app.source.revision===3,'reopen identity/revision retained');
  let emojiContext=null;adapters.source.selectEmoji=async input=>{emojiContext=input.sourceContext;return {file:{name:'TEST-emoji.json',mediaType:'application/json',bytes:new TextEncoder().encode('{}')},result:{version:input.version,ticket:input.ticket,kind:'emoji',metadata:{testOnly:true}}};};
  ok(await c.selectEmoji('test-item','test-collection'));
  check(emojiContext&&Object.isFrozen(emojiContext)&&emojiContext.operation==='import'&&emojiContext.id!==id&&emojiContext.revision===0&&emojiContext.predecessor.revision===3,'emoji factory gets new import context');
  return {actualEditingWorker:true,initialImportRevision:0,conversionRevisions:[2,3],sameId:true,rawBytesRetained:true,legacyResetRejected:true,flatReceipt:true,undoRedoReopen:true,emojiContext:true,backend:c.store.capabilities.selectedBackend};
 });}
};
