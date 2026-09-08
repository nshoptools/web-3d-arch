import {check,StorageError,abortCheck} from './common.mjs';
export const DATABASE_VERSION=1;
export const STORES=['heads','index','manifests','objects','blobs','journals','meta'];
export async function openDatabase(name){
  check(globalThis.indexedDB,'IDB_UNAVAILABLE','IndexedDB is required for atomic local heads.');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name);let rejected=false;
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const [store,key]of [['heads','projectId'],['index','projectId'],['manifests','hash'],['objects','hash'],['blobs','locator'],['journals','id'],['meta','key']])
        db.createObjectStore(store,{keyPath:key});
    };
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>{rejected=true;reject(new StorageError('IDB_BLOCKED','Database opening is blocked by another connection.'));};
    request.onsuccess=()=>{
      const db=request.result;if(rejected){db.close();return;}db.onversionchange=()=>db.close();
      resolve({db,supported:db.version===1&&STORES.every(s=>db.objectStoreNames.contains(s)),version:db.version,readable:STORES.every(s=>db.objectStoreNames.contains(s))});
    };
  });
}
/** All callbacks are synchronous IDB event work. Never await external I/O inside this transaction. */
export function atomic(db,names,mode,body,{signal,guard=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    let tx,reason,result,done=false;
    try{
      abortCheck(signal);guard();
      try{tx=db.transaction(names,mode,{durability:'strict'});}
      catch(error){if(error.name!=='TypeError')throw error;tx=db.transaction(names,mode);}
    }catch(error){reject(error);return;}
    const stop=error=>{reason=error;try{tx.abort();}catch{if(!done){done=true;reject(reason);}}};
    const onSignal=()=>stop(new StorageError('ABORTED','IDB transaction cancelled.'));
    signal?.addEventListener('abort',onSignal,{once:true});
    const finish=()=>signal?.removeEventListener('abort',onSignal);
    tx.oncomplete=()=>{finish();if(!done){done=true;resolve(result);}};
    tx.onabort=()=>{finish();if(!done){done=true;reject(reason??tx.error??new StorageError('IDB_ABORT','IDB transaction aborted.'));}};
    tx.onerror=()=>{};
    const api={
      tx,store:name=>tx.objectStore(name),result:value=>{result=value;},stop,
      request:(request,callback)=>{
        request.onerror=()=>{reason??=request.error;};
        request.onsuccess=()=>{try{abortCheck(signal);guard();callback(request.result);}catch(error){stop(error);}};
      }
    };
    try{body(api);}catch(error){stop(error);}
  });
}
export const readRecord=(db,store,key,options)=>atomic(db,[store],'readonly',t=>t.request(t.store(store).get(key),value=>t.result(value)),options);
export const readRecords=(db,store,options)=>atomic(db,[store],'readonly',t=>t.request(t.store(store).getAll(),value=>t.result(value)),options);
export function readStores(db,names,mode,callback,options){
  return atomic(db,names,mode,t=>{
    const rows={};let remaining=names.length;
    for(const name of names)t.request(t.store(name).getAll(),value=>{
      rows[name]=value;if(--remaining===0)callback(t,rows);
    });
  },options);
}
