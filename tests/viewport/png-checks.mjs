import {createViewportExportProvider} from '../../src/integration/viewport-export.mjs';
const expect=(ok,message)=>{if(!ok)throw Error(message);};
const rejects=async(fn,code)=>{try{await fn();}catch(e){expect(e.code===code,`wanted ${code}, got ${e.code}`);return;}throw Error('unexpected capture success '+code);};
export async function checkPNG(viewport,pause){
 let context={userId:'TEST-view-user',projectId:'TEST-view-project',state:{revision:17},headHash:'a'.repeat(64),sessionKey:{}};
 const provider=createViewportExportProvider({viewport,context:()=>context}),control=()=>({signal:new AbortController().signal,context:{...context,revision:context.state.revision}});
 const descriptor=provider.describe(context);expect(descriptor.status==='ready','frame describes actual viewport');
 await pause();expect(provider.describe(context).key===descriptor.key,'idle rAF does not create a new presentation revision');
 const output=await provider.capture(descriptor,control()),bitmap=await createImageBitmap(new Blob([output.bytes],{type:'image/png'}));
 expect(bitmap.width===descriptor.width&&bitmap.height===descriptor.height,'PNG dimensions match actual device-pixel frame');
 const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200&&Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)colored++;
 expect(colored>100,'actual captured PNG has colored geometry, not blank cleared WebGL buffer');
 viewport.action('toggle-grid');await rejects(()=>provider.capture(descriptor,control()),'PNG_FRAME_STALE');
 const canvasGL=viewport.renderer.domElement,original=canvasGL.toBlob;let release;
 canvasGL.toBlob=function(callback,...args){return original.call(this,blob=>{release=()=>callback(blob);},...args);};
 let current=provider.describe(context),pending=provider.capture(current,control());
 while(!release)await pause();viewport.action('front');release();await rejects(()=>pending,'PNG_FRAME_STALE');
 canvasGL.toBlob=original;
 current=provider.describe(context);const staleControl=control();context={...context,sessionKey:{}};await rejects(()=>provider.capture(current,staleControl),'PNG_FRAME_STALE');
 const abort=new AbortController();abort.abort();await rejects(()=>provider.capture(provider.describe(context),{...control(),signal:abort.signal}),'CANCELLED');
 viewport.setVisible(false);expect(provider.describe(context).status==='disabled','hidden viewport cannot publish an image');viewport.setVisible(true);await pause();
 viewport.action('explode');expect(provider.describe(context).view==='assembly','exploded PNG is labelled assembly');viewport.action('explode');await pause();
 return {checks:9,width:descriptor.width,height:descriptor.height,bytes:output.bytes.length,coloredPixels:colored,scope:'Actual WebGL PNG plus explicit synthetic access identity; no backend account qualification'};
}
