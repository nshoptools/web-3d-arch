"""Focused exact-byte controller fixture and native child guard regression.
No controller/root/backend qualification; derived geometry is independently
observed with rational rays, signed volume and oriented edge incidence.
"""
import os,sys,json,pathlib,hashlib,subprocess,struct,math,importlib.util
from fractions import Fraction as F
from collections import Counter
HERE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path(os.environ['PROJECT_ROOT']).resolve()
RUN=pathlib.Path(os.environ['PROJECT_REVIEW_RUN']).resolve()
assert RUN.is_relative_to(ROOT) and RUN!=ROOT
assert len(sys.argv)==5,'closure.py native|wasm baseline|contact|fixed binary tag'
target,phase,binary,tag=sys.argv[1:]
assert target in ('native','wasm') and phase in ('baseline','contact','fixed')
assert tag.replace('-','').isalnum()
binary=pathlib.Path(binary).resolve();assert binary.is_relative_to(RUN)
out=RUN/'evidence'/tag;out.mkdir(exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('audit',HERE/'mesh-audit.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
def mesh(p):
 b=p.read_bytes();nv,nf,np=struct.unpack_from('<3I',b)
 assert nv<=100000 and nf<=200000 and 0<np<=4 and len(b)==12+nv*24+nf*12
 vs=[struct.unpack_from('<3d',b,12+i*24) for i in range(nv)]
 ts=[struct.unpack_from('<3I',b,12+nv*24+i*12) for i in range(nf)]
 assert all(math.isfinite(x) for v in vs for x in v)
 edges=Counter()
 volume=F(0)
 for t in ts:
  assert len(set(t))==3 and max(t)<nv
  a,b,c=[tuple(F(x) for x in vs[i]) for i in t]
  area=audit.cross(audit.sub(b,a),audit.sub(c,a))
  assert any(area),'exact nonzero represented area'
  volume+=audit.dot(a,audit.cross(b,c))/6
  edges.update(zip(t,t[1:]+t[:1]))
 assert all(n==1 and edges[b,a]==1 for (a,b),n in edges.items())
 return vs,ts,volume
positive=['actual-unchanged','actual-cut','contact-plane','contact-edge','contact-point']
negative=['actual-top-removed','actual-missing-source','actual-mechanical-cut','actual-foreign-datum','actual-wrong-owner','actual-wrong-material','contact-overlap']
cases=positive+negative if phase=='fixed' else ['actual-unchanged','actual-cut']
report={'version':'arch-csg-guard-closure-tests/1','target':target,'phase':phase,
 'scope':'Child trusted native CABI; actual captured controller model+ASCII cutter, no root/controller replay.',
 'binary':{'path':str(binary),'sha256':sha(binary)},'fixtures':{},'cases':[]}
for p in sorted((HERE/'fixtures').iterdir()):report['fixtures'][p.name]={'bytes':p.stat().st_size,'sha256':sha(p)}
if target=='wasm':report['wasmSha256']=sha(binary.with_suffix('.wasm'))
cut=json.loads((HERE/'fixtures/controller-metadata.json').read_text())['cut']['bounds']
x=(F(cut['min'][0])+F(cut['max'][0]))/2;y=(F(cut['min'][1])+F(cut['max'][1]))/2
for name in cases:
 cmd=([str(binary)] if target=='native' else ['node',str(binary)])+[name,str(out/name),str(HERE/'fixtures/controller-original.arch')]
 p=subprocess.run(cmd,cwd=RUN,capture_output=True,timeout=60)
 (out/(name+'.log')).write_bytes(p.stdout+p.stderr)
 assert p.returncode==0,(name,p.stderr.decode(errors='replace'))
 m=json.loads((out/(name+'.json')).read_text())
 accepts=name in positive if phase=='fixed' else phase=='contact' and name=='actual-unchanged'
 assert (m['verdict']==0)==accepts,(name,m)
 assert bool(m['exportBlocked'])!=accepts
 assert m['inputUnchanged'] and m['resultVertices']==m['resultTriangles']==0 and 0<m['guardCharge']<=128*1024*1024
 expected=None
 if phase=='baseline' or name=='contact-overlap':expected='DERIVED_MANUFACTURING_COLLISION_UNVERIFIED'
 elif phase=='contact' and name=='actual-cut':expected='DERIVED_SOURCE_DATUM_FACE_UNPROVED'
 elif name=='actual-mechanical-cut':expected='DERIVED_MECHANICAL_FEATURE_CHANGED'
 elif name in negative:expected='DERIVED_SOURCE_DATUM_FACE_UNPROVED'
 if expected:assert expected in m['diagnostics'],(name,m)
 old=mesh(out/(name+'.before.bin'));new=mesh(out/(name+'.after.bin'))
 row={**m,'pass':True,'exit':p.returncode,'command':cmd,
      'beforeSha256':sha(out/(name+'.before.bin')),'afterSha256':sha(out/(name+'.after.bin')),
      'exactSignedVolumeBefore':str(old[2]),'exactSignedVolumeAfter':str(new[2]),
      'vertices':len(new[0]),'triangles':len(new[1])}
 if name=='actual-cut':
  before=audit.exact_z_hits(old[0],old[1],x,y);after=audit.exact_z_hits(new[0],new[1],x,y)
  adjacent=audit.exact_z_hits(new[0],new[1],x-F(3,10),y)
  assert before==[F(0),F(2.4)] and after==[] and adjacent==before
  assert m['changedCapTriangles']>0 and new[2]<old[2]
  wanted=(F(cut['max'][0])-F(cut['min'][0]))*(F(cut['max'][1])-F(cut['min'][1]))*F(2.4)
  # Comparison is an observed fixture result, never a native volume-epsilon gate.
  error=(old[2]-new[2])-wanted
  row.update(exactBeforeZ=list(map(str,before)),exactAfterZ=list(map(str,after)),
             exactAdjacentZ=list(map(str,adjacent)),analyticRemovedMm3=str(wanted),
             exactVolumeResidualMm3=str(error),volumeResidualApproxMm3=float(error))
  assert abs(error)<F(1,10**9),'fixture analytic volume observation >1e-9 mm3'
 if name=='actual-top-removed':
  assert audit.exact_z_hits(new[0],new[1],x,y)==[F(0),F(2.3)]
 if name=='actual-missing-source':assert audit.exact_z_hits(new[0],new[1],x,y)==[]
 if name.startswith('contact-'):
  assert old[2]==F(2)
  # Binary64 translation rounds each endpoint independently. The positive
  # overlap control's exact represented height is not rational1 after shift.
  expected_new=F(1)+F(2.0-.00001)-F(1.0-.00001) if name=='contact-overlap' else F(2)
  assert new[2]==expected_new,(name,new[2],expected_new)
 report['cases'].append(row)
 (out/'summary.json').write_text(json.dumps(report,indent=2)+'\n')
 print(name+': PASS ('+str(m['verdict'])+')',flush=True)
print(str(len(cases))+'/'+str(len(cases))+' PASS',flush=True)

