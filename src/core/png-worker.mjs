import {encodeRasterPNG} from './png-encode.mjs';
let busy=false;
self.onmessage=async({data})=>{
  if(data?.type!=='encode-png'||!Number.isSafeInteger(data.id)||data.id<1)return;
  if(busy){postMessage({id:data.id,error:'PNG_BUSY'});return;}
  busy=true;
  try{const bytes=await encodeRasterPNG(data.image);postMessage({id:data.id,bytes},[bytes.buffer]);}
  catch(error){postMessage({id:data.id,error:error.code??'PNG_ENCODING_FAILED'});}
  finally{busy=false;}
};
