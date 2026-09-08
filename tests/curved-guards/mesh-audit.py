import struct,math,json,collections
from fractions import Fraction as F
from pathlib import Path
def mesh(path):
 b=Path(path).read_bytes();h=struct.unpack_from('<32I',b);assert h[0]==0x48435241 and h[1]==1 and h[3]==len(b)
 vs=[struct.unpack_from('<3d',b,h[12]+24*i) for i in range(h[5])];fs=[struct.unpack_from('<3I',b,h[13]+12*i) for i in range(h[6])];ps=[struct.unpack_from('<8Id',b,h[14]+40*i) for i in range(h[7])];return vs,fs,ps
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def inspect(vs,fs,ps):
 out=[]
 for p in ps:
  start,nv,begin,nf=p[:4];vertices=vs[start:start+nv];faces=fs[begin:begin+nf];edges=collections.defaultdict(list);adjs=collections.defaultdict(set);areas=[];vol=[]
  for t,face in enumerate(faces):
   assert all(start<=i<start+nv for i in face);a,b,c=(vs[i] for i in face);normal=cross(sub(b,a),sub(c,a));areas.append(math.hypot(*normal)/2);vol.append(dot(a,cross(b,c))/6)
   for i in range(3):
    u,v=face[i],face[(i+1)%3];edges[tuple(sorted((u,v)))].append((t,1 if u<v else -1));adjs[u].add(v);adjs[v].add(u)
  bad=[(e,x) for e,x in edges.items() if len(x)!=2 or sum(a[1] for a in x)!=0]
  unseen=set(adjs);comp=0
  while unseen:
   comp+=1;stack=[unseen.pop()]
   while stack:
    for j in adjs[stack.pop()]:
     if j in unseen:unseen.remove(j);stack.append(j)
  row={'vertices':nv,'faces':nf,'edges':len(edges),'components':comp,'euler':nv-len(edges)+nf,'boundary_or_orientation_errors':len(bad),'duplicate_coordinate_vertices':nv-len(set(vertices)),'min_face_area':min(areas,default=0),'volume_mm3':math.fsum(vol),'reported_volume_mm3':p[8],'volume_abs_delta':abs(math.fsum(vol)-p[8]),'bbox':[[min(x[k] for x in vertices) for k in range(3)],[max(x[k] for x in vertices) for k in range(3)]]}
  assert not bad and row['min_face_area']>0 and row['volume_mm3']>0;out.append(row)
 return out
def exact_z_hits(vs,fs,x,y):
 # Fractions of actual IEEE doubles: exact arithmetic for this serialized mesh.
 v=[tuple(F(a) for a in p) for p in vs];x=F(x);y=F(y);hits=set()
 def d(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 for face in fs:
  a,b,c=[v[i] for i in face];den=d(a,b,c)
  if den==0:continue
  u=d((x,y),b,c)/den;w=d(a,b,(x,y))/den;t=1-u-w
  if min(u,t,w)>=0:hits.add(u*a[2]+t*b[2]+w*c[2])
 return sorted(hits)
def exact_ray(vs,fs,axis,p,q):
 order=[(axis+1)%3,(axis+2)%3,axis];return exact_z_hits([tuple(x[i] for i in order) for x in vs],fs,p,q)
def area2(ring):return sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(ring,ring[1:]+ring[:1]))
