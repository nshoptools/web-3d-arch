import assert from 'node:assert/strict';
export async function runMultiTab({context,origin,backend}){
  const results=[];
  async function test(name,fn){
    const start=Date.now();const pages=[];
    const page=async()=>{const p=await context.newPage();pages.push(p);await p.goto(origin+'/harness.html');await p.waitForFunction(()=>globalThis.testAPI?.ready);return p;};
    try{const details=await fn(page);results.push({name,status:details?.capability==='unsupported'?'unavailable':'pass',durationMs:Date.now()-start,details});}
    catch(error){results.push({name,status:'fail',durationMs:Date.now()-start,error:{message:error.message,stack:error.stack}});}
    finally{for(const p of pages)if(!p.isClosed())await p.close();}
  }
  await test('twoTabsCASRetainsBothCopies',async page=>{
    const a=await page(),b=await page(),userId='race-'+crypto.randomUUID();
    for(const p of [a,b])await p.evaluate(async({backend,userId})=>{
      globalThis.f=await testAPI.fixture(backend,{userId,checkpoint:async name=>{
        if(name==='manifest.staged'){globalThis.reached=true;await new Promise(r=>globalThis.releaseGate=r);}
      }});
    },{backend,userId});
    for(const [n,p]of [a,b].entries())await p.evaluate(n=>{
      globalThis.pending=f.store.commit(testAPI.input('p',0,{text:'candidate-'+n,transactionId:'race-'+n}))
        .then(value=>({ok:true,value}),error=>({ok:false,code:error.code,details:error.details}));
    },n);
    await Promise.all([a,b].map(p=>p.waitForFunction(()=>globalThis.reached)));
    await Promise.all([a,b].map(p=>p.evaluate(()=>releaseGate())));
    const outcomes=await Promise.all([a,b].map(p=>p.evaluate(()=>pending)));
    assert.equal(outcomes.filter(o=>o.ok).length,1);assert.equal(outcomes.filter(o=>o.code==='CONFLICT').length,1);
    const loser=[a,b][outcomes.findIndex(o=>!o.ok)];
    const retained=await loser.evaluate(async()=>{
      const pending=await f.store.pendingTransactions({projectId:'p'});testAPI.equal(pending.length,1);
      const rescue=await testAPI.storage.exportRescuePackage(f.store,'p',{transactionId:pending[0].id});
      const verified=await testAPI.storage.inspectRescuePackage(rescue.bytes);testAPI.equal(verified.status,'importable');
      testAPI.equal(rescue.metadata.selectedManifestHash,pending[0].manifestHash);
      await f.store.cleanup();const before=await testAPI.rows(f,'objects');testAPI.equal(before.length,2);
      await f.store.discardPending(pending[0].id);testAPI.equal((await testAPI.rows(f,'objects')).length,1);
      testAPI.equal((await f.store.load('p')).head.revision,1);
      return {loserCandidateRescue:true,noSilentLWW:true,headRevision:1};
    });
    return {...retained,outcomes:outcomes.map(o=>({ok:o.ok,code:o.code??null}))};
  });
  await test('webLockBusyAndHandover',async page=>{
    const a=await page(),b=await page(),userId='locks-'+crypto.randomUUID();
    for(const p of [a,b])await p.evaluate(async({backend,userId})=>{
      globalThis.f=await testAPI.fixture(backend,{userId,policy:{coordination:'web-locks'}});
    },{backend,userId});
    const supported=await a.evaluate(()=>f.store.capabilities.locks.status==='supported');
    if(!supported)return {capability:'unsupported',assertionsPerformed:false};
    await a.evaluate(()=>{
      globalThis.holding=f.store.withWriter('p',async()=>{globalThis.reached=true;await new Promise(r=>globalThis.releaseGate=r);});
    });
    await a.waitForFunction(()=>globalThis.reached);
    const code=await b.evaluate(async()=>{const error=await testAPI.rejects(()=>f.store.commit(testAPI.input('p',0)),['WRITER_BUSY']);return error.code;});
    assert.equal(code,'WRITER_BUSY');
    await a.evaluate(async()=>{releaseGate();await holding;});
    const result=await b.evaluate(async()=>{await f.store.commit(testAPI.input('p',0));return (await f.store.load('p')).head.revision;});
    assert.equal(result,1);return {capability:'supported',handover:true,CASStillRequired:true};
  });
  await test('authVersionAndLogoutFenceLateWriter',async page=>{
    const outcomes=[];
    for(const mode of ['auth-version','logout']){
      const a=await page(),b=await page(),userId='fence-'+crypto.randomUUID();
      await a.evaluate(async({backend,userId})=>{
        globalThis.f=await testAPI.fixture(backend,{userId,checkpoint:async name=>{
          if(name==='publish.before-transaction'){globalThis.reached=true;await new Promise(r=>globalThis.releaseGate=r);}
        }});
        globalThis.pending=f.store.commit(testAPI.input('p',0)).then(()=>({ok:true}),error=>({ok:false,code:error.code}));
      },{backend,userId});
      await a.waitForFunction(()=>globalThis.reached);
      await b.evaluate(async({backend,userId})=>{globalThis.f=await testAPI.fixture(backend,{userId});},{backend,userId});
      if(mode==='auth-version')await b.evaluate(()=>f.store.unlock({...f.lease,authVersion:2}));
      else await a.evaluate(()=>f.store.lock());
      await a.evaluate(()=>releaseGate());
      const outcome=await a.evaluate(()=>pending);assert.equal(outcome.ok,false);assert.equal(outcome.code,mode==='auth-version'?'AUTH_VERSION':'ABORTED');
      assert.equal(await b.evaluate(async()=>(await f.store.load('p')).status),'empty');
      await b.evaluate(()=>f.store.commit(testAPI.input('p',0,{text:'new authorized writer'})));
      outcomes.push({mode,lateResult:outcome});
    }
    return outcomes;
  });
  for(const point of ['asset.written','head.committed'])await test('pageCloseAt-'+point,async page=>{
    const a=await page(),b=await page(),userId='close-'+crypto.randomUUID();
    await a.evaluate(async({backend,userId,point})=>{
      globalThis.armed=false;globalThis.f=await testAPI.fixture(backend,{userId,checkpoint:async name=>{
        if(armed&&name===point){globalThis.reached=true;await new Promise(()=>{});}
      }});
      await f.store.commit(testAPI.input('p',0,{text:'before-close'}));globalThis.armed=true;
      globalThis.pending=f.store.commit(testAPI.input('p',1,{text:'after-close',transactionId:'closing-tx'})).catch(()=>{});
    },{backend,userId,point});
    await a.waitForFunction(()=>globalThis.reached);await a.close();
    const result=await b.evaluate(async({backend,userId})=>{
      const f=await testAPI.fixture(backend,{userId});const loaded=await f.store.load('p');
      return {status:loaded.status,revision:loaded.head.revision,source:new TextDecoder().decode(loaded.assets[0].bytes)};
    },{backend,userId});
    assert.equal(result.status,'editable');assert.equal(result.revision,point==='head.committed'?2:1);
    return {...result,controlledPageClose:true,processOrPowerLossProof:false};
  });
  return results;
}
