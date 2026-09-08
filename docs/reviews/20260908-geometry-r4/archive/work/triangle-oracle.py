import os,json,random,subprocess,hashlib,time
from pathlib import Path
from fractions import Fraction as F
room=Path(os.environ['PROJECT_REVIEW_RUN']); exe=room/'work/math-probe/target/debug/geometry-review-math-probe.exe'
sub=lambda a,b:tuple(x-y for x,y in zip(a,b))
dot=lambda a,b:sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def normal(t): return cross(sub(t[1],t[0]),sub(t[2],t[0]))
def axes(t):
 n=normal(t); k=max(range(3),key=lambda k:abs(n[k]));return tuple(j for j in range(3) if j!=k)
def o2(a,b,p,xy):
 x,y=xy;return (b[x]-a[x])*(p[y]-a[y])-(b[y]-a[y])*(p[x]-a[x])
def inside(p,t):
 xy=axes(t); q=[o2(t[i],t[(i+1)%3],p,xy) for i in range(3)];return all(x>=0 for x in q) or all(x<=0 for x in q)
def interpolate(a,b,t):return tuple(x+t*(y-x) for x,y in zip(a,b))
def clip_segment(p,q,t):
 xy=axes(t); orient=1 if o2(*t,xy)>0 else -1;lo,hi=F(0),F(1)
 for i in range(3):
  a=orient*o2(t[i],t[(i+1)%3],p,xy); b=orient*o2(t[i],t[(i+1)%3],q,xy); d=b-a
  if d==0:
   if a<0:return []
  elif d>0:lo=max(lo,F(-a,d))
  else:hi=min(hi,F(-a,d))
 if lo>hi:return []
 return [interpolate(p,q,lo),interpolate(p,q,hi)]
def intersections(a,b):
 na,nb=normal(a),normal(b)
 if cross(na,nb)==(0,0,0):
  if dot(na,sub(b[0],a[0])):return []
  xy=axes(b);sign=1 if o2(*b,xy)>0 else -1;poly=list(a)
  for i in range(3):
   old=poly;poly=[]
   if not old:break
   for j,p in enumerate(old):
    q=old[(j+1)%len(old)];dp=sign*o2(b[i],b[(i+1)%3],p,xy);dq=sign*o2(b[i],b[(i+1)%3],q,xy)
    if dp>=0:poly.append(p)
    if (dp<0)!=(dq<0):poly.append(interpolate(p,q,F(dp,dp-dq)))
  return poly
 points=[]
 for s,t in ((a,b),(b,a)):
  n=normal(t)
  for i,p in enumerate(s):
   q=s[(i+1)%3];dp=dot(n,sub(p,t[0]));dq=dot(n,sub(q,t[0]))
   if dp==0 and inside(p,t):points.append(p)
   if dp==0 and dq==0:points.extend(clip_segment(p,q,t))
   elif dp*dq<0:
    x=interpolate(p,q,F(dp,dp-dq))
    if inside(x,t):points.append(x)
 return points
def expected(v,a,b):
 ps=intersections([v[i] for i in a],[v[i] for i in b]);shared=set(a)&set(b)
 if not shared:return bool(ps)
 if len(shared)==1:return any(p!=v[next(iter(shared))] for p in ps)
 u,w=[v[i] for i in shared]
 return any(cross(sub(p,u),sub(w,u))!=(0,0,0) or dot(sub(p,u),sub(p,w))>0 for p in ps)
rng=random.Random(20260908);proc=subprocess.Popen([str(exe)],cwd=str(room/'work/math-probe'),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
counts={};mismatch=[];start=time.time();corpus=room/'work/triangle-corpus.jsonl';ch=hashlib.sha256()
with corpus.open('w',encoding='utf8',newline='\n') as f:
 for coplanar in (False,True):
  for common in range(3):
   for index in range(4000):
    while True:
     v=[]
     for i in range(6-common):
      while True:
       p=tuple(rng.randrange(-5,6) if k!=2 or not coplanar else 0 for k in range(3))
       if p not in v:break
      v.append(p)
     a=[0,1,2];b=list(range(common))+list(range(3,6-common))
     if normal([v[i] for i in a])!=(0,0,0) and normal([v[i] for i in b])!=(0,0,0):break
    # Exercise both input winding orders, axis permutations, and bounded large integers.
    rng.shuffle(a);rng.shuffle(b)
    if index%4==0:
     scale=[2**rng.randrange(0,30) for _ in range(3)];shift=[rng.randrange(-3,4)*2**34 for _ in range(3)]
     v=[tuple(p[k]*scale[k]+shift[k] for k in range(3)) for p in v]
    want=expected(v,a,b);case={'v':v,'a':a,'b':b};line=json.dumps(case,separators=(',',':'));f.write(line+'\n');ch.update((line+'\n').encode());proc.stdin.write(line+'\n');proc.stdin.flush();raw=proc.stdout.readline()
    if not raw:raise RuntimeError(proc.stderr.read())
    got=json.loads(raw);key=f'coplanar={coplanar},shared={common}';counts[key]=counts.get(key,0)+1
    if got.get('intersect')!=want:
     mismatch.append({'case':case,'expected':want,'observed':got,'index':index,'category':key})
     if len(mismatch)>=10:break
   if len(mismatch)>=10:break
  if len(mismatch)>=10:break
proc.stdin.close();proc.wait(timeout=15)
result={'seed':20260908,'oracle':'Independent Python Fraction polygon half-plane clipping and segment/plane intersection; excludes permitted shared simplex','cases':sum(counts.values()),'categories':counts,'mismatches':mismatch,'elapsedSeconds':time.time()-start,'corpus':'work/triangle-corpus.jsonl','corpusSha256':ch.hexdigest(),'probeUses':'Unmodified captured encode.rs and wire.rs; standalone harness has no native CSG/root lifecycle and stubs cancellation for pure mathematical calls','exitCode':proc.returncode}
(room/'evidence/triangle-oracle.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result,indent=2))
