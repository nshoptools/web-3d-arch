import {createUnifiedPrinting} from './unified.mjs';
/** Optional listener inside the EXISTING kernel Worker. Inject Module ABI 2.
 * Only trusted host commands may transfer a primary lease or request a reader.
 * Parent must enforce ACL/revision/job gates before dispatching this message. */
export function installPrintingWorker(module){
 const printing=createUnifiedPrinting(module);
 const handler=async({data})=>{
  if(data?.type!=='printing-export')return;
  let lease;
  try{
   if(typeof data.jobId!=='string'||!['primary','reader'].includes(data.ownership))throw new Error('INVALID_PRINTING_JOB');
   lease=data.ownership==='primary'
    ?printing.adoptPrimaryLease(data.snapshot.id,data.snapshot.generation)
    :printing.acquireReaderLease(data.snapshot.id,data.snapshot.generation);
   const result=await printing.exportSnapshot3MF(lease,data.request,{format:data.format});
   self.postMessage({type:'printing-result',jobId:data.jobId,status:'succeeded',result},[result.bytes.buffer]);
  }catch(error){
   self.postMessage({type:'printing-result',jobId:data?.jobId??null,status:'failed',code:error.code??'EXPORT_FAILURE',message:error.message});
  }
 };
 self.addEventListener('message',handler);
 return ()=>self.removeEventListener('message',handler);
}
