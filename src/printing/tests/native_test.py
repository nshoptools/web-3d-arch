import ctypes as C,sys,pathlib,json,math,zipfile,io,re
dll=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();inputs=pathlib.Path(sys.argv[3]).resolve()
out.mkdir(parents=True,exist_ok=True)
import os
dll_directory=os.add_dll_directory(str(dll.parent))
lib=C.CDLL(str(dll))
lib.arch3mf_create.restype=C.c_void_p
lib.arch3mf_destroy.argtypes=[C.c_void_p]
lib.arch3mf_error.argtypes=[C.c_void_p];lib.arch3mf_error.restype=C.c_char_p
lib.arch3mf_add_material.argtypes=[C.c_void_p,C.c_char_p,C.c_uint32];lib.arch3mf_add_material.restype=C.c_int32
lib.arch3mf_add_part.argtypes=[C.c_void_p,C.c_char_p,C.POINTER(C.c_double),C.c_uint32,C.POINTER(C.c_uint32),C.c_uint32,C.c_uint32];lib.arch3mf_add_part.restype=C.c_int32
lib.arch3mf_finish.argtypes=[C.c_void_p];lib.arch3mf_finish.restype=C.c_int32
lib.arch3mf_bytes.argtypes=[C.c_void_p];lib.arch3mf_bytes.restype=C.POINTER(C.c_uint8)
lib.arch3mf_size.argtypes=[C.c_void_p];lib.arch3mf_size.restype=C.c_uint32
lib.arch3mf_validate_output.argtypes=[C.c_void_p,C.POINTER(C.c_uint8),C.c_uint32];lib.arch3mf_validate_output.restype=C.c_int32
records=[]
def emit(name,request,corrupt=None,expected=None,tamper=None,readback_error=None):
 c=lib.arch3mf_create();assert c
 try:
  assert lib.arch3mf_abi_version()==1
  for m in request['materialTable']['materials']:
   assert lib.arch3mf_add_material(c,m['name'].encode(),int(m['color'].lstrip('#')[:6]+'ff',16))>=0
  mesh=request['mesh'];part_results=[]
  for pi,p in enumerate(mesh['parts']):
   vertices=[];faces=[];mapping={}
   for ti,pid in enumerate(mesh['facePartIds']):
    if pid!=p['id']:continue
    for vi in mesh['faces'][ti*3:ti*3+3]:
     if vi not in mapping:
      mapping[vi]=len(vertices)//3;vertices.extend(mesh['vertices'][vi*3:vi*3+3])
     faces.append(mapping[vi])
   mat=pi
   if corrupt:vertices,faces,mat=corrupt(vertices,faces,mat)
   va=(C.c_double*len(vertices))(*vertices);fa=(C.c_uint32*len(faces))(*faces)
   result=lib.arch3mf_add_part(c,p['name'].encode(),va,len(vertices)//3,fa,len(faces)//3,mat)
   part_results.append(result)
  if expected:
   assert any(x<0 for x in part_results)
   error=lib.arch3mf_error(c).decode();assert expected in error,(name,error)
   assert lib.arch3mf_finish(c)<0 and lib.arch3mf_size(c)==0 and not lib.arch3mf_bytes(c)
   records.append({'name':name,'verdict':'pass','expectedRejection':expected,'actual':error})
  else:
   assert all(x>0 for x in part_results),lib.arch3mf_error(c)
   assert lib.arch3mf_finish(c)==0,lib.arch3mf_error(c)
   n=lib.arch3mf_size(c);assert n>0
   data=C.string_at(lib.arch3mf_bytes(c),n)
   if tamper:
    buf=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source,zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as target:
     for entry in source.infolist():
      value=source.read(entry.filename)
      if entry.filename=='3D/3dmodel.model':
       changed=tamper(value.decode()).encode();assert changed!=value;value=changed
      target.writestr(entry.filename,value)
    mutated=buf.getvalue();array=(C.c_uint8*len(mutated)).from_buffer_copy(mutated)
    assert lib.arch3mf_validate_output(c,array,len(mutated))<0
    error=lib.arch3mf_error(c).decode();assert readback_error in error,(name,error)
    assert lib.arch3mf_size(c)==0 and not lib.arch3mf_bytes(c)
    records.append({'name':name,'verdict':'pass','expectedRejection':readback_error,'actual':error})
   else:
    (out/(name+'.3mf')).write_bytes(data)
    records.append({'name':name,'verdict':'pass','bytes':n})
 finally:lib.arch3mf_destroy(c)
for name in ['cube','adjacent','ring']:
 r=json.loads((inputs/('bambu-'+name+'.request.json')).read_text());emit('native-'+name,r)
r=json.loads((inputs/'bambu-cube.request.json').read_text())
emit('nan',r,lambda v,f,m:([math.nan]+v[1:],f,m),'NONFINITE')
emit('index',r,lambda v,f,m:(v,[0xffffffff]+f[1:],m),'INDEX_BOUND')
emit('material',r,lambda v,f,m:(v,f,8),'MATERIAL_SLOT_MISMATCH')
emit('open',r,lambda v,f,m:(v,f[3:],m),'EDGE_NOT_MANIFOLD')
emit('degenerate',r,lambda v,f,m:(v,[f[0],f[0],f[2]]+f[3:],m),'DEGENERATE_FACE')
emit('inverted',r,lambda v,f,m:(v,[x for i in range(0,len(f),3) for x in [f[i],f[i+2],f[i+1]]],m),'NONPOSITIVE_COMPONENT_VOLUME')
# Two closed tetrahedra sharing only one vertex: edges pass; vertex link must reject.
tetra=[0,0,0,1,0,0,0,1,0,0,0,1,-1,0,0,0,-1,0,0,0,-1]
tf=[0,2,1,0,1,3,0,3,2,1,2,3,0,4,5,0,6,4,0,5,6,4,6,5]
emit('vertex-bowtie',r,lambda v,f,m:(tetra,tf,m),'VERTEX_NOT_MANIFOLD')
emit('readback-build-translation',r,tamper=lambda s:s.replace('<item objectid="2"','<item transform="1 0 0 0 1 0 0 0 1 1 0 0" objectid="2"'),readback_error='READBACK_BUILD_TRANSFORM')
emit('readback-component-translation',r,tamper=lambda s:s.replace('<component objectid="3"','<component transform="1 0 0 0 1 0 0 0 1 1 0 0" objectid="3"'),readback_error='READBACK_COMPONENT_TRANSFORM')
emit('readback-color',r,tamper=lambda s:re.sub(r'displaycolor="#[A-Fa-f0-9]{8}"','displaycolor="#FAFAFAFF"',s),readback_error='READBACK_MATERIAL_COLOR')
(out/'native-tests.json').write_text(json.dumps({'abi':1,'dll':str(dll),'records':records},indent=2))
print(json.dumps(records,indent=2))
