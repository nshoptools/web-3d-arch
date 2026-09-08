import {assert,data,canonicalJSON,sha256,utf8,uuid,freeze} from './common.mjs';
const VERDICTS=new Set(['pass','fail','unverified','unsupported']);
/** Capture only owned JSON and actual output bytes; never treat a save request as OS persistence. */
export async function prepareExportReceipt({artifact,bytes,filename,format,projectId,revision,inspection,now}){
 const digest=await sha256(bytes),metadata=artifact.metadata===undefined?null:data(artifact.metadata);
 if(metadata!==null){assert(metadata&&typeof metadata==='object'&&!Array.isArray(metadata),'EXPORT_METADATA');assert(utf8.encode(canonicalJSON(metadata)).length<=2*1024*1024,'EXPORT_METADATA_BUDGET');}
 const warnings=metadata?.warnings??[];
 assert(Array.isArray(warnings)&&warnings.length<=1000&&warnings.every(w=>typeof w==='string'&&w.length<=2000),'EXPORT_WARNINGS');
 let verdict=VERDICTS.has(format.verdict)?format.verdict:'unverified';
 if(metadata?.schema==='arch-app-export/1'){
  assert(metadata.formatId===format.id&&metadata.projectId===projectId&&metadata.revision===revision&&metadata.bytes===bytes.length&&metadata.sha256===digest,'EXPORT_RECEIPT_IDENTITY');
  assert(metadata.options?.inspection===inspection&&metadata.options?.filename===filename&&metadata.qualification?.inspection===inspection,'EXPORT_RECEIPT_OPTIONS');
  if(VERDICTS.has(metadata.qualification?.mesh))verdict=metadata.qualification.mesh;
 }
 const view={id:uuid(),formatId:format.id,filename,byteLength:bytes.length,sha256:digest,projectRevision:revision,createdAt:new Date(now).toISOString(),verdict,inspection,warnings:data(warnings),metadataAvailable:metadata!==null};
 const document={schema:'arch-app-export-receipt/1',projectId,artifact:{...view,mimeType:artifact.mimeType},delivery:'handed-to-download-adapter; OS persistence not verified',exporter:metadata};
 return freeze({view,document,contentHash:await sha256(canonicalJSON(document))});
}
