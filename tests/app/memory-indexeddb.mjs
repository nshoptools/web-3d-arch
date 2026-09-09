// TEST DOUBLE ONLY: a minimal in-memory IndexedDB for Node suites that exercise src/storage.
// It implements exactly the surface src/storage/idb.mjs and bytes.mjs use (open/upgrade, keyPath
// object stores, get/getAll/put/add/delete requests, transaction complete/abort with rollback).
// It is not a spec-complete polyfill and never replaces the browser storage suites.
const domError=name=>Object.assign(new Error(name),{name});
export function createMemoryIndexedDB(){
 const catalog=new Map();
 class Request{constructor(){this.result=undefined;this.error=null;this.onsuccess=null;this.onerror=null;this.onupgradeneeded=null;this.onblocked=null;}}
 class Transaction{
  constructor(db,names,mode){
   Object.assign(this,{db,names,mode,error:null,oncomplete:null,onabort:null,onerror:null,pending:0,finished:false,aborted:false});
   this.snapshot=mode==='readwrite'?new Map(names.map(n=>[n,new Map(db.stores.get(n))])):null;this.settle();
  }
  objectStore(name){if(this.finished)throw domError('InvalidStateError');if(!this.names.includes(name))throw domError('NotFoundError');return new ObjectStore(this,name);}
  request(job){
   const r=new Request();this.pending++;
   queueMicrotask(()=>{
    if(this.finished)return;
    this.pending--;
    try{r.result=job();}catch(e){r.error=e;r.onerror?.({target:r});if(!this.finished)this.fail(e);return;}
    r.onsuccess?.({target:r});this.settle();
   });
   return r;
  }
  settle(){queueMicrotask(()=>{if(this.finished||this.pending>0)return;this.finished=true;this.oncomplete?.({target:this});});}
  fail(error){this.error=error;this.abort();}
  abort(){
   if(this.finished)throw domError('InvalidStateError');
   this.finished=true;this.aborted=true;
   if(this.snapshot)for(const [name,rows]of this.snapshot)this.db.stores.set(name,rows);
   queueMicrotask(()=>this.onabort?.({target:this}));
  }
 }
 class ObjectStore{
  constructor(tx,name){this.tx=tx;this.name=name;this.keyPath=tx.db.keyPaths.get(name);}
  get rows(){return this.tx.db.stores.get(this.name);}
  get(key){return this.tx.request(()=>structuredClone(this.rows.get(key)));}
  getAll(){return this.tx.request(()=>[...this.rows.keys()].sort().map(k=>structuredClone(this.rows.get(k))));}
  put(value){return this.#write(value,false);}
  add(value){return this.#write(value,true);}
  delete(key){this.#writable();return this.tx.request(()=>{this.rows.delete(key);return undefined;});}
  #writable(){if(this.tx.mode!=='readwrite')throw domError('ReadOnlyError');}
  #write(value,exclusive){
   this.#writable();const stored=structuredClone(value),key=stored[this.keyPath];if(key===undefined)throw domError('DataError');
   return this.tx.request(()=>{if(exclusive&&this.rows.has(key))throw domError('ConstraintError');this.rows.set(key,stored);return key;});
  }
 }
 class Connection{
  constructor(name,data){this.name=name;this.data=data;this.version=1;this.closed=false;this.onversionchange=null;this.objectStoreNames={contains:n=>data.stores.has(n)};}
  get stores(){return this.data.stores;}
  get keyPaths(){return this.data.keyPaths;}
  createObjectStore(name,{keyPath}){this.data.stores.set(name,new Map());this.data.keyPaths.set(name,keyPath);}
  transaction(names,mode='readonly'){
   if(this.closed)throw domError('InvalidStateError');const list=typeof names==='string'?[names]:[...names];
   for(const n of list)if(!this.data.stores.has(n))throw domError('NotFoundError');return new Transaction(this,list,mode);
  }
  close(){this.closed=true;}
 }
 return {
  open(name){
   const request=new Request();
   queueMicrotask(()=>{
    let data=catalog.get(name);const upgrade=!data;
    if(upgrade){data={stores:new Map(),keyPaths:new Map()};catalog.set(name,data);}
    request.result=new Connection(name,data);
    if(upgrade)request.onupgradeneeded?.({target:request});
    request.onsuccess?.({target:request});
   });
   return request;
  },
  databases(){return [...catalog.keys()];}
 };
}
