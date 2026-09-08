"""Independent exact rational separating-axis oracle for two nondegenerate triangles.
Uses Fraction.from_float, face normals, 9 edge cross products, and coplanar in-plane
edge normals. Strict disjoint projection intervals imply separation; otherwise
the closed convex triangles intersect. No production algorithm is imported.
"""
import json, os, pathlib
from fractions import Fraction as F
root=pathlib.Path(os.environ['PROJECT_REVIEW_RUN'])
source=json.loads((root/'evidence/predicate-corpus.json').read_text())
def subtract(a,b):return tuple(x-y for x,y in zip(a,b))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def overlap(a,b):
    ea=[subtract(a[(i+1)%3],a[i]) for i in range(3)]
    eb=[subtract(b[(i+1)%3],b[i]) for i in range(3)]
    na=cross(ea[0],ea[1]);nb=cross(eb[0],eb[1])
    axes=[na,nb]+[cross(u,v) for u in ea for v in eb]+[cross(na,u) for u in ea]+[cross(nb,v) for v in eb]
    for n in axes:
        aa=[dot(p,n) for p in a];bb=[dot(p,n) for p in b]
        if max(aa)<min(bb) or max(bb)<min(aa):return False
    return True
mismatch=[];unsafe=[];intersecting=0
for i,t in enumerate(source['tests']):
    a=[tuple(F.from_float(float(x)) for x in p) for p in t['a']]
    b=[tuple(F.from_float(float(x)) for x in p) for p in t['b']]
    expected=overlap(a,b);intersecting+=expected
    if expected!=t['intersects']:mismatch.append(dict(index=i,expected=expected,case=t))
    if expected and t['filterSeparated']:unsafe.append(dict(index=i,case=t))
result=dict(seed=source['seed'],pairs=len(source['tests']),intersecting=intersecting,mismatches=mismatch,unsafeFloatingExclusions=unsafe,oracle='Fraction.from_float + exact convex SAT; closed-set intersection')
(root/'evidence/predicate-oracle.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='oracle'},indent=2))
raise SystemExit(1 if mismatch or unsafe else 0)
