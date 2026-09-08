import fs from 'node:fs';
const b=fs.readFileSync(process.argv[2]),d=new DataView(b.buffer,b.byteOffset,b.byteLength),u=o=>d.getUint32(o,true),f=o=>d.getFloat64(o,true),tables=new Map();
for(let i=0;i<u(12);i++){const a=256+16*i;tables.set(u(a),{stride:u(a+4),count:u(a+8),at:u(a+12)});}
const rt=tables.get(24),pt=tables.get(25),st=tables.get(21),rings=Array.from({length:rt.count},(_,i)=>Array.from({length:u(rt.at+16*i+4)},(_,j)=>{const a=pt.at+16*(u(rt.at+16*i)+j);return [d.getBigInt64(a,true),d.getBigInt64(a+8,true)];})),slabs=Array.from({length:st.count},(_,i)=>{const a=st.at+72*i;return {start:u(a),count:u(a+4),lo:f(a+32),hi:f(a+40)};});
const ledger=new Map(),add=(rs,s)=>{for(const r of rs)for(let i=0;i<r.length;i++){const a=r[i].join(','),b=r[(i+1)%r.length].join(','),k=a<b?a+'|'+b:b+'|'+a;ledger.set(k,(ledger.get(k)??0)+(a<b?s:-s));}};
add(rings.slice(0,Math.min(...slabs.map(s=>s.start))),-1);for(const s of slabs)if(s.lo===0)add(rings.slice(s.start,s.start+s.count),1);
console.log(slabs);console.log([...ledger].filter(([k,v])=>v!==0));
const diag=tables.get(5);for(let i=0;i<diag.count;i++)console.log(b.subarray(diag.at+i*200+8,diag.at+(i+1)*200).toString().split('\0')[0]);
