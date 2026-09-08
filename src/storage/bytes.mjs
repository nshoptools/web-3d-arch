import {check,hashId,integer,sha256,byteEqual,copyBytes,abortCheck,LIMITS,errorInfo,StorageError} from './common.mjs';
import {atomic,readRecord} from './idb.mjs';
const locatorPattern=/^[a-f0-9]{64}\.[a-f0-9-]{36}$/;
export function assertLocator(locator){check(typeof locator==='string'&&locatorPattern.test(locator),'UNSAFE_LOCATOR','Invalid internal CAS locator.');return locator;}
export async function createByteStore(db,namespace,policy={}){
  const options={backend:'prefer-opfs',allowIDBFallback:true,fallbackWhen:['unsupported'],requestPersistence:false,...policy};
  check(['prefer-opfs','opfs','idb'].includes(options.backend),'BACKEND_POLICY','Unknown byte backend policy.');
  check(Array.isArray(options.fallbackWhen)&&options.fallbackWhen.every(v=>['unsupported','quota','verification-failed'].includes(v)),'BACKEND_POLICY','Invalid fallback policy.');
  let directory=null,opfs={status:'unsupported',reason:'getDirectory is absent'},selected=null;
  if((options.readOnly||options.backend==='idb')&&navigator.storage?.getDirectory){
    try{
      const root=await navigator.storage.getDirectory();
      directory=await(await root.getDirectoryHandle('web-3d-arch')).getDirectoryHandle(namespace);
      opfs={status:'read-access-only',probe:options.readOnly?'write probe disabled for unknown database version':'write probe disabled by explicit IDB policy'};
    }catch(error){opfs={status:'not-probed',category:'read-access',reason:'No existing OPFS namespace is readable; write probe disabled',error:errorInfo(error)};}
  }else if(navigator.storage?.getDirectory){
    try{
      const root=await navigator.storage.getDirectory();
      const parent=await root.getDirectoryHandle('web-3d-arch',{create:true});
      directory=await parent.getDirectoryHandle(namespace,{create:true});
      const name='0'.repeat(64)+'.'+crypto.randomUUID();
      const handle=await directory.getFileHandle(name,{create:true});
      try{
        if(typeof handle.createWritable!=='function')throw new StorageError('OPFS_UNSUPPORTED','createWritable is absent');
        const writer=await handle.createWritable();
        try{await writer.write(new Uint8Array([7,3,1]));await writer.close();}
        catch(error){try{await writer.abort();}catch{}throw error;}
        const closedFile=await handle.getFile(),observed=new Uint8Array(await closedFile.arrayBuffer());
        check(byteEqual(observed,new Uint8Array([7,3,1])),'OPFS_PROBE','OPFS closed bytes differ.',
          {expected:[7,3,1],observed:Array.from(observed.subarray(0,16)),fileSize:closedFile.size,readLength:observed.length});
      }finally{await directory.removeEntry(name).catch(()=>{});}
      opfs={status:'supported',probe:'create-write-close-read-verify-remove'};
    }catch(error){
      const category=error.code==='OPFS_UNSUPPORTED'||error.name==='NotSupportedError'?'unsupported':error.name==='QuotaExceededError'?'quota':error.code==='OPFS_PROBE'?'verification-failed':'policy-or-io-blocked';
      opfs={status:category==='unsupported'?'unsupported':'unavailable',category,error:errorInfo(error)};
    }
  }
  if(options.readOnly)selected=null;
  else if(options.backend==='idb')selected='idb';
  else if(opfs.status==='supported')selected='opfs';
  else if(options.backend==='prefer-opfs'&&options.allowIDBFallback&&options.fallbackWhen.includes(opfs.category??'unsupported'))selected='idb';
  const capabilities={
    selectedBackend:selected,opfs,indexedDB:{status:'supported',durability:'strict hint requested; browser/OS persistence not guaranteed'},
    fallback:{allowed:options.allowIDBFallback,when:options.fallbackWhen,automaticMidCommit:false},
    locks:{status:navigator.locks?.request?'supported':'unsupported'},persist:{requested:false,granted:null},estimate:null
  };
  if(navigator.storage?.estimate)try{capabilities.estimate=await navigator.storage.estimate();}catch(error){capabilities.estimate={error:errorInfo(error)};}
  if(!options.readOnly&&options.requestPersistence&&navigator.storage?.persist){
    capabilities.persist.requested=true;
    try{capabilities.persist.granted=await navigator.storage.persist();}catch(error){capabilities.persist.error=errorInfo(error);}
  }
  const checkMeta=meta=>{hashId(meta.hash);integer(meta.byteLength,0,LIMITS.asset);assertLocator(meta.locator);check(meta.locator.startsWith(meta.hash+'.'),'LOCATOR_HASH','CAS locator/hash mismatch.');};
  async function read(meta){
    checkMeta(meta);let bytes;
    if(meta.backend==='opfs'){
      check(directory,'OPFS_UNAVAILABLE','Referenced OPFS bytes are not accessible.',opfs);
      const file=await(await directory.getFileHandle(meta.locator)).getFile();
      check(file.size===meta.byteLength,'ASSET_SIZE','OPFS file size differs from manifest.',{hash:meta.hash,expected:meta.byteLength,actual:file.size});
      bytes=new Uint8Array(await file.arrayBuffer());
    }else{
      check(meta.backend==='idb','UNSUPPORTED_BACKEND','Unknown byte store backend.');
      const row=await readRecord(db,'blobs',meta.locator);
      check(row?.blob instanceof Blob,'MISSING_ASSET','IndexedDB blob is missing.',{hash:meta.hash});
      check(row.blob.size===meta.byteLength,'ASSET_SIZE','IndexedDB blob size differs.',{hash:meta.hash});
      bytes=new Uint8Array(await row.blob.arrayBuffer());
    }
    check(await sha256(bytes)===meta.hash,'ASSET_HASH','Asset bytes failed SHA-256 verification.',{hash:meta.hash});
    return bytes;
  }
  async function write(meta,input,{signal,checkpoint=async()=>{}}={}){
    checkMeta(meta);abortCheck(signal);
    const bytes=copyBytes(input);check(bytes.length===meta.byteLength&&await sha256(bytes)===meta.hash,'ASSET_HASH','Input changed before write.');
    if(meta.backend==='opfs'){
      check(directory,'OPFS_UNAVAILABLE','OPFS is unavailable.');
      // Every write gets a fresh UUID locator. Existing indexed files are never opened writable.
      let exists=false;try{await directory.getFileHandle(meta.locator);exists=true;}catch(error){if(error.name!=='NotFoundError')throw error;}
      check(!exists,'IMMUTABLE_COLLISION','Never truncate an existing immutable file.');
      const handle=await directory.getFileHandle(meta.locator,{create:true});
      let writer,closed=false;
      try{
        writer=await handle.createWritable();await checkpoint('asset.opened');abortCheck(signal);
        await writer.write(bytes);await checkpoint('asset.written');abortCheck(signal);
        await writer.close();closed=true;await checkpoint('asset.closed');abortCheck(signal);
      }finally{if(writer&&!closed)try{await writer.abort();}catch{}}
    }else{
      check(meta.backend==='idb','UNSUPPORTED_BACKEND','Unsupported target byte backend.');
      await atomic(db,['blobs'],'readwrite',t=>{
        t.request(t.store('blobs').get(meta.locator),old=>{
          check(!old,'IMMUTABLE_COLLISION','Never overwrite an immutable blob.');
          t.store('blobs').add({locator:meta.locator,blob:new Blob([bytes])});
        });
      },{signal});
      await checkpoint('asset.written');await checkpoint('asset.closed');abortCheck(signal);
    }
    const verified=await read(meta);abortCheck(signal);await checkpoint('asset.verified');
    return verified;
  }
  async function remove(meta){
    checkMeta(meta);
    if(meta.backend==='opfs'){
      check(directory,'OPFS_UNAVAILABLE','Cannot clean unavailable OPFS.');
      try{await directory.removeEntry(meta.locator);}catch(error){if(error.name!=='NotFoundError')throw error;}
    }else await atomic(db,['blobs'],'readwrite',t=>{t.store('blobs').delete(meta.locator);});
  }
  return {capabilities,read,write,remove,newLocation:(hash,byteLength)=>{
    check(selected,'BYTE_STORE_UNAVAILABLE','No byte backend allowed by capability/policy.',capabilities);
    return {hash:hashId(hash),byteLength:integer(byteLength,0,LIMITS.asset),backend:selected,locator:hash+'.'+crypto.randomUUID()};
  }};
}
