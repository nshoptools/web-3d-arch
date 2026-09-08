import os,json,math,struct,subprocess,hashlib
from pathlib import Path
from fractions import Fraction as F
room=Path(os.environ['PROJECT_REVIEW_RUN']);exe=room/'work/math-probe/target/debug/geometry-review-math-probe.exe'
base=[(1.,1.,1.),(2.,1.,1.),(1.,2.,1.),(1.,1.,2.)];tetra=[0,2,1,0,1,3,0,3,2,1,2,3]
def subdiv(v,t,a=0,b=1,ratio=2**-30):
 v=list(v);n=len(v);v.append(tuple(v[a][k]+ratio*(v[b][k]-v[a][k]) for k in range(3)));out=[]
 for i in range(0,len(t),3):
  f=t[i:i+3]
  if a in f and b in f:
   j=next(j for j in range(3) if {f[j],f[(j+1)%3]}=={a,b});out.extend([f[j],n,f[(j+2)%3],n,f[(j+1)%3],f[(j+2)%3]])
  else:out.extend(f)
 return v,out
v,t=subdiv(base,tetra)
def merge(v,t,other,ot):return v+other,t+[x+len(v) for x in ot]
def shifted(v,delta,scale=1):return [tuple(1+(p[k]-1)*scale+delta for k in range(3)) for p in v]
cases=[]
def add(name,mesh,want):cases.append({'name':name,'v':[x for p in mesh[0] for x in p],'t':mesh[1],'expected':want})
add('inverse edge subdivision of tetrahedron',(v,t),{'components':1,'euler':[2],'vertices':4,'faces':4})
add('no collision',(base,tetra),'FLOAT_CONDITIONING_NOT_NEEDED')
add('binary32 ties to even',subdiv(base,tetra,ratio=2**-24),{'components':1,'euler':[2],'vertices':4,'faces':4})
vv=list(v);vv[4]=(math.nextafter(1+2**-24,math.inf),1,1);add('just above tie',(vv,t),'FLOAT_CONDITIONING_NOT_NEEDED')
vv=list(v);vv[4]=vv[0];add('exact source alias',(vv,t),'FLOAT_CONDITIONING_SOURCE_ALIAS')
add('three point collision class',subdiv(v,t,0,4,.5),'FLOAT_CONDITIONING_CLUSTER_LIMIT')
vv=list(base);vv[1]=(1+2**-30,1,1);add('tetrahedron forbidden edge',(vv,tetra),'FLOAT_CONDITIONING_LINK_CONDITION')
add('two separated components',merge(v,t,shifted(base,4),tetra),{'components':2,'euler':[2,2],'vertices':8,'faces':8})
add('nested surfaces',merge(v,t,shifted(base,.1,.1),tetra),'FLOAT_CONDITIONING_COMPONENT_RELATION_UNPROVEN')
add('interpenetrating surfaces',merge(v,t,shifted(base,.2),tetra),'FLOAT_CONDITIONING_SELF_INTERSECTION')
add('disjoint surfaces overlapping AABBs',merge(v,t,shifted(base,.4),tetra),'FLOAT_CONDITIONING_COMPONENT_RELATION_UNPROVEN')
add('nonedge collision across components',merge(base,tetra,shifted(base,2**-30),tetra),'FLOAT_CONDITIONING_LINK_CONDITION')
vv=list(v);vv[2]=(2**-149,2.,1.);add('unsupported dyadic exponent span',(vv,t),'FLOAT_CONDITIONING_EXACT_RANGE')
vtor=[];ttor=[];n=8
for i in range(n):
 for j in range(n):
  u,vv=2*math.pi*i/n,2*math.pi*j/n;vtor.append((10+(4+math.cos(vv))*math.cos(u),10+(4+math.cos(vv))*math.sin(u),10+math.sin(vv)))
for i in range(n):
 for j in range(n):
  a=i*n+j;b=((i+1)%n)*n+j;c=((i+1)%n)*n+(j+1)%n;d=i*n+(j+1)%n;ttor.extend([a,b,c,a,c,d])
add('embedded genus one torus with inverse edge subdivision',subdiv(vtor,ttor,0,n),{'components':1,'euler':[0],'vertices':64,'faces':128})
proc=subprocess.Popen([str(exe)],cwd=str(room/'work/math-probe'),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);results=[]
for c in cases:
 proc.stdin.write(json.dumps({'kind':'prepare','v':c['v'],'t':c['t']})+'\n');proc.stdin.flush();line=proc.stdout.readline()
 if not line:raise RuntimeError(proc.stderr.read())
 got=json.loads(line);want=c['expected'];ok=False
 if isinstance(want,str):ok=not got['ok'] and got['error'].startswith(want)
 elif got['ok']:
  m=got['metadata'];ok=len(m['components'])==want['components'] and [x['euler'] for x in m['components']]==want['euler'] and m['candidateVertices']==want['vertices'] and m['candidateTriangles']==want['faces'];bound=F.from_float(m['hausdorffUpperBoundMm']);bound_ok=True
  for i in range(0,len(c['v']),3):
   p=c['v'][i:i+3];q=[struct.unpack('<f',struct.pack('<f',x))[0] for x in p];squared=sum((F.from_float(x)-F.from_float(y))**2 for x,y in zip(p,q));bound_ok &= squared<=bound**2
  ok &= bound_ok;got['exactRationalSquaredDisplacementBound']=bound_ok
 results.append({'name':c['name'],'passed':ok,'expected':want,'observed':got})
proc.stdin.close();proc.wait(timeout=10)
(room/'work/surface-corpus.json').write_text(json.dumps(cases,indent=2),encoding='utf8');result={'passed':all(x['passed'] for x in results),'count':len(results),'results':results,'qualification':'Standalone captured mathematical algorithm only, no CSG/root authority; exact rational squared displacement checks for accepted synthetic meshes'}
(room/'evidence/surface-oracle.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'passed':result['passed'],'count':len(results),'results':[{'name':x['name'],'passed':x['passed'],'result':x['observed'].get('error','accepted')} for x in results]},indent=2))
