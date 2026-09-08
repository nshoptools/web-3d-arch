import assert from 'node:assert/strict';
export function area2(p){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+BigInt(a[0])*BigInt(b[1])-BigInt(a[1])*BigInt(b[0]);},0n);}
// Exact squared point-to-finite-segment distance as integer numerator / denominator.
// All decisions use BigInt; this oracle has no kernel, Clipper or Manifold import.
export function distance2(a,b,p){
 const [dx,dy]=b.map((x,i)=>BigInt(x)-BigInt(a[i])),[qx,qy]=p.map((x,i)=>BigInt(x)-BigInt(a[i]));const den=dx*dx+dy*dy,dot=qx*dx+qy*dy;
 assert.ok(den>0n,'nonzero chord');if(dot<=0n)return [qx*qx+qy*qy,1n];if(dot>=den){const x=qx-dx,y=qy-dy;return [x*x+y*y,1n];}const cross=qx*dy-qy*dx;return [cross*cross,den];
}
export function auditChain(original,result,limit){
 const at=new Map(original.map((p,i)=>[p.join(','),i]));assert.equal(at.size,original.length);assert.ok(result.length>=3);let checks=0,max2=[0n,1n],worst=null,travel=0;
 for(let i=0;i<result.length;i++){
  const a=result[i],b=result[(i+1)%result.length],begin=at.get(a.join(',')),end=at.get(b.join(','));assert.ok(begin!==undefined&&end!==undefined,'only original vertices');
  for(let j=begin;j!==end;j=(j+1)%original.length){assert.ok(++travel<=original.length,'original cyclic order traversed once');const pair=distance2(a,b,original[j]);checks++;
   if(pair[0]*max2[1]>max2[0]*pair[1]){max2=pair;worst={a,b,point:original[j],index:j,begin,end};}
   if(limit!==undefined)assert.ok(pair[0]<=BigInt(limit*limit)*pair[1],'exact finite-chord bound');
  }
 }
 assert.equal(travel,original.length);assert.equal(area2(result)>0n,area2(original)>0n,'winding preserved');
 return {checks,maxGrid:Math.sqrt(Number(max2[0])/Number(max2[1])),worst,vertices:result.length};
}
