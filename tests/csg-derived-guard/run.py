"""Small actual native/Node-WASM CSG + trusted derived-guard ABI regression."""
import os,sys,json,pathlib,hashlib,subprocess,struct,importlib.util,math
from fractions import Fraction as F
HERE=pathlib.Path(__file__).resolve().parent
RUN=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
ROOT=pathlib.Path(os.environ['PROJECT_ROOT']).resolve()
assert RUN.is_relative_to(ROOT) and RUN!=ROOT
assert len(sys.argv)==5, 'run.py native|wasm baseline|fixed binary tag'
target,phase,binary,tag=sys.argv[1:]
assert target in ('native','wasm') and phase in ('baseline','fixed')
assert tag.replace('-','').isalnum()
binary=pathlib.Path(binary).resolve();assert binary.is_relative_to(RUN)
out=RUN/'evidence'/tag;out.mkdir(exist_ok=False)
spec=importlib.util.spec_from_file_location('mesh_audit',HERE/'mesh-audit.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def mesh(p):
 b=p.read_bytes();nv,nf,np=struct.unpack_from('<3I',b)
 assert np>0 and len(b)==12+24*nv+12*nf
 v=[struct.unpack_from('<3d',b,12+24*i) for i in range(nv)]
 f=[struct.unpack_from('<3I',b,12+24*nv+12*i) for i in range(nf)]
 assert all(math.isfinite(x) for p in v for x in p)
 assert all(len(set(p))==3 and max(p)<nv for p in f)
 # Exact oriented edge incidence of the emitted indexed surfaces, including islands.
 from collections import Counter
 edges=Counter((a,b) for t in f for a,b in zip(t,t[1:]+t[:1]))
 assert all(n==1 and edges[b,a]==1 for (a,b),n in edges.items())
 return v,f
positive=['strap-unchanged','strap-separate','strap-safe-side-cut','strap-positive-roof','lego-unchanged','lego-positive-roof']
negative=['strap-slit','strap-parallel-wall','strap-plug','lego-slit']
controls=[] if phase=='baseline' else ['strap-cancel','strap-stale','strap-limit','strap-bad-abi']
report={'version':'arch-csg-derived-guard-tests/1','phase':phase,'target':target,'binary':{'path':str(binary),'sha256':sha(binary)},'scope':'Actual pinned Manifold CSG and public trusted derived-guard native ABI. No root/browser/producer proof. Actual pinned native run/face ancestry; not a root/controller test.','cases':[]}
if target=='wasm':report['wasmSha256']=sha(binary.with_suffix('.wasm'))
for name in positive+negative+controls:
 cmd=([str(binary)] if target=='native' else ['node',str(binary)])+[name,str(out/name)]
 r=subprocess.run(cmd,cwd=RUN,capture_output=True,timeout=100)
 (out/(name+'.log')).write_bytes(r.stdout+r.stderr)
 assert r.returncode==0,(name,r.stderr.decode(errors='replace'))
 m=json.loads((out/(name+'.json')).read_text());assert m['inputUnchanged']
 assert m['resultVertices']==0 and m['resultTriangles']==0
 assert 0<m['guardCharge']<=128*1024*1024
 accepts=name in positive or (phase=='baseline' and name=='strap-parallel-wall')
 assert (m['verdict']==0)==accepts,(name,m)
 assert bool(m['exportBlocked']) != accepts
 if phase=='fixed' and name in ('strap-slit','strap-parallel-wall','strap-plug'):
  assert 'DERIVED_TUNNEL_BOUNDARY_UNVERIFIED' in m['diagnostics']
 if phase=='fixed' and name=='lego-slit':
  assert any('DERIVED_CAVITY_ROOF_UNVERIFIED' in d for d in m['diagnostics'])
 before=mesh(out/(name+'.before.bin'));after=mesh(out/(name+'.after.bin'))
 row={'id':name,'pass':True,'exit':r.returncode,'command':cmd,'verdict':m['verdict'],'diagnostics':m['diagnostics'],'inputUnchanged':True,'beforeSha256':sha(out/(name+'.before.bin')),'afterSha256':sha(out/(name+'.after.bin'))}
 if name=='strap-parallel-wall':
  old=audit.exact_ray(*before,1,F(3),F(123,1000));now=audit.exact_ray(*after,1,F(3),F(123,1000))
  adjacent=audit.exact_ray(*after,1,F(3),F(10123,1000))
  assert old==[F(-15),F(-2),F(2),F(15)] and now==[F(-15),F(-2)] and adjacent==old
  row.update(exactBeforeY=list(map(str,old)),exactAfterY=list(map(str,now)),exactAdjacentY=list(map(str,adjacent)))
 if name in ('strap-slit','strap-positive-roof','lego-slit','lego-positive-roof'):
  old=audit.exact_z_hits(*before,F(680001,1000000),F(17,1000));now=audit.exact_z_hits(*after,F(680001,1000000),F(17,1000))
  assert len(now)>=len(old),(name,old,now)
  if name.endswith('positive-roof'):
   assert len(now)==len(old)+2 and any(abs(float(v)-5.9)<1e-12 for v in now)
  else:
   # The sub-resolution CSG returns additional represented contact/internal
   # facets on this ray. The initial ideal-cut ray assertion failed on BOTH
   # baseline and fixed, and remains negative evidence. Do not qualify that
   # mesh as a clean slit or turn each unoriented hit into a solid interval.
   assert old==([F(0),F(1),F(5),F(6)] if name.startswith('strap') else [F(3),F(6)])
   assert now!=old and len(now)>len(old) and now[-1]==F(6)
   assert any(abs(float(v)-5.9)<1e-12 for v in now)
   row['rawGeometryQualification']='Unverified sub-resolution CSG: extra exact ray crossings; ideal-cut oracle failed and is retained separately. Typed refusal required.'
  row.update(exactBeforeZ=list(map(str,old)),exactAfterZ=list(map(str,now)))
  if phase=='baseline' and name.endswith('slit'):
   # Baseline later datum-facet gate blocks publication despite its earlier
   # positive clearance feature. Do not label this an end-to-end acceptance.
   assert any('DERIVED_SOURCE_DATUM_FACE_UNPROVED' in d for d in m['diagnostics'])
   assert m['features'] and any(f['dimensions'][1 if name.startswith('strap') else 2]>0 for f in m['features'])
   row['baselineScope']='Earlier positive clearance, then final facet refusal; not a published baseline slit.'
 if phase=='fixed':assert not any('CONDITIONAL_RESOLUTION' in d or 'CONDITIONAL_FACE_ENVELOPE' in d for d in m['diagnostics'])
 report['cases'].append(row)
 (out/'summary.json').write_text(json.dumps(report,indent=2)+'\n')
 print(name+': PASS ('+str(m['verdict'])+')',flush=True)
print(str(len(report['cases']))+'/'+str(len(positive+negative+controls))+' PASS',flush=True)
