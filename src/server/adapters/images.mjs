import {base64Bytes,decodePixels} from '../image-codec.mjs';
import {checkImage} from '../image-workers.mjs';
import {Fault} from '../core.mjs';
// Synchronous export is for bounded analytic callers/tests. Production adapter uses worker path.
export function decodeImage(value,mimeType,limits){
 try{const bytes=base64Bytes(value,limits.maxBytes),image=decodePixels(bytes,mimeType,limits);
 if(limits.square!==false&&image.width!==image.height)throw Error();
 return {bytes,mediaType:mimeType,width:image.width,height:image.height};
 }catch{throw new Fault(502,'PROVIDER_IMAGE_INVALID');}
}
export async function decodeImageAsync(value,mimeType,limits,signal){
 try{const bytes=base64Bytes(value,limits.maxBytes),image=await checkImage(bytes,mimeType,limits,{signal});
 if(limits.square!==false&&image.width!==image.height)throw Error();
 return {bytes,mediaType:mimeType,width:image.width,height:image.height};
 }catch(e){throw new Fault(502,e?.code?.endsWith('_UNSUPPORTED')?'PROVIDER_IMAGE_FORMAT_UNSUPPORTED':'PROVIDER_IMAGE_INVALID');}
}
