import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppController,createRasterEditingAdapter} from '../../src/app/index.mjs';
import {newDocument,contentEdit,validateDocument} from '../../src/app/documents.mjs';
import {createEditor} from '../../src/editing/index.mjs';
import {uuid} from '../../src/app/common.mjs';

test('printing slots use null/1..64; unknown app versions are preserved and rejected atomically',async()=>{
 const {document}=await newDocument('keychain'),before=JSON.stringify(document);
 const material={id:'m',label:'material',color:'#ff0000',slot:null,role:'body',overridden:false,backgroundEligible:false,excluded:false};
 for(const slot of [null,1,64])assert.equal(contentEdit(document.state,a=>{a.materials=[{...material,slot}];}).content.app.materials[0].slot,slot);
 for(const slot of [0,-1,65,1.5,'1'])assert.throws(()=>contentEdit(document.state,a=>{a.materials=[{...material,slot}];}),{code:'MATERIAL_SLOT'});
 const future={...document,version:99,futureData:{keep:true}},futureBefore=JSON.stringify(future);
 assert.throws(()=>validateDocument(future),{code:'APP_DOCUMENT_VERSION'});assert.equal(JSON.stringify(future),futureBefore);assert.equal(JSON.stringify(document),before);
});

test('OIDC navigation uses only trusted auth/start response, HTTPS without userinfo/fragment',async()=>{
 let target='https://idp.example.test/authorize?state=opaque',navigated=null;
 const calls=[];
 // Explicit HTTP-response test double for navigation validation, no account/session/storage substitution.
 const controller=createAppController({origin:'https://app.example.test',deviceId:uuid(),navigate:url=>{navigated=url;},fetchImpl:async(url,request)=>{
  calls.push({url,request});return new Response(JSON.stringify({authorizationUrl:target}),{headers:{'content-type':'application/json'}});
 }});
 const good=await controller.signIn({reauthenticate:true});assert.equal(good.ok,true);assert.equal(navigated,target);
 assert.equal(calls[0].url,'https://app.example.test/api/v1/auth/start');assert.equal(calls[0].request.redirect,'error');
 for(const invalid of ['javascript:alert(1)','data:text/html,a','http://idp.example.test/a','https://u:p@idp.example.test/a','https://idp.example.test/a#fragment','/from-project','https://idp.example.test/'+ 'a'.repeat(8200)]){
  target=invalid;navigated=null;const r=await controller.signIn();assert.equal(r.ok,false);assert.equal(r.diagnostic.code,'OIDC_REDIRECT_INVALID');assert.equal(navigated,null);
 }
 controller.dispose();
});

test('explicit Node pure-core test client maps gesture without duplicating algorithms; production default requires Worker',async()=>{
 let editor,disposed=0;
 // Deliberate Node-only client: production adapter default uses real Dedicated Worker RPC.
 const createNodeTestClient=()=>({async initialize(input){editor=await createEditor(input);return editor.token();},prepare:(c,control)=>editor.prepare(c,control),commit:(id,token)=>editor.commit(id,token),dispose(){disposed++;}});
 const a=createRasterEditingAdapter({createEditingClient:createNodeTestClient,encodePNG:async()=>new Uint8Array([1])});
 const raster={width:8,height:8,data:new Uint8ClampedArray(256).fill(255),pixelSizeMm:0.1,preview:new Uint8Array([1]),previewMediaType:'image/png'};
 const edited=await a.edit({ticket:{id:uuid(),userId:'test',projectId:'test',revision:0,generation:1},gesture:{id:uuid(),tool:'line',points:[{x:1,y:1},{x:6,y:6}],snap:'none'},editor:{strokeWidthPx:'1,5'},color:[0,0,0,255],source:{id:uuid(),hash:'a'.repeat(64),revision:0},raster,signal:new AbortController().signal,onProgress(){}});
 assert.equal(edited.changed,true);assert.notDeepEqual(edited.raster.data,raster.data);assert.equal(disposed,1);
 const unbound=createRasterEditingAdapter({encodePNG:async()=>new Uint8Array()});assert.equal(unbound.capabilities[0].available,false);
});
