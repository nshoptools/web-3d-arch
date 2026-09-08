"""Regenerate checked C++ fixture includes from exact committed metadata/STL.
Test-only decoding of the known12-facet authored ASCII fixture, not a codec.
"""
from pathlib import Path
import json,hashlib
f=Path(__file__).resolve().parent/'fixtures'
raw=json.loads((f/'controller-metadata.json').read_text())
sem=raw['semantics'];desc={'parts':raw['parts']}
def num(n):return repr(float(n))
def arr(a):return '{'+','.join(num(x) for x in a)+'}'
out=['// Generated only from controller-metadata.json by prepare-fixture.py.',
'static void controller_metadata(ArchMechResult& out,ArchMechRequest& q){',
'q.abi_version=2;q.product='+str(sem['product'])+';q.revision='+str(sem['revision'])+';',
'q.source.source_id='+str(sem['sourceId'])+'ull;q.source.provenance_id='+str(sem['provenanceId'])+'ull;',
'q.mating_tolerance_mm='+num(sem['matingToleranceMm'])+';q.export_tolerance_mm='+num(sem['exportToleranceMm'])+';',
'out.revision=q.revision;out.export_blocked='+str(int(sem['exportBlocked']))+';']
for p0 in desc['parts']:
 out.append('{ArchMechPartInfo p{};')
 for cpp,k in [('feature_index','featureIndex'),('role','role'),('slot','slot'),('origin','origin'),('assembly_group','assemblyGroup'),('provenance_id','materialProvenanceId')]:
  out.append('p.'+cpp+'='+str(p0[k])+('ull' if cpp=='provenance_id' else '')+';')
 out.append('const double transform[16]='+arr(p0['previewTransform'])+';std::copy(transform,transform+16,p.preview_transform);out.part_info.push_back(p);}')
for f0 in sem['features']:
 out.append('{ArchMechFeature f{};std::strcpy(f.id,'+json.dumps(f0['id'])+');')
 for cpp,k in [('kind','kind'),('parameter_id','parameterId'),('role','role'),('group','group'),('source_id','sourceId'),('provenance_id','provenanceId')]:
  out.append('f.'+cpp+'='+str(f0[k])+('ull' if cpp.endswith('_id') and cpp!='parameter_id' else '')+';')
 out.append('const double dims[6]='+arr(f0['dimensions'])+';std::copy(dims,dims+6,f.dimensions);out.features.push_back(f);}')
out.append('}\n')
(f/'controller-meta.inc').write_text('\n'.join(out))
# Fixture is authored ASCII STL, no binary32 round-trip.
s=(f/'controller-cut.stl').read_text()
assert s.startswith('solid authored_box') and s.count('endfacet')==12
vertices=[];faces=[]
for line in s.splitlines():
 if line.startswith('vertex '):
  p=tuple(map(float,line.split()[1:]));assert len(p)==3
  if p not in vertices:vertices.append(p)
  faces.append(vertices.index(p))
assert len(faces)==36
assert len(vertices)==8
o=['// Exact parsed binary64 coordinates from the checked authored ASCII STL.',
'static Manifold controller_cutter(){manifold::MeshGL64 m;m.numProp=3;',
'm.vertProperties={'+','.join(repr(x) for p in vertices for x in p)+'};',
'm.triVerts={'+','.join(map(str,faces))+'};m.faceID.resize(m.NumTri());std::iota(m.faceID.begin(),m.faceID.end(),uint64_t(0));\nconst auto id=Manifold::ReserveIDs(1);m.runOriginalID={id};m.runIndex={0,m.triVerts.size()};\nancestry[id]={1,0,0,uint32_t(m.NumTri())};return Manifold(m);}\n']
(f/'controller-cutter.inc').write_text('\n'.join(o))
print('Generated controller includes from checked fixture bytes')
