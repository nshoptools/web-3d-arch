import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),repo=fs.realpathSync(process.env.PROJECT_ROOT),kind=process.argv[2]??'native',tag=process.argv[3]??'baseline';
const borrowed=process.env.CURVED_BORROW_ROOT??(fs.existsSync(path.join(run,'work/root-borrow'))?path.join(run,'work/root-borrow'):repo);
const {readProductSemantics}=await import(pathToFileURL(path.join(borrowed,'src/core/product-operations.mjs')));
const corpusName=process.env.CURVED_CORPUS??'corpus';
if(!/^[\w.-]+$/.test(tag)||!/^[\w.-]+$/.test(corpusName))throw Error('Output/corpus name');
const corpus=path.join(run,'inputs',corpusName),out=path.join(run,'evidence',tag);fs.mkdirSync(out,{recursive:true});
const exe=process.env.ARCH_CURVED_BINARY??(kind==='native'?path.join(run,'work/build-native/Release/curved_fixture.exe'):path.join(run,'work/build-wasm/curved_fixture.js'));
const ids=fs.readdirSync(corpus).filter(x=>x.endsWith('.aprq')).map(x=>x.slice(0,-5)).filter(x=>!process.env.CURVED_FILTER||new RegExp(process.env.CURVED_FILTER).test(x));
const summary=[];
for(const id of ids){
 const started=performance.now(),args=[path.join(corpus,id+'.arch'),path.join(corpus,id+'.aprq'),path.join(out,id)];
 const r=spawnSync(kind==='native'?exe:process.execPath,kind==='native'?args:[exe,...args],{encoding:'utf8',timeout:180000,maxBuffer:1048576});
 if(r.status!==0)throw Error(id+': '+r.error+' '+r.stderr);const b=new Uint8Array(fs.readFileSync(path.join(out,id+'.apms'))),m=readProductSemantics(b);
 const d=new DataView(b.buffer),table=t=>m.tables.get(t),rt=table(24),pt=table(25),st=table(21);
 const rings=Array.from({length:rt.count},(_,i)=>{const at=rt.offset+16*i,start=d.getUint32(at,true),count=d.getUint32(at+4,true);return Array.from({length:count},(_,j)=>[d.getBigInt64(pt.offset+16*(start+j),true),d.getBigInt64(pt.offset+16*(start+j)+8,true)]);});
 const slabs=Array.from({length:st.count},(_,i)=>{const at=st.offset+72*i;return {ringStart:d.getUint32(at,true),ringCount:d.getUint32(at+4,true),kind:d.getUint32(at+12,true),lo:d.getFloat64(at+32,true),hi:d.getFloat64(at+40,true)};});
 const footprint=rings.slice(0,Math.min(...slabs.map(s=>s.ringStart))),param=n=>m.parameters.find(p=>p.field===n)?.value;
 const area2=r=>r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0n),sum=rs=>rs.reduce((a,r)=>a+area2(r),0n);
 const first=Math.min(...slabs.flatMap(s=>[s.lo,s.hi]).filter(z=>z>0));
 const bottom=slabs.filter(s=>s.kind<2&&s.lo<first/2&&s.hi>first/2).flatMap(s=>rings.slice(s.ringStart,s.ringStart+s.ringCount));
 const ledger=new Map();const add=(rs,sign)=>{for(const r of rs)for(let i=0;i<r.length;i++){const a=r[i].join(','),b=r[(i+1)%r.length].join(','),key=a<b?a+'|'+b:b+'|'+a;ledger.set(key,(ledger.get(key)??0)+(a<b?sign:-sign));}};add(bottom,1);add(footprint,-1);
 const phi=param('strapAngle')*Math.PI/180,tx=-Math.sin(phi),ty=Math.cos(phi),umax=param('strapD')/2+param('strapCham')+(param('strapSlotDir')===0?param('strapSlot')/2:0);
 let active=0;for(const r of footprint)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],ua=Number(a[0])*tx/1e6+Number(a[1])*ty/1e6-param('strapOff'),ub=Number(b[0])*tx/1e6+Number(b[1])*ty/1e6-param('strapOff');if(Math.min(umax,Math.max(ua,ub))-Math.max(-umax,Math.min(ua,ub))>=2e-6)active++;}
 const row={id,ms:performance.now()-started,sourceVerdict:m.sourceVerdict,mechanicsVerdict:m.mechanicsVerdict,blocked:m.exportBlocked,diagnostics:[...m.sourceDiagnostics,...m.diagnostics].filter(x=>x.code<100).map(x=>x.message),parts:m.parts.length,sourcePoints:pt.count,footprintEdges:footprint.reduce((a,r)=>a+r.length,0),outerEdges:footprint.filter(r=>area2(r)>0n).reduce((a,r)=>a+r.length,0),activeMouthEdges:active,bottomAreaDifferenceMm2:Number(sum(bottom)-sum(footprint))/2e12,bottomBoundaryResiduals:[...ledger.values()].filter(x=>x!==0).length};
 summary.push(row);console.log(JSON.stringify(row));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
}
if(!summary.length)throw Error('Empty case selection');
process.exitCode=summary.some(x=>x.sourceVerdict||x.mechanicsVerdict||x.blocked)?1:0;
