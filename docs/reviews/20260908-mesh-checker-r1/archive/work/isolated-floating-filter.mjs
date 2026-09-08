function floatPlane(t,p){
 const a=t[0].map((v,i)=>v-p[i]),b=t[1].map((v,i)=>v-p[i]),c=t[2].map((v,i)=>v-p[i]);
 const terms=[a[0]*b[1]*c[2],a[1]*b[2]*c[0],a[2]*b[0]*c[1],a[2]*b[1]*c[0],a[1]*b[0]*c[2],a[0]*b[2]*c[1]];
 const det=terms[0]+terms[1]+terms[2]-terms[3]-terms[4]-terms[5],permanent=terms.reduce((s,v)=>s+Math.abs(v),0);
 // This filter only excludes well-separated planes. Subnormal arithmetic may
 // violate relative-error bounds, so small/nonfinite values take the exact path.
 if(!Number.isFinite(permanent)||permanent<2**-900)return 0;
 const err=permanent*Number.EPSILON*128;
 return Math.abs(det)>err?Math.sign(det):0;
}
const separated=(a,b)=>{const signs=b.map(p=>floatPlane(a,p));return signs.every(s=>s===1)||signs.every(s=>s===-1);};

export {floatPlane,separated};
