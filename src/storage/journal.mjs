import {check,StorageError,byteEqual,cloneJSON,canonicalJSON} from './common.mjs';
import {atomic,readStores} from './idb.mjs';
function currentJob(row,job){
  check(row&&row.owner===job.owner&&row.fence===job.fence&&['preparing','staged'].includes(row.status),
    'STALE_GENERATION','Transaction owner/generation changed.');
  return row;
}
export async function beginJournal(db,input,options){
  return atomic(db,['journals'],'readwrite',t=>t.request(t.store('journals').get(input.id),old=>{
    if(old){
      check(old.fingerprint===input.fingerprint&&old.projectId===input.projectId,'TRANSACTION_ID_REUSED','Transaction ID was reused with another payload.');
      if(['committed','conflict'].includes(old.status)){t.result(old);return;}
    }
    const row={...input,fence:(old?.fence??0)+1,status:'preparing',pins:old?.pins??[],files:old?.files??[],acks:[]};
    t.store('journals').put(row);t.result(row);
  }),options);
}
export async function recordFile(db,job,location,options){
  return atomic(db,['journals'],'readwrite',t=>t.request(t.store('journals').get(job.id),raw=>{
    const row=currentJob(raw,job);row.files.push(location);t.store('journals').put(row);
  }),options);
}
export async function pinObject(db,job,asset,location,options){
  return atomic(db,['objects','journals'],'readwrite',t=>t.request(t.store('journals').get(job.id),raw=>{
    const row=currentJob(raw,job);
    t.request(t.store('objects').get(asset.hash),old=>{
      if(!old&&!location){t.result(null);return;}
      if(old)check(old.state==='ready'&&old.byteLength===asset.byteLength,'OBJECT_UNAVAILABLE','Object is being cleaned or has incompatible metadata.',{hash:asset.hash});
      const object=old??{...location,state:'ready',pins:[],refs:[]};
      if(!object.pins.includes(job.id))object.pins.push(job.id);
      if(!row.pins.includes(asset.hash))row.pins.push(asset.hash);
      t.store('objects').put(object);t.store('journals').put(row);t.result(object);
    });
  }),options);
}
/** Pin existing objects in one strict IDB transaction before byte I/O.
 * No Blob/File/crypto await occurs here. Publication still verifies every byte,
 * pin, immutable locator, journal fence and expected head in its own transaction. */
export async function pinExistingObjects(db,job,assets,options){
  return atomic(db,['objects','journals'],'readwrite',t=>t.request(t.store('journals').get(job.id),raw=>{
    const row=currentJob(raw,job),objects=new Map();let remaining=assets.length;
    if(!remaining){t.result(objects);return;}
    const pins=new Set(row.pins);let changed=false;
    for(const asset of assets)t.request(t.store('objects').get(asset.hash),old=>{
      if(old){
        check(old.state==='ready'&&old.byteLength===asset.byteLength,'OBJECT_UNAVAILABLE','Object is being cleaned or has incompatible metadata.',{hash:asset.hash});
        if(!old.pins.includes(job.id)){old.pins.push(job.id);t.store('objects').put(old);}
        if(!pins.has(asset.hash)){pins.add(asset.hash);changed=true;}
        objects.set(asset.hash,old);
      }
      if(--remaining===0){if(changed){row.pins=[...pins];t.store('journals').put(row);}t.result(objects);}
    });
  }),options);
}
export async function stageManifest(db,job,encoded,options){
  return atomic(db,['journals','manifests'],'readwrite',t=>t.request(t.store('journals').get(job.id),raw=>{
    const row=currentJob(raw,job);
    t.request(t.store('manifests').get(encoded.hash),old=>{
      if(old)check(byteEqual(old.bytes,encoded.bytes),'MANIFEST_COLLISION','Existing immutable manifest has different bytes.');
      else t.store('manifests').add({hash:encoded.hash,bytes:encoded.bytes,projectId:row.projectId,revision:encoded.manifest.revision,
        namespace:encoded.manifest.namespace,assets:encoded.manifest.assets.map(a=>a.hash),state:'staged'});
      row.status='staged';t.store('journals').put(row);
    });
  }),options);
}
export async function finishFailedJournal(db,job,error,{keepConflict=false}={}){
  return atomic(db,['journals','objects'],'readwrite',t=>t.request(t.store('journals').get(job.id),row=>{
    if(!row||row.owner!==job.owner||row.fence!==job.fence||['committed','conflict'].includes(row.status)){t.result(false);return;}
    row.status=keepConflict?'conflict':'aborted';row.failure={code:typeof error.code==='string'?error.code:error.name,message:String(error.message??error)};
    if(!keepConflict){
      for(const hash of row.pins)t.request(t.store('objects').get(hash),object=>{
        if(object){object.pins=object.pins.filter(id=>id!==job.id);t.store('objects').put(object);}
      });
      row.pins=[];
    }
    t.store('journals').put(row);t.result(true);
  }));
}
export async function publishHead(db,job,encoded,{verifiedObjects,baseHead,verifiedBaseHash,retainManifests,ack,syncCheckpoint=()=>{},guard,clockKey,authVersion,lastSeen},options){
  const stores=['heads','index','journals','manifests','objects','meta'];
  return readStores(db,stores,'readwrite',(t,rows)=>{
    guard();const row=currentJob(rows.journals.find(r=>r.id===job.id),job);
    const head=rows.heads.find(h=>h.projectId===job.projectId)??null;
    if((head?.revision??0)!==job.expectedRevision){
      row.status='conflict';row.conflict={currentHead:head,candidateManifestHash:encoded.hash};t.store('journals').put(row);
      t.result({conflict:true,currentHead:head,candidateManifestHash:encoded.hash,transactionId:job.id});return;
    }
    check(canonicalJSON(head)===canonicalJSON(baseHead),'HEAD_CHANGED','Head metadata changed without the expected generation.');
    const staged=rows.manifests.find(m=>m.hash===encoded.hash);
    check(staged&&byteEqual(staged.bytes,encoded.bytes),'MANIFEST_NOT_READY','Verified manifest changed before publish.');
    for(const retained of retainManifests){
      const m=rows.manifests.find(m=>m.hash===retained);
      check(m&&m.namespace===encoded.manifest.namespace&&m.projectId===job.projectId&&m.state==='committed',
        'HISTORY_REFERENCE','Retained history manifest is missing or belongs to another scope.');
    }
    const objects=encoded.manifest.assets.map(asset=>{
      const object=rows.objects.find(o=>o.hash===asset.hash);
      const verified=verifiedObjects.find(o=>o.hash===asset.hash);
      check(object&&verified&&object.state==='ready'&&object.pins.includes(job.id)&&object.locator===verified.locator&&object.backend===verified.backend,
        'ASSET_NOT_READY','Asset pin/verified location changed before head publish.',{hash:asset.hash});
      return object;
    });
    const watermark=rows.meta.find(m=>m.key===clockKey);
    check((watermark?.authVersion??0)<=authVersion,'AUTH_VERSION','A newer auth version fenced this writer.');
    syncCheckpoint('publish.before-write',{transaction:t.tx});guard();
    t.store('meta').put({key:clockKey,lastSeen:Math.max(watermark?.lastSeen??0,lastSeen),authVersion});
    for(const object of objects){
      object.pins=object.pins.filter(id=>id!==job.id);
      if(!object.refs.includes(encoded.hash))object.refs.push(encoded.hash);
      t.store('objects').put(object);
    }
    staged.state='committed';t.store('manifests').put(staged);
    const next={schemaVersion:1,projectId:job.projectId,revision:encoded.manifest.revision,currentHash:encoded.hash,
      previousHash:verifiedBaseHash??null,historyHashes:retainManifests,
      previousHistoryHashes:head?.currentHash===verifiedBaseHash?(head?.historyHashes??[]):(head?.previousHistoryHashes??[]),
      transactionId:job.id};
    row.status='committed';row.pins=[];row.ack=ack;t.store('journals').put(row);
    t.store('index').put({projectId:job.projectId,revision:next.revision,manifestHash:encoded.hash,
      title:typeof encoded.manifest.document.title==='string'?encoded.manifest.document.title.slice(0,200):job.projectId});
    t.store('heads').put(next);
    syncCheckpoint('publish.after-write',{transaction:t.tx});guard();
    t.result({conflict:false,head:next,ack});
  },options);
}

/** Replace a proven corrupt/missing hash mapping using freshly closed and verified
 * bytes of EXACTLY the expected hash. Existing files are never opened writable.
 * References keep the same logical content identity; the old bad location is
 * retained until post-commit/aborted staging cleanup observes it is unindexed. */
export async function repairObject(db,job,asset,location,expected,options){
  return atomic(db,['objects','journals'],'readwrite',t=>t.request(t.store('journals').get(job.id),raw=>{
    const row=currentJob(raw,job);
    t.request(t.store('objects').get(asset.hash),old=>{
      check(old&&old.state==='ready'&&old.byteLength===asset.byteLength&&old.pins.includes(job.id),
        'OBJECT_UNAVAILABLE','Repair requires the original live content identity and a journal pin.');
      if(old.locator!==expected.locator||old.backend!==expected.backend){t.result(old);return;}
      check(row.files.some(f=>f.locator===location.locator&&f.hash===asset.hash),'ASSET_NOT_READY','Repair bytes were not journaled.');
      row.files.push({hash:old.hash,byteLength:old.byteLength,backend:old.backend,locator:old.locator});
      const repaired={...old,...location};t.store('objects').put(repaired);t.store('journals').put(row);t.result(repaired);
    });
  }),options);
}